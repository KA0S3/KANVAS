import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { connectivityService } from '@/services/connectivityService';
import { performanceMonitor } from '@/utils/performanceMonitor';
import { ConflictResolver, type Conflict, type ConflictResolution, type ConflictStrategy } from './ConflictResolver';
import type { Asset } from '@/components/AssetItem';

// Document operation types
export type DocumentOperation =
  | { op: 'CREATE_ASSET'; assetId: string; parentId?: string; name: string; type: string; position?: AssetPosition; children?: string[]; isExpanded?: boolean; customFields?: Record<string, any> }
  | { op: 'DELETE_ASSET'; assetId: string; parentId?: string }
  | { op: 'MOVE_ASSET'; assetId: string; oldParentId?: string; newParentId?: string }
  | { op: 'UPDATE_POSITION'; assetId: string; x: number; y: number; width: number; height: number; zIndex: number }
  | { op: 'UPDATE_METADATA'; assetId: string; name: string }
  | { op: 'UPDATE_VIEWPORT'; offsetX: number; offsetY: number; scale: number; currentAssetId?: string }
  | { op: 'UPDATE_BACKGROUND_CONFIG'; assetId: string; config: Record<string, any> }
  | { op: 'UPDATE_GLOBAL_BACKGROUNDS'; backgrounds: Record<string, Record<string, any>> }
  | { op: 'UPDATE_ASSET_BACKGROUND'; assetId: string; config: Record<string, any> }
  | { op: 'UPDATE_CUSTOM_FIELDS'; assetId: string; customFields: Record<string, any> };

interface AssetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface SyncStatus {
  lastSyncTime: Date | null;
  syncEnabled: boolean;
  pendingChanges: boolean;
  onlineMode: boolean;
  quotaExceeded: boolean;
  storageUsed: number;
  storageLimit: number;
  syncInProgress: boolean;
  queuedItems: number;
  documentVersion: number;
}

interface PendingOperation {
  id: string;
  operation: DocumentOperation;
  retryCount: number;
  lastRetryTime: number;
}

const MAX_BATCH_SIZE = 100;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000; // 1 second base delay for exponential backoff

// Cloud sync retry configuration
const CLOUD_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 5000,      // 5 seconds base delay
  maxDelayMs: 300000,     // 5 minutes max delay
  checkIntervalMs: 60000, // Check every minute
  backoffMultiplier: 2      // Exponential backoff multiplier
};

class DocumentMutationService {
  private static instance: DocumentMutationService;
  private subscribers: Set<(status: SyncStatus) => void> = new Set();
  private pendingOperations: PendingOperation[] = [];
  private currentVersion: number = 1;
  private currentProjectId: string | null = null;
  private syncInProgress: boolean = false;
  private offlineQueue: DocumentOperation[] = [];
  private conflictResolver: ConflictResolver;
  private lastServerDocument: any = null;
  private conflictHistory: ConflictResolution[] = [];

  // Cloud sync retry tracking (Phase 10)
  private cloudRetryCounts: Map<string, { count: number; lastRetry: number }> = new Map();
  private cloudRetryInterval: number | null = null;
  private isCloudRetryRunning: boolean = false;

  private constructor() {
    // Initialize with server-wins strategy for MVP
    // Future: Make this configurable per-project or per-user
    this.conflictResolver = new ConflictResolver({
      strategy: 'server-wins',
      maxRetries: 3
    });

    // Listen for online/offline events to trigger sync
    window.addEventListener('online', () => {
      console.log('[DocumentMutation] Connection restored, triggering sync');
      this.syncNow();
      // Also trigger cloud retry when back online
      this.startCloudRetryPolling();
    });

    // Start cloud retry polling (Phase 10)
    this.startCloudRetryPolling();
  }

  static getInstance(): DocumentMutationService {
    if (!DocumentMutationService.instance) {
      DocumentMutationService.instance = new DocumentMutationService();
    }
    return DocumentMutationService.instance;
  }

  /**
   * Set conflict resolution strategy
   */
  setConflictStrategy(strategy: ConflictStrategy): void {
    this.conflictResolver.setOptions({ strategy });
    console.log(`[DocumentMutation] Conflict strategy set to: ${strategy}`);
  }

  /**
   * Get current conflict resolution strategy
   */
  getConflictStrategy(): ConflictStrategy {
    return this.conflictResolver.getStrategy();
  }

  /**
   * Get conflict history for debugging/monitoring
   */
  getConflictHistory(): ConflictResolution[] {
    return [...this.conflictHistory];
  }

  /**
   * Clear conflict history
   */
  clearConflictHistory(): void {
    this.conflictHistory = [];
  }

