import { supabase } from '@/lib/supabase';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useAuthStore } from '@/stores/authStore';
import { assetUploadService } from './assetUploadService';

export type HybridAutosaveStatus = 'idle' | 'local-saving' | 'cloud-syncing' | 'saved' | 'error';

interface HybridAutosaveState {
  status: HybridAutosaveStatus;
  lastLocalSave: Date | null;
  lastCloudSync: Date | null;
  errorMessage: string | null;
  cycleStartTime: Date | null;
  pendingCloudSyncs: number;
}

interface LocalProjectData {
  userId: string;
  projectId?: string;
  assets: Record<string, any>;
  backgrounds: any;
  worldData: any;
  screenPositions: Record<string, { x: number; y: number; width: number; height: number }>;
  folderStructure: Record<string, string[]>;
  lastLocalSave: string;
  lastCloudSync?: string;
  pendingUploads: string[]; // Asset IDs that need cloud upload
}

class HybridAutosaveService {
  private static instance: HybridAutosaveService;
  private state: HybridAutosaveState;
  private saveInterval: number | null = null;
  private subscribers: Set<(state: HybridAutosaveState) => void> = new Set();
  private readonly LOCAL_SAVE_INTERVAL = 5000; // Save locally every 5 seconds
  private readonly CLOUD_SYNC_INTERVAL = 30000; // Sync to cloud every 30 seconds
  private readonly STORAGE_KEY = 'kanvas_hybrid_autosave';

  static getInstance(): HybridAutosaveService {
    if (!HybridAutosaveService.instance) {
      HybridAutosaveService.instance = new HybridAutosaveService();
    }
    return HybridAutosaveService.instance;
  }

  private constructor() {
    this.state = {
      status: 'idle',
      lastLocalSave: null,
      lastCloudSync: null,
      errorMessage: null,
      cycleStartTime: null,
      pendingCloudSyncs: 0,
    };
  }

  // Public API
  startAutosave(): void {
    if (this.saveInterval) return;

    console.log('[HybridAutosave] Starting hybrid autosave');
    
    // Start local save interval
    const localSaveTimer = setInterval(() => {
      this.performLocalSave();
    }, this.LOCAL_SAVE_INTERVAL);

    // Start cloud sync interval
    const cloudSyncTimer = setInterval(() => {
      this.performCloudSync();
    }, this.CLOUD_SYNC_INTERVAL);

    this.saveInterval = localSaveTimer as any;
    
    // Set up store subscriptions
    this.setupStoreSubscriptions();
    
    // Initial save
    this.performLocalSave();
  }

