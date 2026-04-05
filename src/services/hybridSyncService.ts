import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { connectivityService } from '@/services/connectivityService';

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

  // Cloud-first sync: always try to sync to cloud first
  async syncToCloud(): Promise<boolean> {
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

    try {
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

      // Sync assets/world data
      const assetStore = useAssetStore.getState();
      const worldData = {
        assets: assetStore.assets,
        globalCustomFields: assetStore.globalCustomFields,
      };

      await this.syncWorldData(user.id, currentBookId, worldData);

      // Sync background configs
      const backgroundStore = useBackgroundStore.getState();
      await this.syncBackgroundData(user.id, currentBookId, backgroundStore.configs);

      // Update quota usage
      cloudStore.updateQuotaUsage(dataSize);

      console.log('[HybridSync] Cloud sync completed successfully');
      this.updateSyncStatus({ 
        lastSyncTime: new Date(),
        syncInProgress: false,
        pendingChanges: false
      });

      // Process any remaining items in queue
      await this.processSyncQueue();

      return true;
    } catch (error) {
      console.error('[HybridSync] Cloud sync failed:', error);
      
      // Add to queue for retry
      this.addToSyncQueue();
      
      this.updateSyncStatus({ 
        syncInProgress: false,
        pendingChanges: true
      });
      
      return false;
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
        assets: assetStore.assets,
        globalCustomFields: assetStore.globalCustomFields,
      }
    });

    // Add backgrounds to queue
    if (Object.keys(backgroundStore.configs).length > 0) {
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

    console.log(`[HybridSync] Processing ${syncQueue.length} items in sync queue`);

    const { user } = useAuthStore.getState();
    const { currentBookId } = useBookStore.getState();
    
    if (!user || !currentBookId) {
      return;
    }

    // Process queue items in order with exponential backoff
    for (const item of syncQueue) {
      try {
        // Check if item should be retried based on backoff
        if (item.retryCount > 0) {
          const backoffDelay = this.calculateBackoffDelay(item.retryCount);
          const timeSinceLastRetry = Date.now() - (item.lastRetryTime || 0);
          
          if (timeSinceLastRetry < backoffDelay) {
            console.log(`[HybridSync] Item ${item.id} waiting for backoff: ${backoffDelay}ms`);
            continue; // Skip this item for now
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
          break; // Stop processing on permanent failure
        } else {
          const nextRetryIn = this.calculateBackoffDelay(item.retryCount);
          console.log(`[HybridSync] Item ${item.id} will retry in ${nextRetryIn}ms (attempt ${item.retryCount}/5)`);
          break; // Wait for next retry cycle
        }
      }
    }
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
      assets: assetStore.assets,
      globalCustomFields: assetStore.globalCustomFields,
    };
    const worldDataSize = new Blob([JSON.stringify(worldData)]).size;
    
    // Estimate background configs size
    const backgroundDataSize = new Blob([JSON.stringify(backgroundStore.configs)]).size;
    
    console.log(`[HybridSync] Estimated sync size: ${worldDataSize + backgroundDataSize} bytes`);
    return worldDataSize + backgroundDataSize;
  }

  private async syncWorldData(userId: string, bookId: string, worldData: any): Promise<void> {
    const { error } = await supabase
      .from('projects')
      .upsert({
        id: bookId,
        user_id: userId,
        name: worldData.bookTitle || 'Untitled Project',
        description: JSON.stringify(worldData),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id'
      });

    if (error) {
      throw new Error(`Failed to sync world data: ${error.message}`);
    }
  }

  private async syncBackgroundData(userId: string, bookId: string, configs: any): Promise<void> {
    const { error } = await supabase
      .from('assets')
      .upsert({
        id: `${bookId}-backgrounds`,
        user_id: userId,
        project_id: bookId,
        name: 'Background Configurations',
        file_path: `backgrounds/${bookId}.json`,
        file_type: 'application/json',
        file_size_bytes: JSON.stringify(configs).length,
        mime_type: 'application/json',
        metadata: { configs, type: 'background_configurations' },
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id'
      });

    if (error) {
      throw new Error(`Failed to sync background data: ${error.message}`);
    }
  }

  // Load from cloud if available (for recovery/initialization)
  async loadFromCloud(bookId: string): Promise<boolean> {
    const { isAuthenticated, user } = useAuthStore.getState();
    
    if (!isAuthenticated || !user) {
      return false;
    }

    try {
      // Load world data
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

      // Load background configs
      const { data: backgroundData } = await supabase
        .from('assets')
        .select('metadata')
        .eq('id', `${bookId}-backgrounds`)
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
