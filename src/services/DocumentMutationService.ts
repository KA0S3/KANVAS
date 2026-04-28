import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { connectivityService } from '@/services/connectivityService';
import { performanceMonitor } from '@/utils/performanceMonitor';
import { ConflictResolver, type Conflict, type ConflictResolution, type ConflictStrategy } from './ConflictResolver';
import type { Asset } from '@/components/AssetItem';
import type { BackgroundConfig } from '@/types/background';
import { compressBase64Thumbnail, isThumbnailTooLarge } from '@/utils/thumbnailCompression';

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
  | { op: 'UPDATE_CUSTOM_FIELDS'; assetId: string; customFields: Record<string, any> }
  | { op: 'UPDATE_GLOBAL_TAGS'; tags: Record<string, any>; assetTags: Record<string, string[]> }
  | { op: 'UPDATE_ASSET_TAGS'; assetId: string; tagIds: string[] };

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
  private currentVersion: number = 1;
  private currentProjectId: string | null = null;
  private syncInProgress: boolean = false;
  private syncStartTime: number = 0;
  private syncTimeoutMs: number = 30000; // 30 second timeout for sync operations
  private conflictResolver: ConflictResolver;
  private lastServerDocument: any = null;
  private conflictHistory: ConflictResolution[] = [];

  // NOTE: Following MASTER_PLAN.md - state-based tracking (NO operation queue)
  private changedAssets: Record<string, Asset> = {};
  private changedPositions: Record<string, { x: number; y: number; z_index: number }> = {};
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private positionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private isPositionSaveScheduled: boolean = false;
  private readonly AUTO_SAVE_MS = 40000; // 40 seconds
  private readonly MAX_BATCH_SIZE = 500; // Soft cap - flush if exceeded
  private readonly POSITION_SAVE_THROTTLE = 2000; // 2 seconds minimum (CRITICAL)

  // Cloud sync retry tracking (Phase 10)
  private cloudRetryCounts: Map<string, { count: number; lastRetry: number }> = new Map();
  private cloudRetryInterval: number | null = null;
  private isCloudRetryRunning: boolean = false;
  private onlineHandler: (() => void) | null = null;

  // RAM caching to reduce Supabase reads
  private documentCache: Map<string, { data: any; timestamp: number; version: number }> = new Map();
  private backgroundsCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache TTL

  // Compatibility layer fields
  private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
  private onSaveError: ((error: Error) => void) | null = null;

  private constructor() {
    // Initialize with server-wins strategy for MVP
    // Future: Make this configurable per-project or per-user
    this.conflictResolver = new ConflictResolver({
      strategy: 'server-wins',
      maxRetries: 3
    });

    // Listen for online/offline events to trigger sync
    const handleOnline = () => {
      console.log('[DocumentMutation] Connection restored, triggering sync');
      this.syncNow();
      // NOTE: Cloud retry polling NOT started automatically to prevent idle DB requests
      // It will be started only when there are failed uploads to retry
    };
    window.addEventListener('online', handleOnline);

    // Store handler reference for cleanup
    this.onlineHandler = handleOnline;

    // Cleanup on page unload to prevent memory leak
    window.addEventListener('beforeunload', () => {
      if (this.onlineHandler) {
        window.removeEventListener('online', this.onlineHandler);
      }
    });

    // NOTE: Cloud retry polling NOT started automatically to prevent Supabase quota flood
    // Call startCloudRetryPolling() explicitly when needed
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

  /**
   * Load document from Supabase with caching
   * NOTE: Following MASTER_PLAN.md - use load_project + load_assets instead of load_project_document
   * Reconstruct tree client-side using parent_id (NO giant JSON documents)
   */
  async loadDocument(projectId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Check cache first
      const cached = this.documentCache.get(projectId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        console.log('[DocumentMutation] Cache hit for document:', projectId);
        return { success: true, data: cached.data };
      }

      performanceMonitor.incrementDatabaseRequests();

      // Load project metadata (MASTER_PLAN.md Rule 1)
      const { data: projectData, error: projectError } = await supabase
        .rpc('load_project', {
          p_project_id: projectId
        });

      if (projectError || !projectData || projectData.length === 0) {
        console.error('[DocumentMutation] Failed to load project:', projectError);
        return { success: false, error: String(projectError) };
      }

      const project = projectData[0];
      const assetCount = project.asset_count || 0;

      // Load flat asset rows (MASTER_PLAN.md Rule 2)
      const { data: assetsData, error: assetsError } = await supabase
        .rpc('load_assets', {
          p_project_id: projectId,
          p_parent_id: null,
          p_load_all: assetCount < 100 // Load all if small project
        });

      if (assetsError) {
        console.error('[DocumentMutation] Failed to load assets:', assetsError);
        return { success: false, error: String(assetsError) };
      }

      // Build result matching expected structure
      const result = {
        world_document: {
          assets: assetsData || [],
          backgrounds: project.backgrounds || {},
          tags: project.tags_config || {}
        },
        version: project.last_version || 0,
        cover_config: project.backgrounds || {},
        updated_at: project.updated_at
      };

      // Cache the result
      this.documentCache.set(projectId, {
        data: result,
        timestamp: Date.now(),
        version: result.version
      });

      this.currentProjectId = projectId;
      this.currentVersion = result.version;

      return { success: true, data: result };
    } catch (error) {
      console.error('[DocumentMutation] Failed to load document:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Create a new project on the server if it doesn't exist
   * This is needed for new books created locally that need to be synced
   */
  async createProject(projectId: string, projectName: string, coverConfig?: any): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[DocumentMutation] Cannot create project - not authenticated');
        return false;
      }

      // First try to load the project to see if it exists
      const loadResult = await this.loadDocument(projectId);
      if (loadResult.success && loadResult.data) {
        console.log('[DocumentMutation] Project already exists:', projectId);
        return true;
      }

      // Create new project using RPC (bypasses RLS)
      console.log('[DocumentMutation] Creating project via RPC:', projectId);
      const { data, error } = await supabase
        .rpc('create_project', {
          p_name: projectName,
          p_description: null,
          p_cover_config: coverConfig || {},
          p_project_id: projectId
        });

      if (error) {
        console.error('[DocumentMutation] Failed to create project via RPC:', error);
        return false;
      }

      console.log('[DocumentMutation] Created new project:', data);
      this.currentProjectId = projectId;
      this.currentVersion = 1;
      return true;
    } catch (error) {
      console.error('[DocumentMutation] Error creating project:', error);
      return false;
    }
  }

  /**
   * Set project ID directly (for cases where we know the project exists or was just created)
   */
  setProjectId(projectId: string): void {
    this.currentProjectId = projectId;
  }

  /**
   * Get current project ID - used to check if a project is loaded before operations
   */
  getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }

  // NOTE: Following MASTER_PLAN.md - state-based tracking (NO operation queue)
  // Mark asset as changed (metadata)
  markAssetChanged(assetId: string, asset: Asset): void {
    // Migrate 'other' type to 'card' for database compatibility
    const migratedAsset = asset.type === 'other' ? { ...asset, type: 'card' as const } : asset;
    this.changedAssets[assetId] = migratedAsset;
    this.notifySubscribers();
  }

  // Mark position changes (for hot updates) - TRUE THROTTLE (not debounce)
  markPositionChanged(assetId: string, x: number, y: number, z_index: number = 0): void {
    this.changedPositions[assetId] = { x, y, z_index };

    if (!this.isPositionSaveScheduled) {
      this.isPositionSaveScheduled = true;
      this.positionSaveTimer = setTimeout(async () => {
        try {
          await this.savePositionChanges();
        } finally {
          this.isPositionSaveScheduled = false;
          this.positionSaveTimer = null;
        }
      }, this.POSITION_SAVE_THROTTLE);
    }

    this.notifySubscribers();
  }

  // Clear the change buffers
  clearChanges(): void {
    this.changedAssets = {};
    this.changedPositions = {};
  }

  // Mark asset as deleted (soft delete with deleted_at)
  markAssetDeleted(assetId: string): void {
    this.changedAssets[assetId] = {
      id: assetId,
      parentId: null,
      name: '',
      type: '',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      zIndex: 0,
      isExpanded: false,
      deleted_at: new Date().toISOString()
    } as any;
    this.notifySubscribers();
  }

  // Handle global project operations (backgrounds, viewport, tags) directly
  // NOTE: Following MASTER_PLAN.md - global operations use save_project RPC directly
  async saveGlobalBackgrounds(backgrounds: Record<string, any>): Promise<boolean> {
    if (!this.currentProjectId) return false;

    // Check if the current book still exists locally (might have been deleted)
    const bookStore = useBookStore.getState();
    if (!bookStore.books[this.currentProjectId]) {
      console.log('[DocumentMutation] Project no longer exists locally, skipping save');
      this.currentProjectId = null;
      return false;
    }

    try {
      performanceMonitor.incrementDatabaseRequests();
      console.log('[DocumentMutation] saveGlobalBackgrounds - Sending to RPC:', {
        p_project_id: this.currentProjectId,
        p_backgrounds: backgrounds,
        p_expected_version: this.currentVersion
      });
      const { error } = await supabase.rpc('save_project', {
        p_project_id: this.currentProjectId,
        p_backgrounds: backgrounds,
        p_expected_version: this.currentVersion
      });

      if (error) {
        console.error('[DocumentMutation] Failed to save global backgrounds:', error);
        console.error('[DocumentMutation] Error details:', JSON.stringify(error, null, 2));

        // Invalidate cache on any error
        this.documentCache.delete(this.currentProjectId);
        this.backgroundsCache.delete(this.currentProjectId);

        // If error is "Unauthorized", the project may have been deleted - don't retry
        if (error.message?.includes('Unauthorized')) {
          console.log('[DocumentMutation] Project may have been deleted, clearing currentProjectId');
          this.currentProjectId = null;
          return false;
        }

        // If version conflict, reload and retry
        if (error.message?.includes('Version conflict')) {
          console.log('[DocumentMutation] Version conflict detected, reloading document...');
          const loadResult = await this.loadDocument(this.currentProjectId);
          if (loadResult.success && loadResult.data) {
            this.currentVersion = loadResult.data.version;
            console.log('[DocumentMutation] Reloaded version:', this.currentVersion);

            // Retry with correct version
            console.log('[DocumentMutation] Retrying saveGlobalBackgrounds with correct version');
            const { error: retryError } = await supabase.rpc('save_project', {
              p_project_id: this.currentProjectId,
              p_backgrounds: backgrounds,
              p_expected_version: this.currentVersion
            });
            if (retryError) {
              console.error('[DocumentMutation] Retry failed:', retryError);
              return false;
            }
            this.currentVersion += 1;
            return true;
          }
        }
        return false;
      }

      this.currentVersion += 1;
      this.documentCache.delete(this.currentProjectId);
      this.backgroundsCache.delete(this.currentProjectId);

      return true;
    } catch (error) {
      console.error('[DocumentMutation] Error saving global backgrounds:', error);
      return false;
    }
  }

  async saveViewport(offsetX: number, offsetY: number, scale: number): Promise<boolean> {
    if (!this.currentProjectId) return false;

    // Check if the current book still exists locally (might have been deleted)
    const bookStore = useBookStore.getState();
    if (!bookStore.books[this.currentProjectId]) {
      console.log('[DocumentMutation] Project no longer exists locally, skipping save');
      this.currentProjectId = null;
      return false;
    }

    try {
      performanceMonitor.incrementDatabaseRequests();
      const { error } = await supabase.rpc('save_project', {
        p_project_id: this.currentProjectId,
        p_viewport: { offset: { x: offsetX, y: offsetY }, scale },
        p_expected_version: this.currentVersion
      });

      if (error) {
        console.error('[DocumentMutation] Failed to save viewport:', error);

        // Invalidate cache on any error
        this.documentCache.delete(this.currentProjectId);
        this.backgroundsCache.delete(this.currentProjectId);

        // If error is "Unauthorized", the project may have been deleted - don't retry
        if (error.message?.includes('Unauthorized')) {
          console.log('[DocumentMutation] Project may have been deleted, clearing currentProjectId');
          this.currentProjectId = null;
          return false;
        }

        // If version conflict, reload and retry
        if (error.message?.includes('Version conflict')) {
          console.log('[DocumentMutation] Version conflict detected, reloading document...');
          const loadResult = await this.loadDocument(this.currentProjectId);
          if (loadResult.success && loadResult.data) {
            this.currentVersion = loadResult.data.version;
            console.log('[DocumentMutation] Reloaded version:', this.currentVersion);

            // Retry with correct version
            const { error: retryError } = await supabase.rpc('save_project', {
              p_project_id: this.currentProjectId,
              p_viewport: { offset: { x: offsetX, y: offsetY }, scale },
              p_expected_version: this.currentVersion
            });
            if (retryError) {
              console.error('[DocumentMutation] Retry failed:', retryError);
              return false;
            }
            this.currentVersion += 1;
            return true;
          }
        }
        return false;
      }

      this.currentVersion += 1;
      this.documentCache.delete(this.currentProjectId);

      return true;
    } catch (error) {
      console.error('[DocumentMutation] Error saving viewport:', error);
      return false;
    }
  }

  async saveGlobalTags(tags: Record<string, any>): Promise<boolean> {
    if (!this.currentProjectId) return false;

    // Check if the current book still exists locally (might have been deleted)
    const bookStore = useBookStore.getState();
    if (!bookStore.books[this.currentProjectId]) {
      console.log('[DocumentMutation] Project no longer exists locally, skipping save');
      this.currentProjectId = null;
      return false;
    }

    try {
      performanceMonitor.incrementDatabaseRequests();
      const { error } = await supabase.rpc('save_project', {
        p_project_id: this.currentProjectId,
        p_tags_config: tags,
        p_expected_version: this.currentVersion
      });

      if (error) {
        console.error('[DocumentMutation] Failed to save global tags:', error);

        // Invalidate cache on any error
        this.documentCache.delete(this.currentProjectId);
        this.backgroundsCache.delete(this.currentProjectId);

        // If error is "Unauthorized", the project may have been deleted - don't retry
        if (error.message?.includes('Unauthorized')) {
          console.log('[DocumentMutation] Project may have been deleted, clearing currentProjectId');
          this.currentProjectId = null;
          return false;
        }

        // If version conflict, reload and retry
        if (error.message?.includes('Version conflict')) {
          console.log('[DocumentMutation] Version conflict detected, reloading document...');
          const loadResult = await this.loadDocument(this.currentProjectId);
          if (loadResult.success && loadResult.data) {
            this.currentVersion = loadResult.data.version;
            console.log('[DocumentMutation] Reloaded version:', this.currentVersion);

            // Retry with correct version
            const { error: retryError } = await supabase.rpc('save_project', {
              p_project_id: this.currentProjectId,
              p_tags_config: tags,
              p_expected_version: this.currentVersion
            });
            if (retryError) {
              console.error('[DocumentMutation] Retry failed:', retryError);
              return false;
            }
            this.currentVersion += 1;
            return true;
          }
        }
        return false;
      }

      this.currentVersion += 1;
      this.documentCache.delete(this.currentProjectId);

      return true;
    } catch (error) {
      console.error('[DocumentMutation] Error saving global tags:', error);
      return false;
    }
  }

  // Clear stuck sync flag (for recovery)
  clearSyncInProgress(): void {
    this.syncInProgress = false;
    console.log('[DocumentMutation] Cleared stuck sync flag');
  }

  // Immediate sync (for critical operations)
  async syncNow(): Promise<boolean> {
    if (this.syncInProgress) {
      console.log('[DocumentMutation] syncNow: sync in progress, skipping');
      return false;
    }
    if (!connectivityService.isOnline()) {
      console.log('[DocumentMutation] syncNow: offline, skipping');
      return false;
    }
    if (!this.currentProjectId) {
      console.log('[DocumentMutation] syncNow: no project loaded, skipping');
      return false;
    }

    const totalChanges = Object.keys(this.changedAssets).length + Object.keys(this.changedPositions).length;
    if (totalChanges === 0) {
      console.log('[DocumentMutation] syncNow: no changes, nothing to sync');
      return true;
    }

    console.log(`[DocumentMutation] syncNow: syncing ${totalChanges} changes`);
    return this.performSync();
  }

  // Main sync method
  private async performSync(): Promise<boolean> {
    if (!this.currentProjectId) {
      console.error('[DocumentMutation] No project loaded');
      return false;
    }

    this.syncInProgress = true;
    this.syncStartTime = Date.now();
    this.notifySubscribers();

    // Set timeout to clear stuck sync flag
    const syncTimeout = setTimeout(() => {
      if (this.syncInProgress) {
        console.warn('[DocumentMutation] Sync timeout - clearing stuck flag after', this.syncTimeoutMs, 'ms');
        this.syncInProgress = false;
        this.notifySubscribers();
      }
    }, this.syncTimeoutMs);

    try {
      // NOTE: Following MASTER_PLAN.md - save positions first (HOT updates), then metadata
      if (Object.keys(this.changedPositions).length > 0) {
        await this.savePositionChanges();
      }

      if (Object.keys(this.changedAssets).length > 0) {
        await this.saveMetadataChanges();
      }

      this.notifySubscribers();
      return true;
    } catch (error) {
      console.error('[DocumentMutation] Sync failed:', error);
      return false;
    } finally {
      clearTimeout(syncTimeout);
      this.syncInProgress = false;
      const syncDuration = Date.now() - this.syncStartTime;
      console.log(`[DocumentMutation] Sync completed in ${syncDuration}ms`);
    }
  }

  // Save position changes to Supabase (hot update - cheap)
  private async savePositionChanges(): Promise<void> {
    if (!this.currentProjectId || Object.keys(this.changedPositions).length === 0) return;

    const positions = Object.entries(this.changedPositions).map(([asset_id, pos]) => ({
      asset_id,
      x: Math.round(pos.x || 0),
      y: Math.round(pos.y || 0),
      z_index: Math.round(pos.z_index || 0)
    }));

    performanceMonitor.incrementDatabaseRequests();
    const { error } = await supabase.rpc('save_positions', {
      p_project_id: this.currentProjectId,
      p_positions: positions
    });

    // Only clear changes after successful save
    if (!error) {
      const keysSaved = Object.keys(this.changedPositions);
      keysSaved.forEach(key => delete this.changedPositions[key]);
    }

    if (error) {
      console.error('[DocumentMutation] Failed to save position changes:', error);
      
      // Invalidate cache on any error
      this.documentCache.delete(this.currentProjectId);
      this.backgroundsCache.delete(this.currentProjectId);
      
      // If error is "Unauthorized", the project might not exist yet
      // Try to create it and retry
      if (error.message?.includes('Unauthorized')) {
        console.log('[DocumentMutation] Project might not exist, attempting to create...');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const created = await this.createProject(this.currentProjectId, 'Untitled Project');
          if (created) {
            console.log('[DocumentMutation] Project created, retrying position save');
            const { error: retryError } = await supabase.rpc('save_positions', {
              p_project_id: this.currentProjectId,
              p_positions: positions
            });
            if (retryError) {
              console.error('[DocumentMutation] Retry failed:', retryError);
              throw retryError;
            }
            // Clear changes after successful save
            const keysSaved = Object.keys(this.changedPositions);
            keysSaved.forEach(key => delete this.changedPositions[key]);
            return;
          }
        }
      }
      throw error;
    }
  }

  // Save metadata changes to Supabase (full upsert)
  private async saveMetadataChanges(): Promise<void> {
    if (!this.currentProjectId || Object.keys(this.changedAssets).length === 0) return;

    // Process assets and compress thumbnails if needed
    const processedAssets = await Promise.all(
      Object.values(this.changedAssets).map(async (asset) => {
        let thumbnail = asset.thumbnail || null;
        
        // Compress thumbnail if it's too large
        if (thumbnail && isThumbnailTooLarge(thumbnail)) {
          try {
            thumbnail = await compressBase64Thumbnail(thumbnail);
            console.log(`[DocumentMutation] Compressed thumbnail for asset ${asset.id} from ${asset.thumbnail?.length} to ${thumbnail.length} bytes`);
          } catch (error) {
            console.warn(`[DocumentMutation] Failed to compress thumbnail for asset ${asset.id}:`, error);
            // Keep original thumbnail if compression fails
          }
        }
        
        const customFieldsObj: Record<string, any> = {
          customFields: asset.customFields || [],
          customFieldValues: asset.customFieldValues || [],
          tags: asset.tags || [],
          thumbnail,
          background: asset.background || null,
          description: asset.description || null,
          viewportDisplaySettings: asset.viewportDisplaySettings || {}
        };

        // Migrate 'other' type to 'card' for database compatibility
        const assetType = asset.type === 'other' ? 'card' : asset.type;

        return {
          asset_id: asset.id,
          parent_id: asset.parentId || null,
          name: asset.name,
          type: assetType,
          x: Math.round(asset.x || 0),
          y: Math.round(asset.y || 0),
          width: Math.round(asset.width || 0),
          height: Math.round(asset.height || 0),
          z_index: 0,
          is_expanded: asset.isExpanded || false,
          content: asset.content || null,
          background_config: asset.backgroundConfig || {},
          viewport_config: asset.viewportConfig || {},
          custom_fields: customFieldsObj
        };
      })
    );

    const changes = processedAssets;

    performanceMonitor.incrementDatabaseRequests();
    console.log('[DocumentMutation] saveMetadataChanges - Sending to RPC:', {
      p_project_id: this.currentProjectId,
      p_assets_count: changes.length,
      p_assets: changes,
      p_expected_version: this.currentVersion
    });
    const { error } = await supabase.rpc('save_assets', {
      p_project_id: this.currentProjectId,
      p_assets: changes,
      p_expected_version: this.currentVersion
    });

    // Only clear changes after successful save
    if (!error) {
      const keysSaved = Object.keys(this.changedAssets);
      keysSaved.forEach(key => delete this.changedAssets[key]);
    }

    if (error) {
      console.error('[DocumentMutation] Failed to save metadata changes:', error);
      console.error('[DocumentMutation] Error details:', JSON.stringify(error, null, 2));
      
      // Invalidate cache on any error
      this.documentCache.delete(this.currentProjectId);
      this.backgroundsCache.delete(this.currentProjectId);
      
      // If error is "Unauthorized", the project might not exist yet
      // Try to create it and retry
      if (error.message?.includes('Unauthorized')) {
        console.log('[DocumentMutation] Project might not exist, attempting to create...');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const created = await this.createProject(this.currentProjectId, 'Untitled Project');
          if (created) {
            console.log('[DocumentMutation] Project created, retrying metadata save');
            const { error: retryError } = await supabase.rpc('save_assets', {
              p_project_id: this.currentProjectId,
              p_assets: changes
              // No p_expected_version - let server handle it
            });
            if (retryError) {
              console.error('[DocumentMutation] Retry failed:', retryError);
              throw retryError;
            }
            // Reload version from server after successful save
            const loadResult = await this.loadDocument(this.currentProjectId);
            if (loadResult.success && loadResult.data) {
              this.currentVersion = loadResult.data.version;
            }
            // Clear changes after successful save
            const keysSaved = Object.keys(this.changedAssets);
            keysSaved.forEach(key => delete this.changedAssets[key]);
            return;
          }
        }
      }
      if (error.message?.includes('Version conflict')) {
        console.log('[DocumentMutation] Version conflict detected, reloading document...');
        const loadResult = await this.loadDocument(this.currentProjectId);
        if (loadResult.success && loadResult.data) {
          this.currentVersion = loadResult.data.version;
          console.log('[DocumentMutation] Reloaded version:', this.currentVersion);
          
          // Retry with correct version
          console.log('[DocumentMutation] Retrying saveMetadataChanges with correct version');
          const { error: retryError } = await supabase.rpc('save_assets', {
            p_project_id: this.currentProjectId,
            p_assets: changes,
            p_expected_version: this.currentVersion
          });
          if (retryError) {
            console.error('[DocumentMutation] Retry failed:', retryError);
            throw retryError;
          }
          this.currentVersion += 1;
          // Clear changes after successful save
          const keysSaved = Object.keys(this.changedAssets);
          keysSaved.forEach(key => delete this.changedAssets[key]);
          return;
        }
        throw error;
      }
      throw error;
    }

    // Update local version
    this.currentVersion += 1;

    // Invalidate document cache on successful write
    if (this.currentProjectId) {
      this.documentCache.delete(this.currentProjectId);
      this.backgroundsCache.delete(this.currentProjectId);
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
   * NOTE: Following MASTER_PLAN.md - simplified conflict resolution with state-based tracking
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

      // 2. Apply server document to local state (server-wins strategy)
      await this.applyServerDocument(serverDoc.data);

      // 3. Clear local changes (server-wins)
      this.clearChanges();

      // 4. Log resolution
      const totalChanges = Object.keys(this.changedAssets).length + Object.keys(this.changedPositions).length;
      console.log(`[DocumentMutation] Conflict resolved (server-wins): cleared ${totalChanges} local changes`);

      // 5. Notify user/system
      this.notifyConflictResolved({
        strategy: 'server-wins',
        appliedOperations: [],
        discardedOperations: [],
        conflicts: [],
        resolved: true
      });

      return true;
    } catch (error) {
      console.error('[DocumentMutation] Conflict resolution failed:', error);

      // Fallback: simple server-wins
      if (this.lastServerDocument) {
        await this.applyServerDocument(this.lastServerDocument);
        this.clearChanges();
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

    // Restore backgrounds from world_document.backgrounds to backgroundStore
    if (serverDoc.world_document?.backgrounds) {
      const backgroundStore = (await import('@/stores/backgroundStore')).useBackgroundStore.getState();
      const backgrounds = serverDoc.world_document.backgrounds;
      console.log('[DocumentMutation] Restoring', Object.keys(backgrounds).length, 'backgrounds from server');

      Object.entries(backgrounds).forEach(([key, config]) => {
        // Don't trigger cloud sync when restoring from cloud (avoid loop)
        // Directly update store state and localStorage
        const clonedConfig = backgroundStore.cloneConfig(config as BackgroundConfig);
        backgroundStore.setBackground(key, clonedConfig);
      });
    }

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
    const totalChanges = Object.keys(this.changedAssets).length + Object.keys(this.changedPositions).length;
    window.dispatchEvent(new CustomEvent('sync-conflict-failed', {
      detail: {
        error: String(error),
        projectId: this.currentProjectId,
        pendingChanges: totalChanges
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

  // =====================================================
  // COMPATIBILITY LAYER FOR changeTrackingService
  // =====================================================
  // These methods provide the same API as changeTrackingService
  // to allow gradual migration without breaking existing code

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return Object.keys(this.changedAssets).length > 0 || Object.keys(this.changedPositions).length > 0;
  }

  /**
   * Manual save trigger (flush immediately)
   */
  async manualSave(): Promise<void> {
    await this.syncNow();
  }

  /**
   * Set error callback for UI feedback on save failures
   */
  setOnErrorCallback(callback: (error: Error) => void): void {
    this.onSaveError = callback;
  }

  /**
   * Start auto-save with project ID
   */
  startAutoSave(projectId: string): void {
    this.setProjectId(projectId);
    // Auto-save is now handled by autosaveService which calls syncNow()
    console.log('[DocumentMutation] Auto-save started for project:', projectId);
  }

  /**
   * Set current project version (called after loading project)
   */
  setCurrentProjectVersion(version: number): void {
    this.currentVersion = version;
  }

  /**
   * Get current project version
   */
  getCurrentProjectVersion(): number {
    return this.currentVersion;
  }

  /**
   * Set up auth state listener to save before session expires
   */
  setupAuthListener(): void {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        console.log('Auth token refreshed');
      } else if (event === 'SIGNED_OUT') {
        console.warn('User signed out, attempting to save unsaved changes before clearing');
        try {
          await this.manualSave();
        } catch (error) {
          console.error('Failed to save on sign-out:', error);
        }
        this.clearChanges();
      }
    });
  }

  /**
   * Set up beforeunload handler for unsaved changes warning
   */
  setupBeforeUnloadHandler(): void {
    const handler = (e: BeforeUnloadEvent) => {
      if (this.hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = 'SAVE CHANGES BEFORE EXITING TAB';
      }
    };

    this.beforeUnloadHandler = handler;
    window.addEventListener('beforeunload', handler);
  }

  /**
   * Remove beforeunload handler
   */
  removeBeforeUnloadHandler(): void {
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
  }

  // Load backgrounds from server document (Phase 7) with RAM caching
  async loadBackgrounds(forceRefresh: boolean = false): Promise<Record<string, any> | null> {
    if (!this.currentProjectId) return null;

    const cacheKey = this.currentProjectId;

    // Check cache first
    if (!forceRefresh) {
      const cached = this.backgroundsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
        console.log('[DocumentMutation] Loading backgrounds from RAM cache:', cacheKey);
        return cached.data;
      }
    }

    try {
      const { data, error } = await supabase
        .rpc('load_backgrounds', {
          p_project_id: this.currentProjectId
        });

      if (error) throw error;
      if (!data || data.length === 0) return null;
      
      const backgrounds = data[0].backgrounds || {};

      // Update cache
      this.backgroundsCache.set(cacheKey, {
        data: backgrounds,
        timestamp: Date.now()
      });

      // Limit cache size
      if (this.backgroundsCache.size > 10) {
        const oldestKey = [...this.backgroundsCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
        this.backgroundsCache.delete(oldestKey);
      }

      return backgrounds;
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
   * Call explicitly when needed (not auto-started to prevent quota flood)
   */
  startCloudRetryPolling(): void {
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
    // Increased from 1s to 2s to reduce Supabase call frequency
    this.syncTimeout = window.setTimeout(() => {
      this.syncNow();
    }, 2000); // 2 second debounce
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
    const totalChanges = Object.keys(this.changedAssets).length + Object.keys(this.changedPositions).length;

    return {
      lastSyncTime: this.syncInProgress ? null : new Date(),
      syncEnabled: isAuthenticated && syncEnabled,
      pendingChanges: totalChanges > 0,
      onlineMode: isOnline,
      quotaExceeded: false,
      storageUsed: quota.used,
      storageLimit: quota.available,
      syncInProgress: this.syncInProgress,
      queuedItems: totalChanges,
      documentVersion: this.currentVersion
    };
  }
}

export const documentMutationService = DocumentMutationService.getInstance();

// Re-export conflict types for convenience
export type { Conflict, ConflictResolution, ConflictStrategy } from './ConflictResolver';
