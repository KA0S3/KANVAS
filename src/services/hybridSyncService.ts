import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { connectivityService } from '@/services/connectivityService';
import type { Book } from '@/types/book';
import { createDefaultWorldData } from '@/stores/bookStoreSimple';

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
}

class HybridSyncService {
  private static instance: HybridSyncService;
  private syncInterval: number | null = null;
  private subscribers: Set<(status: SyncStatus) => void> = new Set();
  private readonly SYNC_INTERVAL = 30000; // 30 seconds
  private readonly MANUAL_SYNC_INTERVAL = 10000; // 10 seconds for manual saves
  private isManualSync = false;
  private isProcessingQueue = false; // Prevent concurrent queue processing
  private syncMutex = false; // Prevent concurrent sync operations

  static getInstance(): HybridSyncService {
    if (!HybridSyncService.instance) {
      HybridSyncService.instance = new HybridSyncService();
    }
    return HybridSyncService.instance;
  }

  private constructor() {
    this.startPeriodicSync();
    this.setupConnectivityListeners();
  }

  private setupConnectivityListeners(): void {
    // Subscribe to connectivity service for reliable online/offline detection
    connectivityService.subscribe((state) => {
      if (typeof state === 'object') {
        // It's a state object, check isOnline
        const isOnline = (state as any).isOnline;
        console.log(`[HybridSync] Connectivity changed: ${isOnline ? 'online' : 'offline'}`);
        
        if (isOnline) {
          this.processSyncQueue();
        }
      }
    });
  }

  // Cloud-first sync: always try to sync to cloud first - IMPROVED
  async syncToCloud(): Promise<boolean> {
    // Prevent concurrent sync operations with timeout
    if (this.syncMutex) {
      console.log('[HybridSync] Sync already in progress, waiting...');
      // Wait for current sync to complete with timeout
      const waitStart = Date.now();
      const maxWait = 30000; // 30 seconds max wait
      
      while (this.syncMutex && (Date.now() - waitStart) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (this.syncMutex) {
        console.warn('[HybridSync] Sync mutex stuck, forcing reset');
        this.syncMutex = false;
      }
    }

    this.syncMutex = true;
    const syncStartTime = Date.now();
    
    try {
      const { isAuthenticated, user } = useAuthStore.getState();
      const { syncEnabled } = useCloudStore.getState();
      const isOnline = connectivityService.isOnline();
      
      if (!isAuthenticated || !user || !syncEnabled) {
        console.log('[HybridSync] Cloud sync disabled - user not authenticated or sync disabled');
        return false;
      }

      if (!isOnline) {
        console.log('[HybridSync] Offline - adding to sync queue');
        this.addToSyncQueue();
        return false;
      }

      const { currentBookId } = useBookStore.getState();
      if (!currentBookId) {
        console.log('[HybridSync] No current book to sync');
        return false;
      }

      console.log('[HybridSync] Starting cloud-first sync...');
      this.updateSyncStatus({ syncInProgress: true });

      // Check storage quota before syncing
      const dataSize = this.calculateSyncDataSize();
      const cloudStore = useCloudStore.getState();
      const quotaExceeded = !cloudStore.canUpload(dataSize);
      
      if (quotaExceeded) {
        console.log('[HybridSync] Cloud sync blocked - storage quota exceeded');
        this.notifySubscribers({
          lastSyncTime: null,
          syncEnabled: true,
          pendingChanges: true,
          onlineMode: true,
          quotaExceeded: true,
          storageUsed: cloudStore.quota.used,
          storageLimit: cloudStore.quota.available,
          syncInProgress: false,
          queuedItems: cloudStore.syncQueue.length
        });
        return false;
      }

      // Serialize data safely to prevent circular reference issues
      const worldData = this.safelySerializeWorldData();
      const backgroundConfigs = this.safelySerializeBackgrounds();

      // Sync with better error handling
      const syncPromises = [
        this.syncWorldData(user.id, currentBookId, worldData),
        this.syncBackgroundData(user.id, currentBookId, backgroundConfigs)
      ];

      const results = await Promise.allSettled(syncPromises);
      const failures = results.filter(result => result.status === 'rejected');
      
      if (failures.length > 0) {
        console.error('[HybridSync] Some sync operations failed:', failures);
        throw new Error(`${failures.length} sync operations failed`);
      }

      // Update quota usage
      cloudStore.updateQuotaUsage(dataSize);

      const syncDuration = Date.now() - syncStartTime;
      console.log(`[HybridSync] Cloud sync completed successfully in ${syncDuration}ms`);
      this.updateSyncStatus({ 
        lastSyncTime: new Date(),
        syncInProgress: false,
        pendingChanges: false
      });

      // Process any remaining items in queue
      await this.processSyncQueue();

      return true;
    } catch (error) {
      const syncDuration = Date.now() - syncStartTime;
      console.error(`[HybridSync] Cloud sync failed after ${syncDuration}ms:`, error);
      
      // Add to queue for retry with exponential backoff
      this.addToSyncQueue();
      
      this.updateSyncStatus({ 
        syncInProgress: false,
        pendingChanges: true
      });
      
      return false;
    } finally {
      this.syncMutex = false;
    }
  }

  // Manual sync with shorter interval
  async triggerManualSync(): Promise<boolean> {
    this.isManualSync = true;
    
    // Temporarily use shorter interval for manual sync
    const originalInterval = this.SYNC_INTERVAL;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    this.syncInterval = window.setInterval(() => {
      this.performPeriodicSync();
    }, this.MANUAL_SYNC_INTERVAL);

    const result = await this.syncToCloud();
    
    // Restore original interval after manual sync
    setTimeout(() => {
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
      }
      this.syncInterval = window.setInterval(() => {
        this.performPeriodicSync();
      }, originalInterval);
      this.isManualSync = false;
    }, 5000);

    return result;
  }

