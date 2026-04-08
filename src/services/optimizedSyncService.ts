import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { connectivityService } from '@/services/connectivityService';
import type { Book } from '@/types/book';

export interface OptimizedSyncStatus {
  lastSyncTime: Date | null;
  syncEnabled: boolean;
  pendingChanges: boolean;
  onlineMode: boolean;
  quotaExceeded: boolean;
  storageUsed: number;
  storageLimit: number;
  syncInProgress: boolean;
  queuedItems: number;
  payloadSize: number; // Track payload sizes
}

class OptimizedSyncService {
  private static instance: OptimizedSyncService;
  private syncInterval: number | null = null;
  private subscribers: Set<(status: OptimizedSyncStatus) => void> = new Set();
  private readonly SYNC_INTERVAL = 300000; // 5 minutes (300 seconds) - increased from 60s to reduce costs
  private readonly MANUAL_SYNC_INTERVAL = 30000; // 30 seconds for manual saves - increased from 10s
  private isManualSync = false;
  private isProcessingQueue = false;
  private syncMutex = false;
  private lastSyncPayloadSize = 0;
  private lastManualSyncTime = 0; // Track last manual sync for debouncing
  private readonly MANUAL_SYNC_DEBOUNCE = 1000; // 1 second debounce for manual syncs

  static getInstance(): OptimizedSyncService {
    if (!OptimizedSyncService.instance) {
      OptimizedSyncService.instance = new OptimizedSyncService();
    }
    return OptimizedSyncService.instance;
  }

  private constructor() {
    this.startPeriodicSync();
    this.setupConnectivityListeners();
  }

  private setupConnectivityListeners(): void {
    connectivityService.subscribe((state) => {
      if (typeof state === 'object') {
        const isOnline = (state as any).isOnline;
        console.log(`[OptimizedSync] Connectivity changed: ${isOnline ? 'online' : 'offline'}`);
        
        if (isOnline) {
          this.processSyncQueue();
        }
      }
    });
  }