  // Load document from server
  async loadDocument(projectId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase
        .rpc('load_project_document', { p_project_id: projectId });

      if (error) throw error;
      if (!data || data.length === 0) {
        return { success: false, error: 'Project not found' };
      }

      const doc = data[0];
      this.currentVersion = doc.version;
      this.currentProjectId = projectId;

      return { success: true, data: doc };
    } catch (error) {
      console.error('[DocumentMutation] Failed to load document:', error);
      return { success: false, error: String(error) };
    }
  }

  // Queue operation for batching with compression
  queueOperation(operation: DocumentOperation): void {
    // Compress operations: remove redundant operations on same asset
    this.compressOperations(operation);
    
    this.offlineQueue.push(operation);
    this.notifySubscribers();
    
    // Auto-sync after debounce
    this.scheduleSync();
  }

  // Compress operations by removing redundant ones
  private compressOperations(newOp: DocumentOperation): void {
    const assetId = this.getOperationAssetId(newOp);
    if (!assetId) return;

    // Remove previous operations that would be overridden by this new operation
    this.offlineQueue = this.offlineQueue.filter(existingOp => {
      const existingAssetId = this.getOperationAssetId(existingOp);
      
      // If different asset, keep it
      if (existingAssetId !== assetId) return true;
      
      // Same asset - check if we can compress
      // If new op is DELETE, remove all previous ops on this asset
      if (newOp.op === 'DELETE_ASSET') return false;
      
      // If new op is MOVE and existing is also MOVE, keep only the latest
      if (newOp.op === 'MOVE_ASSET' && existingOp.op === 'MOVE_ASSET') return false;
      
      // If new op is UPDATE_POSITION, remove previous UPDATE_POSITION
      if (newOp.op === 'UPDATE_POSITION' && existingOp.op === 'UPDATE_POSITION') return false;
      
      // If new op is UPDATE_METADATA with same asset, remove previous metadata updates
      if (newOp.op === 'UPDATE_METADATA' && existingOp.op === 'UPDATE_METADATA') return false;
      
      // Keep other operations
      return true;
    });
  }

  // Extract asset ID from operation for compression
  private getOperationAssetId(op: DocumentOperation): string | null {
    switch (op.op) {
      case 'CREATE_ASSET':
      case 'DELETE_ASSET':
      case 'MOVE_ASSET':
      case 'UPDATE_POSITION':
      case 'UPDATE_METADATA':
      case 'UPDATE_BACKGROUND_CONFIG':
      case 'UPDATE_ASSET_BACKGROUND':
      case 'UPDATE_CUSTOM_FIELDS':
        return op.assetId;
      case 'UPDATE_VIEWPORT':
      case 'UPDATE_GLOBAL_BACKGROUNDS':
        return null; // These are not asset-specific
      default:
        return null;
    }
  }

  // Immediate sync (for critical operations)
  async syncNow(): Promise<boolean> {
    if (this.syncInProgress) return false;
    if (!connectivityService.isOnline()) return false;
    if (this.offlineQueue.length === 0) return true;

    return this.performSync();
  }

  // Main sync method
  private async performSync(): Promise<boolean> {
    if (!this.currentProjectId) {
      console.error('[DocumentMutation] No project loaded');
      return false;
    }

    this.syncInProgress = true;
    this.notifySubscribers();

    try {
      // Chunk operations into batches
      const batches = this.chunkOperations(this.offlineQueue, MAX_BATCH_SIZE);
      
      for (const batch of batches) {
        const success = await this.sendBatch(batch);
        if (!success) {
          // Batch failed, keep remaining operations
          return false;
        }
        // Remove successfully sent operations
        this.offlineQueue = this.offlineQueue.slice(batch.length);
      }

      this.notifySubscribers();
      return true;
    } catch (error) {
      console.error('[DocumentMutation] Sync failed:', error);
      return false;
    } finally {
      this.syncInProgress = false;
    }
  }

  // Send batch to RPC with exponential backoff retry
  private async sendBatch(operations: DocumentOperation[], retryAttempt: number = 0): Promise<boolean> {
    try {
      performanceMonitor.incrementDatabaseRequests();
      
      const { data, error } = await supabase
        .rpc('save_document_operations', {
          p_project_id: this.currentProjectId,
          p_expected_version: this.currentVersion,
          p_operations: operations
        });

      if (error) throw error;
      
      const result = data[0];
      
      if (!result.success) {
        if (result.error?.includes('CONFLICT')) {
          // Version conflict - need to reload and replay
          await this.handleConflict();
          return false;
        }
        throw new Error(result.error);
      }

      // Update version
      this.currentVersion = result.new_version;
      return true;
    } catch (error) {
      console.error(`[DocumentMutation] Batch failed (attempt ${retryAttempt + 1}/${MAX_RETRIES}):`, error);
      
      // Check if we should retry with exponential backoff
      if (retryAttempt < MAX_RETRIES - 1) {
        const isRetryable = this.isRetryableError(error);
        
        if (isRetryable) {
          // Calculate exponential backoff delay: 1s, 2s, 4s, 8s, 16s
          const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryAttempt);
          console.log(`[DocumentMutation] Retrying in ${delayMs}ms...`);
          
          await this.sleep(delayMs);
          return this.sendBatch(operations, retryAttempt + 1);
        }
      }
      
      // Max retries reached or non-retryable error
      console.error('[DocumentMutation] Max retries exceeded or non-retryable error');
      return false;
    }
  }

  // Check if an error is retryable (network errors, timeouts, rate limits)
  private isRetryableError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = String(error.message || error).toLowerCase();
    
    // Retry on network errors
    if (errorMessage.includes('network') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('etimedout')) {
      return true;
    }
    
    // Retry on rate limits (429) or server errors (5xx)
    if (error.code === '429' || 
        (error.code && error.code >= 500 && error.code < 600)) {
      return true;
    }
    
    // Don't retry on auth errors (401), not found (404), or version conflicts
    if (error.code === '401' || 
        error.code === '403' || 
        error.code === '404' ||
        errorMessage.includes('conflict')) {
      return false;
    }
    
    // Default: retry unknown errors
    return true;
  }

  // Utility: Sleep for delays
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enhanced conflict handling with three-way merge
   */
  private async handleConflict(): Promise<boolean> {
    console.log('[DocumentMutation] Resolving conflict...');
    
    if (!this.currentProjectId) {
      console.error('[DocumentMutation] No project loaded for conflict resolution');
      return false;
    }

    try {
      // 1. Reload server document
      const serverDoc = await this.loadDocument(this.currentProjectId);
      if (!serverDoc.success || !serverDoc.data) {
        console.error('[DocumentMutation] Failed to load server document for conflict resolution');
        return false;
      }

      this.lastServerDocument = serverDoc.data;
      
      // 2. Get local operations that haven't synced
      const pendingOps = [...this.offlineQueue];
      
      // 3. Resolve conflicts using ConflictResolver
      const resolution = this.conflictResolver.resolve(
        pendingOps,
        serverDoc.data,
        this.lastServerDocument
      );

      // Store conflict history
      if (resolution.conflicts.length > 0) {
        this.conflictHistory.push(resolution);
        // Keep only last 50 conflicts
        if (this.conflictHistory.length > 50) {
          this.conflictHistory = this.conflictHistory.slice(-50);
        }
      }

      // 4. Apply server document to local state
      await this.applyServerDocument(serverDoc.data);
      
      // 5. Update offline queue with resolved operations
      this.offlineQueue = resolution.appliedOperations;
      
      // Log resolution details
      console.log(`[DocumentMutation] Conflict resolved:`, {
        strategy: resolution.strategy,
        totalOps: pendingOps.length,
        applied: resolution.appliedOperations.length,
        discarded: resolution.discardedOperations.length,
        conflicts: resolution.conflicts.length
      });

      // Log discarded operations for debugging
      if (resolution.discardedOperations.length > 0) {
        console.warn('[DocumentMutation] Discarded operations:', 
          resolution.discardedOperations.map(op => ({
            op: op.op,
            assetId: 'assetId' in op ? op.assetId : 'n/a'
          }))
        );
      }
      
      // 6. Notify user/system
      this.notifyConflictResolved(resolution);
      
      return true;
    } catch (error) {
      console.error('[DocumentMutation] Conflict resolution failed:', error);
      
      // Fallback: simple server-wins
      if (this.lastServerDocument) {
        await this.applyServerDocument(this.lastServerDocument);
        this.offlineQueue = [];
      }
      
      // Notify of failure
      this.notifyConflictFailed(error);
      
      return false;
    }
  }

  /**
   * Apply server document to local stores
   */
  private async applyServerDocument(serverDoc: any): Promise<void> {
    console.log('[DocumentMutation] Applying server document to local state');
    
    // Update version
    this.currentVersion = serverDoc.version;
    
    // Update asset store with server data
    const assetStore = (await import('@/stores/assetStore')).useAssetStore.getState();
    assetStore.loadWorldData(serverDoc.world_document);
    
    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent('document-synced', {
      detail: {
        version: serverDoc.version,
        assetCount: Object.keys(serverDoc.world_document?.assets || {}).length
      }
    }));
  }

  /**
   * Filter non-conflicting operations
   * Delegates to ConflictResolver
   */
  private filterNonConflictingOps(
    ops: DocumentOperation[],
    serverDoc: any
  ): DocumentOperation[] {
    return this.conflictResolver.filterNonConflictingOps(ops, serverDoc);
  }

  /**
   * Notify that conflict was resolved
   */
  private notifyConflictResolved(resolution: ConflictResolution): void {
    // Dispatch event for UI notification
    const event = new CustomEvent('sync-conflict-resolved', {
      detail: {
        strategy: resolution.strategy,
        appliedCount: resolution.appliedOperations.length,
        discardedCount: resolution.discardedOperations.length,
        conflictCount: resolution.conflicts.length,
        conflicts: resolution.conflicts.map(c => ({
          operation: c.operation.op,
          reason: c.reason,
          field: c.field
        }))
      }
    });
    
    window.dispatchEvent(event);
    
    // Also notify subscribers
    this.notifySubscribers();
  }

  /**
   * Notify that conflict resolution failed
   */
  private notifyConflictFailed(error: any): void {
    window.dispatchEvent(new CustomEvent('sync-conflict-failed', {
      detail: {
        error: String(error),
        projectId: this.currentProjectId,
        pendingOperations: this.offlineQueue.length
      }
    }));
  }

  // Check if an operation is still valid given the current server state
  private async isOperationStillValid(
    op: DocumentOperation, 
    worldDocument: any
  ): Promise<boolean> {
    const assets = worldDocument?.assets || {};
    
    switch (op.op) {
      case 'CREATE_ASSET':
        // CREATE is always valid (might recreate if deleted)
        return true;
        
      case 'DELETE_ASSET':
        // Only valid if asset still exists
        return !!assets[op.assetId];
        
      case 'MOVE_ASSET':
        // Only valid if asset still exists
        return !!assets[op.assetId];
        
      case 'UPDATE_POSITION':
      case 'UPDATE_METADATA':
      case 'UPDATE_BACKGROUND_CONFIG':
      case 'UPDATE_ASSET_BACKGROUND':
      case 'UPDATE_CUSTOM_FIELDS':
        // Only valid if asset still exists
        return !!assets[op.assetId];
        
      case 'UPDATE_VIEWPORT':
      case 'UPDATE_GLOBAL_BACKGROUNDS':
        // These are always valid (not asset-specific)
        return true;
        
      default:
        return false;
    }
  }

  // Query assets for viewport
  async queryAssetsByParent(parentId?: string): Promise<any[]> {
    if (!this.currentProjectId) return [];

    try {
      const { data, error } = await supabase
        .rpc('query_assets_by_parent', {
          p_project_id: this.currentProjectId,
          p_parent_asset_id: parentId || null
        });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[DocumentMutation] Query failed:', error);
      return [];
    }
  }

  // Load backgrounds from server document (Phase 7)
  async loadBackgrounds(): Promise<Record<string, any> | null> {
    if (!this.currentProjectId) return null;

    try {
      const { data, error } = await supabase
        .rpc('load_backgrounds', {
          p_project_id: this.currentProjectId
        });

      if (error) throw error;
      if (!data || data.length === 0) return null;
      
      return data[0].backgrounds || {};
    } catch (error) {
      console.error('[DocumentMutation] Failed to load backgrounds:', error);
      return null;
    }
  }

  // Register file after R2 upload
  async registerFile(
    assetId: string,
    r2Key: string,
    sizeBytes: number,
    mimeType: string,
    variants?: any[]
  ): Promise<boolean> {
    if (!this.currentProjectId) return false;

    try {
      const { data, error } = await supabase
        .rpc('register_file', {
          p_project_id: this.currentProjectId,
          p_asset_id: assetId,
          p_r2_key: r2Key,
          p_size_bytes: sizeBytes,
          p_mime_type: mimeType,
          p_variants: variants || []
        });

      if (error) throw error;
      return !!data;
    } catch (error) {
      console.error('[DocumentMutation] File registration failed:', error);
      return false;
    }
  }

  // =====================================================
  // PHASE 9: QUERY OPTIMIZATION & LARGE BOOK HANDLING
  // =====================================================

  /**
   * Query assets with cursor-based pagination (Phase 9)
   * For large books, use this instead of queryAssetsByParent
   * Returns paginated results with next_cursor for infinite scroll
   */
  async queryAssetsPaginated(
    parentId: string | null = null,
    cursor: string | null = null,
    limit: number = 100
  ): Promise<{
    assets: any[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    if (!this.currentProjectId) {
      return { assets: [], nextCursor: null, hasMore: false };
    }

    try {
      performanceMonitor.incrementDatabaseRequests();

      const { data, error } = await supabase
        .rpc('query_assets_by_parent_paginated', {
          p_project_id: this.currentProjectId,
          p_parent_asset_id: parentId,
          p_cursor: cursor,
          p_limit: Math.min(limit, 500) // Max 500 per page
        });

      if (error) throw error;

      if (!data || data.length === 0) {
        return { assets: [], nextCursor: null, hasMore: false };
      }

      // Extract pagination info from last row
      const lastRow = data[data.length - 1];
      const nextCursor = lastRow?.next_cursor || null;
      const hasMore = lastRow?.has_more || false;

      // Remove pagination fields from assets
      const assets = data.map(row => ({
        asset_id: row.asset_id,
        parent_asset_id: row.parent_asset_id,
        name: row.name,
        type: row.type,
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        z_index: row.z_index,
        is_expanded: row.is_expanded,
        background_config: row.background_config,
        viewport_config: row.viewport_config,
        cloud_status: row.cloud_status,
        cloud_path: row.cloud_path
      }));

      return { assets, nextCursor, hasMore };
    } catch (error) {
      console.error('[DocumentMutation] Paginated query failed:', error);
      return { assets: [], nextCursor: null, hasMore: false };
    }
  }

  /**
   * Load partial document for viewport (Phase 9)
   * For large books, only loads assets visible in viewport
   * Falls back to full document for books < 1000 assets
   */
  async loadDocumentViewport(
    viewport?: {
      x: number;
      y: number;
      width: number;
      height: number;
    },
    options: {
      rootOnly?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    data?: {
      world_document: any;
      version: number;
      cover_config: any;
      updated_at: string;
    };
    partial?: boolean;
    totalAssets?: number;
    loadedAssets?: number;
    error?: string;
  }> {
    if (!this.currentProjectId) {
      return { success: false, error: 'No project loaded' };
    }

    try {
      performanceMonitor.incrementDatabaseRequests();

      const { data, error } = await supabase
        .rpc('load_document_viewport', {
          p_project_id: this.currentProjectId,
          p_viewport_x: viewport?.x ?? null,
          p_viewport_y: viewport?.y ?? null,
          p_viewport_width: viewport?.width ?? null,
          p_viewport_height: viewport?.height ?? null,
          p_root_only: options.rootOnly ?? false
        });

      if (error) throw error;

      if (!data || data.length === 0) {
        return { success: false, error: 'Project not found' };
      }

      const doc = data[0];
      this.currentVersion = doc.version;

      return {
        success: true,
        data: {
          world_document: doc.world_document,
          version: doc.version,
          cover_config: doc.cover_config,
          updated_at: doc.updated_at
        },
        partial: doc.partial_load,
        totalAssets: doc.total_assets,
        loadedAssets: doc.loaded_assets
      };
    } catch (error) {
      console.error('[DocumentMutation] Viewport load failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Load specific asset chunk (Phase 9)
   * Used for segmented document loading
   */
  async loadAssetChunk(assetIds: string[]): Promise<{
    success: boolean;
    assets?: Record<string, any>;
    error?: string;
  }> {
    if (!this.currentProjectId) {
      return { success: false, error: 'No project loaded' };
    }

    if (!assetIds.length || assetIds.length > 1000) {
      return { success: false, error: 'Invalid chunk size (max 1000)' };
    }

    try {
      performanceMonitor.incrementDatabaseRequests();

      const { data, error } = await supabase
        .rpc('load_asset_chunk', {
          p_project_id: this.currentProjectId,
          p_asset_ids: assetIds
        });

      if (error) throw error;

      // Convert array to record
      const assets: Record<string, any> = {};
      (data || []).forEach((row: { asset_id: string; asset_data: any }) => {
        assets[row.asset_id] = row.asset_data;
      });

      return { success: true, assets };
    } catch (error) {
      console.error('[DocumentMutation] Load chunk failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get document manifest for segmented loading (Phase 9)
   * Returns chunk information for large documents
   */
  async getDocumentManifest(chunkSize: number = 1000): Promise<{
    success: boolean;
    manifest?: {
      chunks: Array<{
        index: number;
        size: number;
        assetIds: string[];
      }>;
      totalChunks: number;
      totalAssets: number;
      documentSizeBytes: number;
    };
    error?: string;
  }> {
    if (!this.currentProjectId) {
      return { success: false, error: 'No project loaded' };
    }

    try {
      performanceMonitor.incrementDatabaseRequests();

      const { data, error } = await supabase
        .rpc('get_document_manifest', {
          p_project_id: this.currentProjectId,
          p_chunk_size: chunkSize
        });

      if (error) throw error;

      if (!data || data.length === 0) {
        return { success: false, error: 'Project not found' };
      }

      const chunks = data.map((row: any) => ({
        index: row.chunk_index,
        size: row.chunk_size,
        assetIds: row.asset_ids
      }));

      return {
        success: true,
        manifest: {
          chunks,
          totalChunks: data[0]?.total_chunks || 0,
          totalAssets: data[0]?.total_assets || 0,
          documentSizeBytes: data[0]?.document_size_bytes || 0
        }
      };
    } catch (error) {
      console.error('[DocumentMutation] Get manifest failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Queue operation on server for execution with concurrency control (Phase 9)
   * Prevents connection pool exhaustion
   * Note: Different from local queueOperation - this queues on the server
   */
  async queueServerOperation(
    operationType: string,
    operationData: Record<string, any>,
    priority: number = 5
  ): Promise<{
    success: boolean;
    queueId?: string;
    status?: string;
    error?: string;
  }> {
    if (!this.currentProjectId) {
      return { success: false, error: 'No project loaded' };
    }

    try {
      const { data, error } = await supabase
        .rpc('queue_operation', {
          p_project_id: this.currentProjectId,
          p_operation_type: operationType,
          p_operation_data: operationData,
          p_priority: Math.max(1, Math.min(10, priority)) // Clamp 1-10
        });

      if (error) throw error;

      return {
        success: true,
        queueId: data,
        status: 'queued'
      };
    } catch (error) {
      console.error('[DocumentMutation] Queue server operation failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get queued operations status from server (Phase 9)
   */
  async getQueuedOperations(projectId?: string, limit: number = 50): Promise<{
    success: boolean;
    operations?: Array<{
      queueId: string;
      operationType: string;
      status: string;
      priority: number;
      createdAt: string;
      startedAt?: string;
      retryCount: number;
    }>;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase
        .rpc('get_queued_operations', {
          p_project_id: projectId || this.currentProjectId,
          p_limit: limit
        });

      if (error) throw error;

      return {
        success: true,
        operations: (data || []).map((row: any) => ({
          queueId: row.queue_id,
          operationType: row.operation_type,
          status: row.status,
          priority: row.priority,
          createdAt: row.created_at,
          startedAt: row.started_at,
          retryCount: row.retry_count
        }))
      };
    } catch (error) {
      console.error('[DocumentMutation] Get queue failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Query asset tree recursively (Phase 9)
   * Efficient for rendering large trees
   */
  async queryAssetTree(
    rootAssetId?: string,
    maxDepth: number = 10
  ): Promise<{
    success: boolean;
    tree?: Array<{
      assetId: string;
      parentAssetId: string | null;
      name: string;
      type: string;
      depth: number;
      path: string;
      hasChildren: boolean;
    }>;
    error?: string;
  }> {
    if (!this.currentProjectId) {
      return { success: false, error: 'No project loaded' };
    }

    try {
      performanceMonitor.incrementDatabaseRequests();

      const { data, error } = await supabase
        .rpc('query_asset_tree', {
          p_project_id: this.currentProjectId,
          p_root_asset_id: rootAssetId || null,
          p_max_depth: maxDepth
        });

      if (error) throw error;

      return {
        success: true,
        tree: (data || []).map((row: any) => ({
          assetId: row.asset_id,
          parentAssetId: row.parent_asset_id,
          name: row.name,
          type: row.type,
          depth: row.depth,
          path: row.path,
          hasChildren: row.has_children
        }))
      };
    } catch (error) {
      console.error('[DocumentMutation] Query tree failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get large book metrics and recommendations (Phase 9)
   * Monitor performance and get loading strategy recommendations
   */
  async getLargeBookMetrics(): Promise<{
    success: boolean;
    metrics?: Record<string, {
      value: string;
      warningLevel: 'ok' | 'warning' | 'critical';
    }>;
    recommendedStrategy?: 'full_load' | 'viewport_load' | 'segmented_load';
    error?: string;
  }> {
    if (!this.currentProjectId) {
      return { success: false, error: 'No project loaded' };
    }

    try {
      const { data, error } = await supabase
        .rpc('get_large_book_metrics', {
          p_project_id: this.currentProjectId
        });

      if (error) throw error;

      const metrics: Record<string, { value: string; warningLevel: 'ok' | 'warning' | 'critical' }> = {};
      let recommendedStrategy: 'full_load' | 'viewport_load' | 'segmented_load' = 'full_load';

      (data || []).forEach((row: any) => {
        metrics[row.metric_name] = {
          value: row.metric_value,
          warningLevel: row.warning_level
        };
        if (row.metric_name === 'recommended_strategy') {
          recommendedStrategy = row.metric_value;
        }
      });

      return { success: true, metrics, recommendedStrategy };
    } catch (error) {
      console.error('[DocumentMutation] Get metrics failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Determine optimal loading strategy based on book size (Phase 9)
   */
  async getOptimalLoadingStrategy(): Promise<{
    strategy: 'full' | 'viewport' | 'segmented';
    reason: string;
    assetCount?: number;
    documentSizeMB?: number;
  }> {
    const metrics = await this.getLargeBookMetrics();

    if (!metrics.success) {
      // Default to full load if metrics unavailable
      return {
        strategy: 'full',
        reason: 'Failed to get metrics, defaulting to full load'
      };
    }

    const assetCount = parseInt(metrics.metrics?.asset_count?.value || '0');
    const docSizeMB = parseFloat(metrics.metrics?.document_size_mb?.value || '0');
    const recommended = metrics.recommendedStrategy;

    if (recommended === 'segmented_load' || docSizeMB > 4) {
      return {
        strategy: 'segmented',
        reason: `Document size ${docSizeMB.toFixed(2)}MB exceeds 4MB threshold`,
        assetCount,
        documentSizeMB: docSizeMB
      };
    }

    if (recommended === 'viewport_load' || assetCount > 1000) {
      return {
        strategy: 'viewport',
        reason: `Asset count ${assetCount} exceeds 1000 threshold`,
        assetCount,
        documentSizeMB: docSizeMB
      };
    }

    return {
      strategy: 'full',
      reason: `Small book: ${assetCount} assets, ${docSizeMB.toFixed(2)}MB`,
      assetCount,
      documentSizeMB: docSizeMB
    };
  }

  // =====================================================
  // PHASE 10: CLOUD SYNC TRACKING
  // =====================================================

  /**
   * Start periodic cloud retry polling
   * Runs every minute to check for failed uploads
   */
  private startCloudRetryPolling(): void {
    if (this.cloudRetryInterval) return; // Already running
    
    console.log('[DocumentMutation] Starting cloud retry polling');
    
    this.cloudRetryInterval = window.setInterval(async () => {
      if (!connectivityService.isOnline() || !this.currentProjectId) return;
      
      await this.processCloudRetryQueue();
    }, CLOUD_RETRY_CONFIG.checkIntervalMs);
  }

  /**
   * Stop cloud retry polling
   */
  stopCloudRetryPolling(): void {
    if (this.cloudRetryInterval) {
      window.clearInterval(this.cloudRetryInterval);
      this.cloudRetryInterval = null;
      console.log('[DocumentMutation] Stopped cloud retry polling');
    }
  }

  /**
   * Process cloud retry queue
   * Fetches failed uploads and retries them with exponential backoff
   */
  private async processCloudRetryQueue(): Promise<void> {
    if (this.isCloudRetryRunning) return;
    this.isCloudRetryRunning = true;

    try {
      const syncQueue = await this.getSyncQueue(50);
      
      for (const item of syncQueue) {
        // Check retry count to prevent infinite loops
        const retryInfo = this.cloudRetryCounts.get(item.asset_id);
        const retryCount = retryInfo?.count || 0;
        
        if (retryCount >= CLOUD_RETRY_CONFIG.maxRetries) {
          console.warn(`[DocumentMutation] Max retries exceeded for asset ${item.asset_id}, skipping`);
          continue;
        }

        // Check if enough time has passed since last retry (exponential backoff)
        const now = Date.now();
        const lastRetry = retryInfo?.lastRetry || 0;
        const delayMs = Math.min(
          CLOUD_RETRY_CONFIG.baseDelayMs * Math.pow(CLOUD_RETRY_CONFIG.backoffMultiplier, retryCount),
          CLOUD_RETRY_CONFIG.maxDelayMs
        );
        
        if (now - lastRetry < delayMs) {
          continue; // Too soon, skip this item
        }

        // Update retry tracking
        this.cloudRetryCounts.set(item.asset_id, {
          count: retryCount + 1,
          lastRetry: now
        });

        // Dispatch retry event for R2UploadService to handle
        window.dispatchEvent(new CustomEvent('cloud-retry-upload', {
          detail: {
            assetId: item.asset_id,
            retryCount: retryCount + 1,
            cloudError: item.cloud_error
          }
        }));
      }
    } catch (error) {
      console.error('[DocumentMutation] Cloud retry queue processing failed:', error);
    } finally {
      this.isCloudRetryRunning = false;
    }
  }

  /**
   * Get sync queue for retry
   * Returns assets with 'failed' or 'uploading' status
   */
  async getSyncQueue(limit: number = 50): Promise<Array<{
    asset_id: string;
    name: string;
    cloud_status: string;
    cloud_error: string | null;
    retry_count: number;
  }>> {
    if (!this.currentProjectId) return [];

    try {
      const { data, error } = await supabase
        .rpc('get_sync_queue', {
          p_project_id: this.currentProjectId,
          p_limit: limit
        });

      if (error) throw error;
      
      // Merge with local retry counts
      return (data || []).map(item => {
        const retryInfo = this.cloudRetryCounts.get(item.asset_id);
        return {
          ...item,
          retry_count: retryInfo?.count || 0
        };
      });
    } catch (error) {
      console.error('[DocumentMutation] Get sync queue failed:', error);
      return [];
    }
  }

  /**
   * Get failed uploads
   * Returns assets with 'failed' status only
   */
  async getFailedUploads(): Promise<Array<{
    assetId: string;
    name: string;
    cloudStatus: string;
    cloudError: string | null;
  }>> {
    if (!this.currentProjectId) return [];

    try {
      const { data, error } = await supabase
        .rpc('get_failed_uploads', {
          p_project_id: this.currentProjectId
        });

      if (error) throw error;
      
      return (data || []).map(item => ({
        assetId: item.asset_id,
        name: item.name,
        cloudStatus: item.cloud_status,
        cloudError: item.cloud_error
      }));
    } catch (error) {
      console.error('[DocumentMutation] Get failed uploads failed:', error);
      return [];
    }
  }

  /**
   * Update cloud status for an asset
   * Called after upload success/failure
   */
  async updateCloudStatus(
    assetId: string,
    status: 'local' | 'uploading' | 'synced' | 'failed',
    error?: string
  ): Promise<boolean> {
    try {
      const { error: rpcError } = await supabase
        .rpc('update_cloud_status', {
          p_asset_id: assetId,
          p_status: status,
          p_error: error || null
        });

      if (rpcError) throw rpcError;

      // Clear retry count on successful sync
      if (status === 'synced') {
        this.cloudRetryCounts.delete(assetId);
      }

      return true;
    } catch (err) {
      console.error('[DocumentMutation] Update cloud status failed:', err);
      return false;
    }
  }

  /**
   * Get uploads by status
   * Useful for manual retry UI
   */
  async getUploadsByStatus(
    status: 'local' | 'uploading' | 'synced' | 'failed',
    limit: number = 100
  ): Promise<Array<{
    assetId: string;
    name: string;
    type: string;
    cloudStatus: string;
    cloudError: string | null;
    updatedAt: string;
  }>> {
    if (!this.currentProjectId) return [];

    try {
      const { data, error } = await supabase
        .rpc('get_uploads_by_status', {
          p_project_id: this.currentProjectId,
          p_status: status,
          p_limit: limit
        });

      if (error) throw error;
      
      return (data || []).map(item => ({
        assetId: item.asset_id,
        name: item.name,
        type: item.type,
        cloudStatus: item.cloud_status,
        cloudError: item.cloud_error,
        updatedAt: item.updated_at
      }));
    } catch (error) {
      console.error('[DocumentMutation] Get uploads by status failed:', error);
      return [];
    }
  }

  /**
   * Get cloud sync summary for current project
   * Useful for status indicators
   */
  async getCloudSyncSummary(): Promise<{
    totalAssets: number;
    localCount: number;
    uploadingCount: number;
    syncedCount: number;
    failedCount: number;
    lastFailedAt: string | null;
  } | null> {
    if (!this.currentProjectId) return null;

    try {
      const { data, error } = await supabase
        .rpc('get_cloud_sync_summary', {
          p_project_id: this.currentProjectId
        });

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const row = data[0];
      return {
        totalAssets: Number(row.total_assets),
        localCount: Number(row.local_count),
        uploadingCount: Number(row.uploading_count),
        syncedCount: Number(row.synced_count),
        failedCount: Number(row.failed_count),
        lastFailedAt: row.last_failed_at
      };
    } catch (error) {
      console.error('[DocumentMutation] Get cloud sync summary failed:', error);
      return null;
    }
  }

  /**
   * Bulk update cloud status for multiple assets
   * Used when batch operations complete
   */
  async bulkUpdateCloudStatus(
    assetIds: string[],
    status: 'local' | 'uploading' | 'synced' | 'failed',
    error?: string
  ): Promise<number> {
    if (!this.currentProjectId) return 0;
    
    // Limit to 100 per batch
    if (assetIds.length > 100) {
      console.warn('[DocumentMutation] Bulk update limited to 100 assets');
      assetIds = assetIds.slice(0, 100);
    }

    try {
      const { data, error: rpcError } = await supabase
        .rpc('bulk_update_cloud_status', {
          p_project_id: this.currentProjectId,
          p_asset_ids: assetIds,
          p_status: status,
          p_error: error || null
        });

      if (rpcError) throw rpcError;

      // Clear retry counts for successfully synced assets
      if (status === 'synced') {
        assetIds.forEach(id => this.cloudRetryCounts.delete(id));
      }

      return data || 0;
    } catch (err) {
      console.error('[DocumentMutation] Bulk update cloud status failed:', err);
      return 0;
    }
  }

  /**
   * Reset retry count for an asset
   * Called before manual retry
   */
  resetCloudRetryCount(assetId: string): void {
    this.cloudRetryCounts.delete(assetId);
    console.log(`[DocumentMutation] Reset retry count for asset ${assetId}`);
  }

  /**
   * Get retry information for debugging
   */
  getCloudRetryInfo(): Map<string, { count: number; lastRetry: number }> {
    return new Map(this.cloudRetryCounts);
  }

  // Utility: Chunk operations
  private chunkOperations(ops: DocumentOperation[], size: number): DocumentOperation[][] {
    const chunks: DocumentOperation[][] = [];
    for (let i = 0; i < ops.length; i += size) {
      chunks.push(ops.slice(i, i + size));
    }
    return chunks;
  }

  // Utility: Debounced sync scheduling
  private syncTimeout: number | null = null;
  private scheduleSync(): void {
    if (this.syncTimeout) {
      window.clearTimeout(this.syncTimeout);
    }
    this.syncTimeout = window.setTimeout(() => {
      this.syncNow();
    }, 1000); // 1 second debounce
  }

  // Subscribe to status changes
  subscribe(callback: (status: SyncStatus) => void): () => void {
    this.subscribers.add(callback);
    callback(this.getStatus()); // Initial state
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers(): void {
    const status = this.getStatus();
    this.subscribers.forEach(cb => cb(status));
  }

  getStatus(): SyncStatus {
    const { syncEnabled, quota } = useCloudStore.getState();
    const isOnline = connectivityService.isOnline();
    const { isAuthenticated } = useAuthStore.getState();

    return {
      lastSyncTime: this.syncInProgress ? null : new Date(),
      syncEnabled: isAuthenticated && syncEnabled,
      pendingChanges: this.offlineQueue.length > 0,
      onlineMode: isOnline,
      quotaExceeded: false,
      storageUsed: quota.used,
      storageLimit: quota.available,
      syncInProgress: this.syncInProgress,
      queuedItems: this.offlineQueue.length,
      documentVersion: this.currentVersion
    };
  }
}

export const documentMutationService = DocumentMutationService.getInstance();

// Re-export conflict types for convenience
export type { Conflict, ConflictResolution, ConflictStrategy } from './ConflictResolver';
