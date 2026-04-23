import { supabase } from '@/lib/supabase';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { documentMutationService, type SyncStatus } from './DocumentMutationService';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type { SyncStatus };

interface AutosaveState {
  status: AutosaveStatus;
  lastSavedTime: Date | null;
  pendingChanges: boolean;
  errorMessage: string | null;
}

interface AutosaveQueue {
  assets: boolean;
  backgrounds: boolean;
  worldData: boolean;
}

class AutosaveService {
  private static instance: AutosaveService;
  private state: AutosaveState;
  private queue: AutosaveQueue;
  private debounceTimer: number | null = null;
  private autosaveTimer: number | null = null;
  private visibilityChangeHandler: (() => void) | null = null;
  private subscribers: Set<(state: AutosaveState) => void> = new Set();
  
  // Configurable intervals (in milliseconds) - optimized to reduce Supabase I/O
  private readonly DEBOUNCE_DELAY = 5000; // 5 seconds (increased from 2s to reduce writes)
  private readonly AUTOSAVE_INTERVAL = 30000; // 30 seconds (increased from 15s to reduce sync frequency)
  private readonly MANUAL_SAVE_INTERVAL = 10000; // 10 seconds for manual saves

  static getInstance(): AutosaveService {
    if (!AutosaveService.instance) {
      AutosaveService.instance = new AutosaveService();
    }
    return AutosaveService.instance;
  }

  private constructor() {
    this.state = {
      status: 'idle',
      lastSavedTime: null,
      pendingChanges: false,
      errorMessage: null,
    };
    this.queue = {
      assets: false,
      backgrounds: false,
      worldData: false,
    };

    this.setupStoreSubscriptions();
    this.setupVisibilityHandlers();
    this.startPeriodicAutosave();
  }

  private setupStoreSubscriptions(): void {
    // Subscribe to asset store changes with throttling
    let lastAssetChange = 0;
    const ASSET_THROTTLE_MS = 1000; // Throttle asset changes to 1 second
    
    const unsubscribeAssets = useAssetStore.subscribe(
      (state) => state,
      (state, prevState) => {
        if (state.bookAssets !== prevState.bookAssets) {
          const now = Date.now();
          if (now - lastAssetChange > ASSET_THROTTLE_MS) {
            lastAssetChange = now;
            this.queue.assets = true;
            this.queue.worldData = true;
            this.updateState({ pendingChanges: true });
            this.debounceAutosave();
          }
        }
      }
    );

    // Subscribe to background store changes with throttling
    let lastBackgroundChange = 0;
    const BACKGROUND_THROTTLE_MS = 1000; // Throttle background changes to 1 second
    
    const unsubscribeBackgrounds = useBackgroundStore.subscribe(
      (state) => state,
      (state, prevState) => {
        if (state.configs !== prevState.configs) {
          const now = Date.now();
          if (now - lastBackgroundChange > BACKGROUND_THROTTLE_MS) {
            lastBackgroundChange = now;
            this.queue.backgrounds = true;
            this.updateState({ pendingChanges: true });
            this.debounceAutosave();
          }
        }
      }
    );

    // Cleanup on service destruction (not typically needed in single-page apps)
    // return () => {
    //   unsubscribeAssets();
    //   unsubscribeBackgrounds();
    // };
  }

  private setupVisibilityHandlers(): void {
    const handleVisibilityChange = () => {
      if (document.hidden && this.state.pendingChanges) {
        console.log('[Autosave] Page hidden, performing emergency save');
        this.performAutosave();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Store handler for cleanup
    this.visibilityChangeHandler = handleVisibilityChange;

    // Cleanup on page unload to prevent memory leak
    window.addEventListener('beforeunload', () => {
      if (this.visibilityChangeHandler) {
        document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      }
    });
  }

  private debounceAutosave(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      this.performAutosave();
    }, this.DEBOUNCE_DELAY);
  }

  // Cloud-first autosave with smart queuing
  private async performAutosave(): Promise<void> {
    const { isAuthenticated } = useAuthStore.getState();
    const { isOnline } = useCloudStore.getState();
    
    this.updateState({ 
      status: 'saving', 
      errorMessage: null 
    });

    try {
      console.log('[AutosaveService] Starting cloud-first autosave cycle');
      
      // CRITICAL FIX: Mark all current assets as changed before syncing
      // This ensures manual saves actually save assets
      if (this.queue.assets || this.queue.worldData) {
        const assetStore = useAssetStore.getState();
        const currentBookId = assetStore.getCurrentBookId();
        if (currentBookId) {
          const bookAssets = assetStore.bookAssets[currentBookId] || {};
          Object.values(bookAssets).forEach((asset: any) => {
            documentMutationService.markAssetChanged(asset.id, asset);
          });
          console.log(`[AutosaveService] Marked ${Object.keys(bookAssets).length} assets as changed`);
        }
      }
      
      // For authenticated users: prioritize cloud sync
      if (isAuthenticated) {
        if (isOnline) {
          console.log('[AutosaveService] User authenticated and online, syncing to cloud');
          const cloudSyncSuccess = await documentMutationService.syncNow();
          
          if (cloudSyncSuccess) {
            console.log('[AutosaveService] Cloud sync successful');
            this.updateState({
              status: 'saved',
              lastSavedTime: new Date(),
              pendingChanges: false,
              errorMessage: null,
            });
            // Clear queue only after successful sync
            this.queue = {
              assets: false,
              backgrounds: false,
              worldData: false,
            };
          } else {
            console.log('[AutosaveService] Cloud sync failed, data queued for retry');
            this.updateState({
              status: 'error',
              lastSavedTime: new Date(),
              pendingChanges: true,
              errorMessage: 'Cloud sync failed - data queued for retry',
            });
            // Don't clear queue on failure - keep for retry
          }
        } else {
          console.log('[AutosaveService] User authenticated but offline, data queued');
          this.updateState({
            status: 'saved',
            lastSavedTime: new Date(),
            pendingChanges: true,
            errorMessage: 'Offline - changes queued for sync',
          });
        }
      } else {
        // For guest users: local save only (handled by zustand persist)
        console.log('[AutosaveService] Guest user - local save only');
        this.updateState({
          status: 'saved',
          lastSavedTime: new Date(),
          pendingChanges: false,
          errorMessage: null,
        });
        // Clear queue for guest users
        this.queue = {
          assets: false,
          backgrounds: false,
          worldData: false,
        };
      }

      console.log('[AutosaveService] Autosave completed successfully');

      // Reset to idle after showing saved status
      setTimeout(() => {
        if (this.state.status === 'saved') {
          this.updateState({ status: 'idle' });
        }
      }, 2000);

    } catch (error) {
      console.error('[AutosaveService] Autosave failed:', error);
      
      this.updateState({
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Autosave failed',
        pendingChanges: true,
      });

      // Reset to idle after error
      setTimeout(() => {
        this.updateState({ status: 'idle' });
      }, 5000);
    }
  }