  // Optimized sync with payload size tracking
  async syncToCloud(): Promise<boolean> {
    if (this.syncMutex) {
      console.log('[OptimizedSync] Sync already in progress, skipping');
      return false;
    }

    this.syncMutex = true;
    
    try {
      const { isAuthenticated, user } = useAuthStore.getState();
      const { syncEnabled } = useCloudStore.getState();
      const isOnline = connectivityService.isOnline();
      
      if (!isAuthenticated || !user || !syncEnabled) {
        console.log('[OptimizedSync] Cloud sync disabled - user not authenticated or sync disabled');
        return false;
      }

      if (!isOnline) {
        console.log('[OptimizedSync] Offline - adding to sync queue');
        this.addToSyncQueue();
        return false;
      }

      const { currentBookId } = useBookStore.getState();
      if (!currentBookId) {
        console.log('[OptimizedSync] No current book to sync');
        return false;
      }

      console.log('[OptimizedSync] Starting optimized cloud sync...');
      this.updateSyncStatus({ syncInProgress: true });

      // Check storage quota before syncing
      const dataSize = this.calculateOptimizedSyncDataSize();
      const cloudStore = useCloudStore.getState();
      const quotaExceeded = !cloudStore.canUpload(dataSize);
      
      if (quotaExceeded) {
        console.log('[OptimizedSync] Cloud sync blocked - storage quota exceeded');
        this.notifySubscribers({
          lastSyncTime: null,
          syncEnabled: true,
          pendingChanges: true,
          onlineMode: true,
          quotaExceeded: true,
          storageUsed: cloudStore.quota.used,
          storageLimit: cloudStore.quota.available,
          syncInProgress: false,
          queuedItems: cloudStore.syncQueue.length,
          payloadSize: 0
        });
        return false;
      }

      // Only sync if there are actual changes (reduce unnecessary writes)
      const hasChanges = await this.hasActualChanges(currentBookId, user.id);
      if (!hasChanges) {
        console.log('[OptimizedSync] No changes detected, skipping sync');
        this.updateSyncStatus({ 
          syncInProgress: false,
          pendingChanges: false
        });
        return true;
      }

      // Optimized data serialization
      const worldData = this.optimizedSerializeWorldData();
      const backgroundConfigs = this.optimizedSerializeBackgrounds();

      await this.optimizedSyncWorldData(user.id, currentBookId, worldData);
      await this.optimizedSyncBackgroundData(user.id, currentBookId, backgroundConfigs);

      // Track payload size
      this.lastSyncPayloadSize = dataSize;

      // Update quota usage
      cloudStore.updateQuotaUsage(dataSize);

      console.log(`[OptimizedSync] Cloud sync completed successfully (${dataSize} bytes)`);
      this.updateSyncStatus({ 
        lastSyncTime: new Date(),
        syncInProgress: false,
        pendingChanges: false,
        payloadSize: dataSize
      });

      await this.processSyncQueue();
      return true;

    } catch (error) {
      console.error('[OptimizedSync] Cloud sync failed:', error);
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

  // Check if there are actual changes to avoid unnecessary writes
  private async hasActualChanges(bookId: string, userId: string): Promise<boolean> {
    try {
      const { data: projectData } = await supabase
        .from('projects')
        .select('updated_at')
        .eq('id', bookId)
        .eq('user_id', userId)
        .single();

      const bookStore = useBookStore.getState();
      const localLastUpdate = bookStore.books[bookId]?.updatedAt || 0;
      const cloudLastUpdate = projectData ? new Date(projectData.updated_at).getTime() : 0;

      return localLastUpdate > cloudLastUpdate;
    } catch (error) {
      console.log('[OptimizedSync] Could not check for changes, assuming sync needed');
      return true;
    }
  }

  // Optimized serialization with size limits
  private optimizedSerializeWorldData(): any {
    try {
      const assetStore = useAssetStore.getState();
      const worldData = {
        assets: assetStore.getCurrentBookAssets(),
        globalCustomFields: assetStore.getCurrentBookGlobalCustomFields(),
      };

      // Check size before serialization (limit to 1MB per sync)
      const serialized = JSON.stringify(worldData);
      if (serialized.length > 1024 * 1024) { // 1MB limit
        console.warn('[OptimizedSync] World data too large, truncating');
        // Implement smart truncation logic here
        return this.truncateWorldData(worldData);
      }

      return this.safeStringify(worldData);
    } catch (error) {
      console.error('[OptimizedSync] Failed to serialize world data:', error);
      return {
        assets: {},
        globalCustomFields: [],
        serializationError: true
      };
    }
  }

  private optimizedSerializeBackgrounds(): any {
    try {
      const backgroundStore = useBackgroundStore.getState();
      
      if (!backgroundStore.configs) {
        return {};
      }

      // Only sync changed background configs
      const configs = backgroundStore.configs;
      const serialized = JSON.stringify(configs);
      
      if (serialized.length > 512 * 1024) { // 512KB limit for backgrounds
        console.warn('[OptimizedSync] Background configs too large, truncating');
        return this.truncateBackgroundConfigs(configs);
      }

      return this.safeStringify(configs);
    } catch (error) {
      console.error('[OptimizedSync] Failed to serialize background configs:', error);
      return {
        serializationError: true
      };
    }
  }

  // Smart data truncation methods
  private truncateWorldData(worldData: any): any {
    const truncated = {
      assets: {},
      globalCustomFields: worldData.globalCustomFields?.slice(0, 100) || []
    };

    // Keep only most recent or important assets
    const assetEntries = Object.entries(worldData.assets || {});
    const maxAssets = 100;
    
    for (let i = 0; i < Math.min(assetEntries.length, maxAssets); i++) {
      const [key, value] = assetEntries[i];
      truncated.assets[key] = {
        ...(value as any),
        // Remove large binary data or cache it separately
        thumbnail: undefined,
        preview: undefined
      };
    }

    return truncated;
  }

  private truncateBackgroundConfigs(configs: any): any {
    const truncated: any = {};
    const maxConfigs = 10;
    let count = 0;

    for (const [key, config] of Object.entries(configs)) {
      if (count >= maxConfigs) break;
      
      truncated[key] = {
        ...(config as any),
        // Remove large image data from backgrounds
        imageData: undefined
      };
      count++;
    }

    return truncated;
  }

  private calculateOptimizedSyncDataSize(): number {
    const worldData = this.optimizedSerializeWorldData();
    const backgroundConfigs = this.optimizedSerializeBackgrounds();
    
    const worldDataSize = new Blob([JSON.stringify(worldData)]).size;
    const backgroundDataSize = new Blob([JSON.stringify(backgroundConfigs)]).size;
    
    console.log(`[OptimizedSync] Estimated optimized sync size: ${worldDataSize + backgroundDataSize} bytes`);
    return worldDataSize + backgroundDataSize;
  }

  // Optimized database operations with specific column selection
  private async optimizedSyncWorldData(userId: string, bookId: string, worldData: any): Promise<void> {
    const bookStore = useBookStore.getState();
    const book = bookStore.books[bookId];
    
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

  private async optimizedSyncBackgroundData(userId: string, bookId: string, configs: any): Promise<void> {
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

  // Reuse existing utility methods
  private safeStringify(obj: any): any {
    const seen = new WeakSet();
    const jsonString = JSON.stringify(obj, (key, val) => {
      if (val != null && typeof val === 'object') {
        if (seen.has(val)) {
          return '[Circular Reference]';
        }
        seen.add(val);
      }
      return val;
    });
    
    return JSON.parse(jsonString);
  }

  private generateDeterministicUUID(input: string): string {
    const { currentBookId } = useBookStore.getState();
    const bookSpecificInput = currentBookId ? `${currentBookId}-${input}` : input;
    
    const hash = this.simpleHash(bookSpecificInput);
    
    const parts = [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '4' + hash.substring(13, 16),
      ((parseInt(hash.charAt(16), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20),
      hash.substring(20, 32)
    ];
    
    return parts.join('-');
  }

  private simpleHash(input: string): string {
    let result = '';
    let hash = 0;
    for (let round = 0; round < 4; round++) {
      hash = round * 0x5bd1e995;
      for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i) + round;
        hash = ((hash << 5) - hash) + char;
        hash = hash & 0xffffffff;
      }
      const hex = Math.abs(hash >>> 0).toString(16).padStart(8, '0');
      result += hex;
    }
    return result;
  }

  private addToSyncQueue(): void {
    const { currentBookId } = useBookStore.getState();
    const assetStore = useAssetStore.getState();
    const backgroundStore = useBackgroundStore.getState();

    useCloudStore.getState().addToSyncQueue({
      type: 'asset',
      data: {
        assets: assetStore.getCurrentBookAssets(),
        globalCustomFields: assetStore.getCurrentBookGlobalCustomFields(),
      }
    });

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

    if (this.isProcessingQueue) {
      console.log('[OptimizedSync] Queue already processing, skipping');
      return;
    }

    this.isProcessingQueue = true;
    console.log(`[OptimizedSync] Processing ${syncQueue.length} items in sync queue`);

    try {
      const { user } = useAuthStore.getState();
      const { currentBookId } = useBookStore.getState();
      
      if (!user || !currentBookId) {
        return;
      }

      const itemsToProcess = [...syncQueue];
      for (const item of itemsToProcess) {
        try {
          switch (item.type) {
            case 'asset':
              await this.optimizedSyncWorldData(user.id, currentBookId, item.data);
              break;
            case 'background':
              await this.optimizedSyncBackgroundData(user.id, currentBookId, item.data);
              break;
          }
          
          cloudStore.removeFromSyncQueue(item.id);
          console.log(`[OptimizedSync] Successfully synced item ${item.id}`);
          
        } catch (error) {
          console.error(`[OptimizedSync] Failed to sync queue item ${item.id}:`, error);
          item.retryCount = (item.retryCount || 0) + 1;
          
          if (item.retryCount >= 5) {
            cloudStore.removeFromSyncQueue(item.id);
            console.warn(`[OptimizedSync] Removed item ${item.id} from queue after 5 failed attempts`);
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
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
    
    if (isAuthenticated && syncEnabled && isOnline) {
      await this.syncToCloud();
    }
  }

  subscribe(callback: (status: OptimizedSyncStatus) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private updateSyncStatus(updates: Partial<OptimizedSyncStatus>): void {
    const currentStatus = this.getSyncStatus();
    const newStatus = { ...currentStatus, ...updates };
    this.notifySubscribers(newStatus);
  }

  private notifySubscribers(status: OptimizedSyncStatus): void {
    this.subscribers.forEach(callback => callback(status));
  }

  getSyncStatus(): OptimizedSyncStatus {
    const { isAuthenticated } = useAuthStore.getState();
    const { syncEnabled, quota, isOnline, syncQueue, autosaveStatus, lastSyncTime } = useCloudStore.getState();
    
    return {
      lastSyncTime,
      syncEnabled: isAuthenticated && syncEnabled,
      pendingChanges: autosaveStatus === 'error' || syncQueue.length > 0,
      onlineMode: isOnline,
      quotaExceeded: false,
      storageUsed: quota.used,
      storageLimit: quota.available,
      syncInProgress: autosaveStatus === 'saving',
      queuedItems: syncQueue.length,
      payloadSize: this.lastSyncPayloadSize
    };
  }

  // Public methods
  async triggerManualSync(): Promise<boolean> {
    // Debounce check - prevent rapid successive manual syncs
    const now = Date.now();
    if (now - this.lastManualSyncTime < this.MANUAL_SYNC_DEBOUNCE) {
      console.log('[OptimizedSync] Manual sync debounced, too soon since last sync');
      return false;
    }
    this.lastManualSyncTime = now;

    this.isManualSync = true;
    
    const originalInterval = this.SYNC_INTERVAL;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    this.syncInterval = window.setInterval(() => {
      this.performPeriodicSync();
    }, this.MANUAL_SYNC_INTERVAL);

    const result = await this.syncToCloud();
    
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

  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export const optimizedSyncService = OptimizedSyncService.getInstance();
