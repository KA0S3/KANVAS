import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useAuthStore } from '@/stores/authStore';

export type LocalAutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface LocalAutosaveState {
  status: LocalAutosaveStatus;
  lastSavedTime: Date | null;
  errorMessage: string | null;
  cycleStartTime: Date | null;
  saveCount: number;
}

interface UserProjectData {
  userId: string;
  projectId?: string;
  assets: any;
  backgrounds: any;
  worldData: any;
  screenPositions: Record<string, { x: number; y: number; width: number; height: number }>;
  folderStructure: Record<string, string[]>;
  lastSaved: string;
}

class LocalAutosaveService {
  private static instance: LocalAutosaveService;
  private state: LocalAutosaveState;
  private saveInterval: number | null = null;
  private subscribers: Set<(state: LocalAutosaveState) => void> = new Set();
  private readonly SAVE_CYCLE_DURATION = 30000; // 30 seconds total cycle
  private readonly SAVE_DURATION = 20000; // 20 seconds saving
  private readonly IDLE_DURATION = 10000; // 10 seconds idle
  private readonly STORAGE_KEY = 'kanvas_local_autosave';

  static getInstance(): LocalAutosaveService {
    if (!LocalAutosaveService.instance) {
      LocalAutosaveService.instance = new LocalAutosaveService();
    }
    return LocalAutosaveService.instance;
  }

  private constructor() {
    this.state = {
      status: 'idle',
      lastSavedTime: null,
      errorMessage: null,
      cycleStartTime: null,
      saveCount: 0,
    };
  }

  // Public API
  startAutosave(): void {
    if (this.saveInterval) return;

    console.log('[LocalAutosave] Starting local autosave cycles');
    
    // Start the save cycle
    this.startSaveCycle();
    
    // Set up store subscriptions for immediate saves on changes
    this.setupStoreSubscriptions();
  }

  stopAutosave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    console.log('[LocalAutosave] Stopped autosave');
  }

  async triggerManualSave(): Promise<void> {
    console.log('[LocalAutosave] Manual save triggered');
    await this.performSave();
  }

  getStatus(): LocalAutosaveStatus {
    return this.state.status;
  }

  getState(): LocalAutosaveState {
    return { ...this.state };
  }

  subscribe(callback: (state: LocalAutosaveState) => void): () => void {
    this.subscribers.add(callback);
    callback(this.getState());
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // Load user data on startup
  async loadUserData(userId: string, projectId?: string): Promise<UserProjectData | null> {
    try {
      const storageData = localStorage.getItem(this.STORAGE_KEY);
      if (!storageData) return null;

      const allData: Record<string, UserProjectData> = JSON.parse(storageData);
      const userKey = `${userId}_${projectId || 'default'}`;
      
      return allData[userKey] || null;
    } catch (error) {
      console.error('[LocalAutosave] Failed to load user data:', error);
      return null;
    }
  }

  // Private methods
  private startSaveCycle(): void {
    const cycle = () => {
      this.state.cycleStartTime = new Date();
      
      // Start saving phase (20 seconds)
      this.updateState({ status: 'saving' });
      
      // Perform the save
      this.performSave().then(() => {
        // After save completes, wait for the remainder of the 20 seconds
        const savePhaseRemaining = this.SAVE_DURATION - (Date.now() - this.state.cycleStartTime!.getTime());
        
        setTimeout(() => {
          // Switch to idle phase (10 seconds)
          this.updateState({ status: 'idle' });
          
          // After 10 seconds of idle, start next cycle
          setTimeout(() => {
            cycle();
          }, this.IDLE_DURATION);
        }, Math.max(0, savePhaseRemaining));
      }).catch((error) => {
        console.error('[LocalAutosave] Save failed:', error);
        this.updateState({ 
          status: 'error', 
          errorMessage: error.message 
        });
        
        // Still continue the cycle even on error
        setTimeout(() => {
          cycle();
        }, this.IDLE_DURATION);
      });
    };

    cycle();
  }

  private setupStoreSubscriptions(): void {
    // Save immediately on any store change
    useAssetStore.subscribe(() => {
      this.performSave();
    });

    useBackgroundStore.subscribe(() => {
      this.performSave();
    });

    useBookStore.subscribe(() => {
      this.performSave();
    });
  }

  private async performSave(): Promise<void> {
    const { user, isAuthenticated } = useAuthStore.getState();
    const { currentBookId } = useBookStore.getState();
    
    if (!isAuthenticated || !user) {
      console.log('[LocalAutosave] Skipping save - user not authenticated');
      return;
    }

    try {
      // Collect all user data
      const assetStore = useAssetStore.getState();
      const backgroundStore = useBackgroundStore.getState();
      const bookStore = useBookStore.getState();

      const userData: UserProjectData = {
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
        lastSaved: new Date().toISOString(),
      };

      // Save to localStorage
      await this.saveToLocalStorage(userData);
      
      this.state.saveCount++;
      this.updateState({ 
        lastSavedTime: new Date(),
        errorMessage: null 
      });

      console.log(`[LocalAutosave] Save completed (${this.state.saveCount} saves)`);
      
    } catch (error) {
      throw new Error(`Local save failed: ${error.message}`);
    }
  }

  private async saveToLocalStorage(userData: UserProjectData): Promise<void> {
    try {
      const storageData = localStorage.getItem(this.STORAGE_KEY);
      const allData: Record<string, UserProjectData> = storageData ? JSON.parse(storageData) : {};
      
      const userKey = `${userData.userId}_${userData.projectId || 'default'}`;
      allData[userKey] = userData;

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allData));
    } catch (error) {
      throw new Error(`LocalStorage write failed: ${error.message}`);
    }
  }

  private extractScreenPositions(assets: any): Record<string, { x: number; y: number; width: number; height: number }> {
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

  private extractFolderStructure(assets: any): Record<string, string[]> {
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

  private updateState(updates: Partial<LocalAutosaveState>): void {
    this.state = { ...this.state, ...updates };
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback(this.getState()));
  }
}

export const localAutosaveService = LocalAutosaveService.getInstance();