  stopAutosave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    console.log('[HybridAutosave] Stopped autosave');
  }

  async triggerManualSave(): Promise<void> {
    console.log('[HybridAutosave] Manual save triggered');
    await this.performLocalSave();
    await this.performCloudSync();
  }

  getStatus(): HybridAutosaveStatus {
    return this.state.status;
  }

  getState(): HybridAutosaveState {
    return { ...this.state };
  }

  subscribe(callback: (state: HybridAutosaveState) => void): () => void {
    this.subscribers.add(callback);
    callback(this.getState());
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // Load user data on startup
  async loadUserData(userId: string, projectId?: string): Promise<LocalProjectData | null> {
    try {
      // First load from localStorage for instant UI
      const storageData = localStorage.getItem(this.STORAGE_KEY);
      if (storageData) {
        const allData: Record<string, LocalProjectData> = JSON.parse(storageData);
        const userKey = `${userId}_${projectId || 'default'}`;
        const localData = allData[userKey];
        
        if (localData) {
          console.log('[HybridAutosave] Loaded local data from:', localData.lastLocalSave);
          
          // Then load fresh data from Supabase
          await this.loadFromCloud(userId, projectId);
          
          return localData;
        }
      }
      
      // If no local data, load from cloud
      await this.loadFromCloud(userId, projectId);
      return null;
      
    } catch (error) {
      console.error('[HybridAutosave] Failed to load user data:', error);
      return null;
    }
  }

  // Private methods
  private setupStoreSubscriptions(): void {
    // Save locally immediately on any store change
    useAssetStore.subscribe(() => {
      this.performLocalSave();
    });

    useBackgroundStore.subscribe(() => {
      this.performLocalSave();
    });

    useBookStore.subscribe(() => {
      this.performLocalSave();
    });
  }

  private async performLocalSave(): Promise<void> {
    const { user, isAuthenticated } = useAuthStore.getState();
    const { currentBookId } = useBookStore.getState();
    
    if (!isAuthenticated || !user) {
      return;
    }

    try {
      this.updateState({ status: 'local-saving' });

      // Collect all user data
      const assetStore = useAssetStore.getState();
      const backgroundStore = useBackgroundStore.getState();
      const bookStore = useBookStore.getState();

      const userData: LocalProjectData = {
        userId: user.id,
        projectId: currentBookId,
        assets: assetStore.assets,
        backgrounds: backgroundStore.configs,
        worldData: {
          globalCustomFields: assetStore.globalCustomFields,
          currentBook: bookStore.currentBookId,
        },
        screenPositions: this.extractScreenPositions(assetStore.assets),
        folderStructure: this.extractFolderStructure(assetStore.assets),
        lastLocalSave: new Date().toISOString(),
        lastCloudSync: this.state.lastCloudSync?.toISOString(),
        pendingUploads: this.getPendingUploads(assetStore.assets),
      };

      // Save to localStorage
      await this.saveToLocalStorage(userData);
      
      this.updateState({ 
        lastLocalSave: new Date(),
        status: 'idle',
        errorMessage: null 
      });

      console.log('[HybridAutosave] Local save completed');
      
    } catch (error) {
      console.error('[HybridAutosave] Local save failed:', error);
      this.updateState({ 
        status: 'error', 
        errorMessage: `Local save failed: ${error.message}` 
      });
    }
  }

  private async performCloudSync(): Promise<void> {
    const { user, isAuthenticated } = useAuthStore.getState();
    const { currentBookId } = useBookStore.getState();
    
    if (!isAuthenticated || !user || !currentBookId) {
      return;
    }

    try {
      this.updateState({ status: 'cloud-syncing' });

      const assetStore = useAssetStore.getState();
      const pendingUploads = this.getPendingUploads(assetStore.assets);
      
      if (pendingUploads.length > 0) {
        console.log(`[HybridAutosave] Syncing ${pendingUploads.length} assets to cloud`);
        
        // Upload pending assets to Cloudflare R2
        for (const assetId of pendingUploads) {
          const asset = assetStore.assets[assetId];
          if (asset.file && asset.cloudStatus !== 'synced') {
            try {
              await this.uploadAssetToCloud(asset, currentBookId);
            } catch (error) {
              console.error(`[HybridAutosave] Failed to upload asset ${assetId}:`, error);
            }
          }
        }
      }

      // Sync project structure to Supabase
      await this.syncProjectStructure(user.id, currentBookId);
      
      this.updateState({ 
        lastCloudSync: new Date(),
        status: 'saved',
        pendingCloudSyncs: 0,
        errorMessage: null 
      });

      console.log('[HybridAutosave] Cloud sync completed');
      
      // Reset to idle after showing saved status
      setTimeout(() => {
        if (this.state.status === 'saved') {
          this.updateState({ status: 'idle' });
        }
      }, 2000);
      
    } catch (error) {
      console.error('[HybridAutosave] Cloud sync failed:', error);
      this.updateState({ 
        status: 'error', 
        errorMessage: `Cloud sync failed: ${error.message}` 
      });
      
      // Reset to idle after error
      setTimeout(() => {
        this.updateState({ status: 'idle' });
      }, 5000);
    }
  }

  private async uploadAssetToCloud(asset: any, projectId: string): Promise<void> {
    if (!asset.file) return;

    try {
      // Use your existing assetUploadService
      const variants = await assetUploadService.generateVariants(asset.file);
      
      const uploadRequest = {
        assetId: asset.id,
        variants,
        projectId
      };

      const result = await assetUploadService.uploadAsset(uploadRequest);
      
      if (result.success && result.cloudMetadata) {
        // Update asset in store with cloud metadata
        const assetStore = useAssetStore.getState();
        assetStore.updateAsset(asset.id, {
          cloudStatus: 'synced',
          cloudId: result.cloudMetadata.id,
          cloudPath: result.cloudMetadata.cloud_path,
          cloudSize: result.cloudMetadata.file_size,
          cloudUpdatedAt: result.cloudMetadata.updated_at,
          cloudError: undefined
        });
        
        console.log(`[HybridAutosave] Asset ${asset.id} uploaded to cloud`);
      }
    } catch (error) {
      throw new Error(`Asset upload failed: ${error.message}`);
    }
  }

  private async syncProjectStructure(userId: string, projectId: string): Promise<void> {
    const assetStore = useAssetStore.getState();
    const backgroundStore = useBackgroundStore.getState();

    // Save project structure to Supabase
    const projectStructure = {
      assets: Object.values(assetStore.assets).map(asset => ({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        x: asset.x,
        y: asset.y,
        width: asset.width,
        height: asset.height,
        folder: asset.folder || 'root',
        cloudId: asset.cloudId,
        cloudPath: asset.cloudPath,
        cloudStatus: asset.cloudStatus,
      })),
      backgrounds: backgroundStore.configs,
      folderStructure: this.extractFolderStructure(assetStore.assets),
      screenPositions: this.extractScreenPositions(assetStore.assets),
      globalCustomFields: assetStore.globalCustomFields,
    };

    const { error } = await supabase
      .from('projects')
      .update({
        structure_data: projectStructure,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to sync project structure: ${error.message}`);
    }
  }

  private async loadFromCloud(userId: string, projectId?: string): Promise<void> {
    if (!projectId) return;

    try {
      // Load project structure from Supabase
      const { data: projectData, error } = await supabase
        .from('projects')
        .select('structure_data')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single();

      if (error) {
        console.warn('[HybridAutosave] No cloud data found:', error.message);
        return;
      }

      if (projectData?.structure_data) {
        console.log('[HybridAutosave] Loaded project structure from cloud');
        // Restore the structure to your stores here
        // This would need to be implemented based on your store structure
      }
    } catch (error) {
      console.error('[HybridAutosave] Failed to load from cloud:', error);
    }
  }

  private async saveToLocalStorage(userData: LocalProjectData): Promise<void> {
    try {
      const storageData = localStorage.getItem(this.STORAGE_KEY);
      const allData: Record<string, LocalProjectData> = storageData ? JSON.parse(storageData) : {};
      
      const userKey = `${userData.userId}_${userData.projectId || 'default'}`;
      allData[userKey] = userData;

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allData));
    } catch (error) {
      throw new Error(`LocalStorage write failed: ${error.message}`);
    }
  }

  private getPendingUploads(assets: Record<string, any>): string[] {
    return Object.values(assets)
      .filter(asset => asset.file && asset.cloudStatus !== 'synced')
      .map(asset => asset.id);
  }

  private extractScreenPositions(assets: Record<string, any>): Record<string, { x: number; y: number; width: number; height: number }> {
    const positions: Record<string, { x: number; y: number; width: number; height: number }> = {};
    
    Object.values(assets).forEach((asset: any) => {
      positions[asset.id] = {
        x: asset.x || 0,
        y: asset.y || 0,
        width: asset.width || 200,
        height: asset.height || 150,
      };
    });
    
    return positions;
  }

  private extractFolderStructure(assets: Record<string, any>): Record<string, string[]> {
    const structure: Record<string, string[]> = {};
    
    Object.values(assets).forEach((asset: any) => {
      const folder = asset.folder || 'root';
      if (!structure[folder]) {
        structure[folder] = [];
      }
      structure[folder].push(asset.id);
    });
    
    return structure;
  }

  private updateState(updates: Partial<HybridAutosaveState>): void {
    this.state = { ...this.state, ...updates };
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback(this.getState()));
  }
}

export const hybridAutosaveService = HybridAutosaveService.getInstance();
