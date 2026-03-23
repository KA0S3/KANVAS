import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';

export interface SyncStatus {
  lastSyncTime: Date | null;
  syncEnabled: boolean;
  pendingChanges: boolean;
  onlineMode: boolean;
  quotaExceeded: boolean;
  storageUsed: number;
  storageLimit: number;
}

class HybridSyncService {
  private static instance: HybridSyncService;
  private syncInterval: number | null = null;
  private subscribers: Set<(status: SyncStatus) => void> = new Set();
  private readonly SYNC_INTERVAL = 30000; // 30 seconds

  static getInstance(): HybridSyncService {
    if (!HybridSyncService.instance) {
      HybridSyncService.instance = new HybridSyncService();
    }
    return HybridSyncService.instance;
  }

  private constructor() {
    this.startPeriodicSync();
  }

  // Keep local-first storage working
  saveToLocal() {
    // Local storage is already handled by zustand persist middleware
    // This just ensures local saves happen immediately
    console.log('[HybridSync] Local save completed');
  }

  // Calculate the size of data to be synced
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

  // Sync to cloud when user is authenticated
  async syncToCloud(): Promise<boolean> {
    const { isAuthenticated, user } = useAuthStore.getState();
    const { syncEnabled, canUpload } = useCloudStore.getState();
    
    if (!isAuthenticated || !user || !syncEnabled) {
      console.log('[HybridSync] Cloud sync disabled - user not authenticated or sync disabled');
      return false;
    }

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
        onlineMode: false,
        quotaExceeded: true,
        storageUsed: cloudStore.quota.used,
        storageLimit: cloudStore.quota.available
      });
      return false;
    }

    try {
      const { currentBookId } = useBookStore.getState();
      if (!currentBookId) {
        console.log('[HybridSync] No current book to sync');
        return false;
      }

      console.log('[HybridSync] Starting cloud sync...');

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

      console.log('[HybridSync] Cloud sync completed');
      this.notifySubscribers({
        lastSyncTime: new Date(),
        syncEnabled: true,
        pendingChanges: false,
        onlineMode: true,
        quotaExceeded: false,
        storageUsed: cloudStore.quota.used,
        storageLimit: cloudStore.quota.available
      });

      return true;
    } catch (error) {
      console.error('[HybridSync] Cloud sync failed:', error);
      return false;
    }
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
        onConflict: 'id,user_id'
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
        onConflict: 'id,user_id'
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
      this.syncToCloud();
    }, this.SYNC_INTERVAL);
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

  private notifySubscribers(status: SyncStatus): void {
    this.subscribers.forEach(callback => callback(status));
  }

  getSyncStatus(): SyncStatus {
    const { isAuthenticated } = useAuthStore.getState();
    const { syncEnabled, quota } = useCloudStore.getState();
    
    return {
      lastSyncTime: null,
      syncEnabled: isAuthenticated && syncEnabled,
      pendingChanges: false,
      onlineMode: isAuthenticated && syncEnabled,
      quotaExceeded: false, // Will be updated during sync attempts
      storageUsed: quota.used,
      storageLimit: quota.available
    };
  }
}

export const hybridSyncService = HybridSyncService.getInstance();