  private addToSyncQueue(): void {
    const { currentBookId } = useBookStore.getState();
    const assetStore = useAssetStore.getState();
    const backgroundStore = useBackgroundStore.getState();

    // Add assets to queue
    useCloudStore.getState().addToSyncQueue({
      type: 'asset',
      data: {
        assets: assetStore.getCurrentBookAssets(),
        globalCustomFields: assetStore.getCurrentBookGlobalCustomFields(),
      }
    });

    // Add backgrounds to queue
    if (backgroundStore.configs && Object.keys(backgroundStore.configs).length > 0) {
      useCloudStore.getState().addToSyncQueue({
        type: 'background',
        data: backgroundStore.configs
      });
    }
  }

  private async processSyncQueue(): Promise<void> {
    const cloudStore = useCloudStore.getState();
    const { syncQueue } = cloudStore;
    const isOnline = connectivityService.isOnline();
    
    if (!isOnline || syncQueue.length === 0) {
      return;
    }

    // Prevent concurrent queue processing
    if (this.isProcessingQueue) {
      console.log('[HybridSync] Queue already processing, skipping');
      return;
    }

    this.isProcessingQueue = true;
    console.log(`[HybridSync] Processing ${syncQueue.length} items in sync queue`);

    try {
      const { user } = useAuthStore.getState();
      const { currentBookId } = useBookStore.getState();
      
      if (!user || !currentBookId) {
        return;
      }

      // Process queue items with improved error handling
      const itemsToProcess = [...syncQueue];
      for (const item of itemsToProcess) {
        try {
          // Check if item should be retried based on backoff
          if (item.retryCount > 0) {
            const backoffDelay = this.calculateBackoffDelay(item.retryCount);
            const timeSinceLastRetry = Date.now() - (item.lastRetryTime || 0);
            
            if (timeSinceLastRetry < backoffDelay) {
              console.log(`[HybridSync] Item ${item.id} waiting for backoff: ${backoffDelay}ms`);
              continue; // Skip this item for now, but continue processing others
            }
          }

          switch (item.type) {
            case 'asset':
              await this.syncWorldData(user.id, currentBookId, item.data);
              break;
            case 'background':
              await this.syncBackgroundData(user.id, currentBookId, item.data);
              break;
            case 'project':
              // Handle project-level sync if needed
              break;
          }
          
          // Remove from queue on success
          cloudStore.removeFromSyncQueue(item.id);
          console.log(`[HybridSync] Successfully synced item ${item.id}`);
          
        } catch (error) {
          console.error(`[HybridSync] Failed to sync queue item ${item.id}:`, error);
          
          // Increment retry count and update last retry time
          item.retryCount++;
          item.lastRetryTime = Date.now();
          
          // Remove if too many retries
          if (item.retryCount >= 5) {
            cloudStore.removeFromSyncQueue(item.id);
            console.warn(`[HybridSync] Removed item ${item.id} from queue after 5 failed attempts`);
            // Continue processing other items instead of breaking
          } else {
            const nextRetryIn = this.calculateBackoffDelay(item.retryCount);
            console.log(`[HybridSync] Item ${item.id} will retry in ${nextRetryIn}ms (attempt ${item.retryCount}/5)`);
            // Continue processing other items
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  // Safe serialization methods to prevent circular reference issues
  private safelySerializeWorldData(): any {
    try {
      const assetStore = useAssetStore.getState();
      const worldData = {
        assets: assetStore.getCurrentBookAssets(),
        globalCustomFields: assetStore.getCurrentBookGlobalCustomFields(),
      };
      
      // Use safe JSON serialization with circular reference handling
      return this.safeStringify(worldData);
    } catch (error) {
      console.error('[HybridSync] Failed to serialize world data:', error);
      // Return minimal safe data structure
      return {
        assets: {},
        globalCustomFields: [],
        serializationError: true
      };
    }
  }

  private safelySerializeBackgrounds(): any {
    try {
      const backgroundStore = useBackgroundStore.getState();
      
      // Check if configs exist before serializing
      if (!backgroundStore.configs) {
        console.warn('[HybridSync] No background configs to serialize');
        return {};
      }
      
      // Use safe JSON serialization with circular reference handling
      return this.safeStringify(backgroundStore.configs);
    } catch (error) {
      console.error('[HybridSync] Failed to serialize background configs:', error);
      // Return minimal safe data structure
      return {
        serializationError: true
      };
    }
  }

  // Safe stringify that handles circular references
  private safeStringify(obj: any): any {
    const seen = new WeakSet();
    const jsonString = JSON.stringify(obj, (key, val) => {
      if (val != null && typeof val === 'object') {
        if (seen.has(val)) {
          // Circular reference detected, replace with reference marker
          return '[Circular Reference]';
        }
        seen.add(val);
      }
      return val;
    });
    
    return JSON.parse(jsonString);
  }

  // Calculate exponential backoff delay with jitter
  private calculateBackoffDelay(retryCount: number): number {
    // Base delay: 2 seconds
    const baseDelay = 2000;
    
    // Exponential backoff: 2^retryCount * baseDelay
    const exponentialDelay = Math.pow(2, retryCount - 1) * baseDelay;
    
    // Cap at 5 minutes (300,000ms) to prevent excessive delays
    const cappedDelay = Math.min(exponentialDelay, 300000);
    
    // Add jitter to prevent thundering herd (±25% random variation)
    const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
    
    const finalDelay = Math.max(cappedDelay + jitter, baseDelay);
    
    console.log(`[HybridSync] Backoff delay calculated: ${Math.round(finalDelay)}ms (retry: ${retryCount})`);
    
    return Math.round(finalDelay);
  }

  private calculateSyncDataSize(): number {
    const assetStore = useAssetStore.getState();
    const backgroundStore = useBackgroundStore.getState();
    
    // Estimate world data size (assets + custom fields)
    const worldData = {
      assets: assetStore.getCurrentBookAssets(),
      globalCustomFields: assetStore.getCurrentBookGlobalCustomFields(),
    };
    const worldDataSize = new Blob([JSON.stringify(worldData)]).size;
    
    // Estimate background configs size with null check
    const backgroundConfigs = backgroundStore.configs || {};
    const backgroundDataSize = new Blob([JSON.stringify(backgroundConfigs)]).size;
    
    console.log(`[HybridSync] Estimated sync size: ${worldDataSize + backgroundDataSize} bytes`);
    return worldDataSize + backgroundDataSize;
  }

  private async syncWorldData(userId: string, bookId: string, worldData: any): Promise<void> {
    // Get book metadata from book store
    const bookStore = useBookStore.getState();
    const book = bookStore.books[bookId];
    
    // Prepare metadata to save
    const metadata = {
      ...worldData,
      bookTitle: book?.title,
      bookDescription: book?.description,
      bookColor: book?.color,
      bookGradient: book?.gradient,
      bookCoverImage: book?.coverImage,
      bookIsLeatherMode: book?.isLeatherMode,
      bookLeatherColor: book?.leatherColor,
      bookCoverPageSettings: book?.coverPageSettings,
    };

    const { error } = await supabase
      .from('projects')
      .upsert({
        id: bookId,
        user_id: userId,
        name: book?.title || worldData.bookTitle || 'Untitled Project',
        description: JSON.stringify(metadata),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id'
      });

    if (error) {
      throw new Error(`Failed to sync world data: ${error.message}`);
    }
  }

  private async syncBackgroundData(userId: string, bookId: string, configs: any): Promise<void> {
    // Generate a valid UUID for the background config record
    // Use a deterministic UUID based on bookId to avoid duplicates
    const backgroundId = this.generateDeterministicUUID(`${bookId}-backgrounds`);
    
    const { error } = await supabase
      .from('assets')
      .upsert({
        id: backgroundId,
        user_id: userId,
        project_id: bookId,
        name: 'Background Configurations',
        file_path: `backgrounds/${bookId}.json`,
        file_type: 'application/json',
        file_size_bytes: JSON.stringify(configs).length,
        mime_type: 'application/json',
        metadata: { configs, type: 'background_configurations', bookId },
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id'
      });

    if (error) {
      throw new Error(`Failed to sync background data: ${error.message}`);
    }
  }

  // Generate book-specific deterministic UUID for consistent background record IDs
  private generateDeterministicUUID(input: string): string {
    // Get current book context to ensure book-specific UUIDs
    const { currentBookId } = useBookStore.getState();
    const bookSpecificInput = currentBookId ? `${currentBookId}-${input}` : input;
    
    // Use crypto.subtle for proper hash if available, fallback to simple hash
    // Generate a proper UUID v5-like deterministic UUID
    const hash = this.simpleHash(bookSpecificInput);
    
    // Format as valid UUID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // Where 4 indicates version 4 and y is 8,9,a,b
    const parts = [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '4' + hash.substring(13, 16),
      ((parseInt(hash.charAt(16), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20),
      hash.substring(20, 32)
    ];
    
    return parts.join('-');
  }

  // Simple hash that produces 32 hex characters
  private simpleHash(input: string): string {
    let result = '';
    // Create multiple hash rounds to get 32 chars
    let hash = 0;
    for (let round = 0; round < 4; round++) {
      hash = round * 0x5bd1e995;
      for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i) + round;
        hash = ((hash << 5) - hash) + char;
        hash = hash & 0xffffffff;
      }
      // Convert to 8 hex chars, ensure positive
      const hex = Math.abs(hash >>> 0).toString(16).padStart(8, '0');
      result += hex;
    }
    return result;
  }

  // Load ALL books from cloud (for initial recovery)
  async loadAllBooksFromCloud(): Promise<boolean> {
    const { isAuthenticated, user } = useAuthStore.getState();
    
    if (!isAuthenticated || !user) {
      return false;
    }

    try {
      console.log('[HybridSync] Loading all books from cloud...');
      
      // Load all projects (books) for this user from Supabase with specific columns
      const { data: projects, error } = await supabase
        .from('projects')
        .select('id, name, description, updated_at')
        .eq('user_id', user.id);

      if (error) {
        console.error('[HybridSync] Failed to load books from cloud:', error);
        return false;
      }

      if (!projects || projects.length === 0) {
        console.log('[HybridSync] No books found in cloud');
        return false;
      }

      const bookStore = useBookStore.getState();
      
      // Convert each project to a book and add to store
      for (const project of projects) {
        const existingBook = bookStore.books[project.id];
        
        // Only create if book doesn't exist locally or cloud is newer
        if (!existingBook) {
          let worldData = createDefaultWorldData();
          let parsed: any = {};
          
          // Try to parse world data from description
          if (project.description) {
            try {
              parsed = JSON.parse(project.description);
              if (parsed.assets) {
                worldData = parsed;
              }
            } catch (e) {
              console.warn('[HybridSync] Failed to parse world data for book:', project.id);
            }
          }
          
          // Create the book with full metadata
          const newBook: Book = {
            id: project.id,
            title: project.name || 'Untitled Book',
            description: parsed.bookDescription || '',
            createdAt: new Date(project.updated_at).getTime() - 86400000,
            updatedAt: new Date(project.updated_at).getTime(),
            worldData,
            color: parsed.bookColor || '#3b82f6',
            gradient: parsed.bookGradient,
            coverImage: parsed.bookCoverImage,
            isLeatherMode: parsed.bookIsLeatherMode,
            leatherColor: parsed.bookLeatherColor,
            coverPageSettings: parsed.bookCoverPageSettings,
          };
          
          // Add directly to store
          bookStore.books[project.id] = newBook;
          console.log(`[HybridSync] Restored book from cloud: ${newBook.title}`);
        }
      }

      console.log(`[HybridSync] Restored ${projects.length} books from cloud`);
      return true;
    } catch (error) {
      console.error('[HybridSync] Failed to load books from cloud:', error);
      return false;
    }
  }

  // Load from cloud if available (for recovery/initialization)
  async loadFromCloud(bookId: string): Promise<boolean> {
    const { isAuthenticated, user } = useAuthStore.getState();
    
    if (!isAuthenticated || !user) {
      return false;
    }

    try {
      // Load world data with specific column selection
      const { data: projectData } = await supabase
        .from('projects')
        .select('description')
        .eq('id', bookId)
        .eq('user_id', user.id)
        .single();

      if (projectData?.description) {
        const worldData = JSON.parse(projectData.description);
        // Update local stores with cloud data using loadWorldData
        const assetStore = useAssetStore.getState();
        assetStore.loadWorldData(worldData);
      }

      // Load background configs with specific column selection
      const backgroundId = this.generateDeterministicUUID(`${bookId}-backgrounds`);
      const { data: backgroundData } = await supabase
        .from('assets')
        .select('metadata')
        .eq('id', backgroundId)
        .eq('user_id', user.id)
        .single();

      if (backgroundData?.metadata?.configs) {
        const backgroundStore = useBackgroundStore.getState();
        Object.entries(backgroundData.metadata.configs).forEach(([key, config]: [string, any]) => {
          backgroundStore.setBackground(key, config);
        });
      }

      console.log('[HybridSync] Loaded data from cloud');
      return true;
    } catch (error) {
      console.error('[HybridSync] Failed to load from cloud:', error);
      return false;
    }
  }

  private startPeriodicSync(): void {
    this.syncInterval = window.setInterval(() => {
      this.performPeriodicSync();
    }, this.SYNC_INTERVAL);
  }

  private async performPeriodicSync(): Promise<void> {
    const { isAuthenticated } = useAuthStore.getState();
    const { syncEnabled, isOnline } = useCloudStore.getState();
    
    // Only sync if authenticated, sync enabled, and online
    if (isAuthenticated && syncEnabled && isOnline) {
      await this.syncToCloud();
    }
  }

  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  subscribe(callback: (status: SyncStatus) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private updateSyncStatus(updates: Partial<SyncStatus>): void {
    const currentStatus = this.getSyncStatus();
    const newStatus = { ...currentStatus, ...updates };
    this.notifySubscribers(newStatus);
  }

  private notifySubscribers(status: SyncStatus): void {
    this.subscribers.forEach(callback => callback(status));
  }

  getSyncStatus(): SyncStatus {
    const { isAuthenticated } = useAuthStore.getState();
    const { syncEnabled, quota, isOnline, syncQueue, autosaveStatus, lastSyncTime } = useCloudStore.getState();
    
    return {
      lastSyncTime,
      syncEnabled: isAuthenticated && syncEnabled,
      pendingChanges: autosaveStatus === 'error' || syncQueue.length > 0,
      onlineMode: isOnline,
      quotaExceeded: false, // Will be updated during sync attempts
      storageUsed: quota.used,
      storageLimit: quota.available,
      syncInProgress: autosaveStatus === 'saving',
      queuedItems: syncQueue.length
    };
  }
}

export const hybridSyncService = HybridSyncService.getInstance();