  // Manual save with shorter interval
  async triggerManualSave(): Promise<boolean> {
    console.log('[AutosaveService] Manual save triggered');
    
    // Temporarily use shorter interval for manual save
    const originalInterval = this.AUTOSAVE_INTERVAL;
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
    }
    
    this.autosaveTimer = window.setInterval(() => {
      this.performPeriodicAutosave();
    }, this.MANUAL_SAVE_INTERVAL);

    // Clear debounce and trigger immediate save
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    await this.performAutosave();
    
    // Restore original interval after manual save
    setTimeout(() => {
      if (this.autosaveTimer) {
        clearInterval(this.autosaveTimer);
      }
      this.autosaveTimer = window.setInterval(() => {
        this.performPeriodicAutosave();
      }, originalInterval);
    }, 5000);

    return this.state.status === 'saved';
  }

  private async saveWorldData(userId: string, bookId: string, worldData: any): Promise<void> {
    // DocumentMutationService handles saving via RPC - no direct table writes
    // This method is kept for compatibility but now delegates to DocumentMutationService
    const assetStore = useAssetStore.getState();
    const assets = assetStore.getWorldData();

    // Track all asset changes using state-based tracking (MASTER_PLAN.md)
    const bookAssets = assets.assets || {};
    Object.values(bookAssets).forEach((asset: any) => {
      documentMutationService.markAssetChanged(asset.id, asset);
    });

    // Trigger immediate sync
    await documentMutationService.syncNow();
  }

  private async saveBackgroundData(userId: string, bookId: string, configs: any): Promise<void> {
    // DocumentMutationService handles saving via RPC - no direct table writes
    // Background configs are now stored in world_document via state-based tracking (MASTER_PLAN.md)
    const assetStore = useAssetStore.getState();
    const currentBookId = assetStore.getCurrentBookId();
    if (currentBookId) {
      const bookAssets = assetStore.bookAssets[currentBookId] || {};
      Object.entries(configs).forEach(([assetId, config]: [string, any]) => {
        if (assetId.startsWith('asset:')) {
          const realAssetId = assetId.replace('asset:', '');
          const asset = bookAssets[realAssetId];
          if (asset) {
            const updatedAsset = { ...asset, backgroundConfig: config };
            documentMutationService.markAssetChanged(realAssetId, updatedAsset);
          }
        }
      });
    }

    // Trigger immediate sync
    await documentMutationService.syncNow();
  }

  private startPeriodicAutosave(): void {
    this.autosaveTimer = window.setInterval(() => {
      this.performPeriodicAutosave();
    }, this.AUTOSAVE_INTERVAL);
  }

  private async performPeriodicAutosave(): Promise<void> {
    // Only perform periodic save if there are pending changes
    if (this.state.pendingChanges) {
      await this.performAutosave();
    }
  }

  stopPeriodicAutosave(): void {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private updateState(updates: Partial<AutosaveState>): void {
    this.state = { ...this.state, ...updates };
    this.notifySubscribers();
  }

  subscribe(callback: (state: AutosaveState) => void): () => void {
    this.subscribers.add(callback);
    callback(this.state); // Send current state immediately
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback(this.state));
  }

  getState(): AutosaveState {
    return { ...this.state };
  }

  // Force save regardless of pending changes
  async forceSave(): Promise<boolean> {
    this.updateState({ pendingChanges: true });
    return await this.triggerManualSave();
  }

  // Check if there are unsaved changes
  hasUnsavedChanges(): boolean {
    return this.state.pendingChanges;
  }

  // Get save status for UI display
  getSaveStatus(): {
    status: 'idle' | 'saving' | 'saved' | 'error';
    lastSavedTime: Date | null;
    errorMessage: string | null;
    pendingChanges: boolean;
    isOnline: boolean;
    isAuthenticated: boolean;
  } {
    const { isOnline } = useCloudStore.getState();
    const { isAuthenticated } = useAuthStore.getState();
    
    return {
      ...this.state,
      isOnline,
      isAuthenticated,
    };
  }

  isOnline(): boolean {
    return navigator.onLine;
  }

  async checkConnectivity(): Promise<boolean> {
    try {
      const response = await fetch('/api/health', { 
        method: 'HEAD',
        cache: 'no-cache'
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const autosaveService = AutosaveService.getInstance();
