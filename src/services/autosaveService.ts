import { supabase } from '@/lib/supabase';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { optimizedSyncService } from './optimizedSyncService';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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
  private subscribers: Set<(state: AutosaveState) => void> = new Set();
  
  // Configurable intervals (in milliseconds)
  private readonly DEBOUNCE_DELAY = 2000; // 2 seconds
  private readonly AUTOSAVE_INTERVAL = 15000; // 15 seconds (reduced from 60)
  private readonly MANUAL_SAVE_INTERVAL = 5000; // 5 seconds for manual saves

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
    this.startPeriodicAutosave();
  }

  private setupStoreSubscriptions(): void {
    // Subscribe to asset store changes
    const unsubscribeAssets = useAssetStore.subscribe(
      (state) => state,
      (state, prevState) => {
        if (state.bookAssets !== prevState.bookAssets) {
          this.queue.assets = true;
          this.queue.worldData = true;
          this.updateState({ pendingChanges: true });
          this.debounceAutosave();
        }
      }
    );

    // Subscribe to background store changes
    const unsubscribeBackgrounds = useBackgroundStore.subscribe(
      (state) => state,
      (state, prevState) => {
        if (state.configs !== prevState.configs) {
          this.queue.backgrounds = true;
          this.updateState({ pendingChanges: true });
          this.debounceAutosave();
        }
      }
    );

    // Cleanup on service destruction (not typically needed in single-page apps)
    // return () => {
    //   unsubscribeAssets();
    //   unsubscribeBackgrounds();
    // };
  }

  private debounceAutosave(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      this.performAutosave();
    }, this.DEBOUNCE_DELAY);
  }

  // Cloud-first autosave
  private async performAutosave(): Promise<void> {
    const { isAuthenticated } = useAuthStore.getState();
    const { isOnline } = useCloudStore.getState();
    
    this.updateState({ 
      status: 'saving', 
      errorMessage: null 
    });

    try {
      console.log('[AutosaveService] Starting cloud-first autosave cycle');
      
      // For authenticated users: prioritize cloud sync
      if (isAuthenticated) {
        if (isOnline) {
          console.log('[AutosaveService] User authenticated and online, syncing to cloud');
          const cloudSyncSuccess = await optimizedSyncService.syncToCloud();
          
          if (cloudSyncSuccess) {
            console.log('[AutosaveService] Cloud sync successful');
            this.updateState({
              status: 'saved',
              lastSavedTime: new Date(),
              pendingChanges: false,
              errorMessage: null,
            });
          } else {
            console.log('[AutosaveService] Cloud sync failed, data queued for retry');
            this.updateState({
              status: 'error',
              lastSavedTime: new Date(),
              pendingChanges: true,
              errorMessage: 'Cloud sync failed - data queued for retry',
            });
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
      }

      // Clear queue after successful save
      this.queue = {
        assets: false,
        backgrounds: false,
        worldData: false,
      };

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
    // Save world data to projects table metadata field
    const { error } = await supabase
      .from('projects')
      .upsert({
        id: bookId, // Using bookId as projectId
        user_id: userId,
        name: worldData.bookTitle || 'Untitled Project',
        description: JSON.stringify(worldData),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id,user_id'
      });

    if (error) {
      throw new Error(`Failed to save world data: ${error.message}`);
    }
  }

  private async saveBackgroundData(userId: string, bookId: string, configs: any): Promise<void> {
    // Save background configs to assets table as metadata
    const { error } = await supabase
      .from('assets')
      .upsert({
        id: `${bookId}-backgrounds`, // Unique ID for background configs
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
      throw new Error(`Failed to save background data: ${error.message}`);
    }
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
