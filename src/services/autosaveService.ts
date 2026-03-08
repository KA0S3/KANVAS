import { supabase } from '@/lib/supabase';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { assetUploadService } from './assetUploadService';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface AutosaveState {
  status: AutosaveStatus;
  lastSavedTime: Date | null;
  errorMessage: string | null;
  pendingChanges: boolean;
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
  private autosaveInterval: number | null = null;
  private debounceTimer: number | null = null;
  private subscribers: Set<(state: AutosaveState) => void> = new Set();
  private readonly AUTOSAVE_INTERVAL = 60000; // 60 seconds
  private readonly DEBOUNCE_DELAY = 2000; // 2 seconds

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
      errorMessage: null,
      pendingChanges: false,
    };
    this.queue = {
      assets: false,
      backgrounds: false,
      worldData: false,
    };
  }

  // Public API
  startAutosave(): void {
    if (this.autosaveInterval) return;

    console.log('[AutosaveService] Starting autosave');
    
    // Set up store subscriptions
    this.setupStoreSubscriptions();
    
    // Set up periodic autosave
    this.autosaveInterval = window.setInterval(() => {
      this.performAutosave();
    }, this.AUTOSAVE_INTERVAL);

    // Initial save if there are pending changes
    if (this.hasPendingChanges()) {
      this.performAutosave();
    }
  }

  stopAutosave(): void {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    console.log('[AutosaveService] Stopped autosave');
  }

  async triggerManualSave(): Promise<void> {
    console.log('[AutosaveService] Manual save triggered');
    await this.performAutosave();
  }

  getStatus(): AutosaveStatus {
    return this.state.status;
  }

  getLastSavedTime(): Date | null {
    return this.state.lastSavedTime;
  }

  getErrorMessage(): string | null {
    return this.state.errorMessage;
  }

  hasPendingChanges(): boolean {
    return this.state.pendingChanges;
  }

  subscribe(callback: (state: AutosaveState) => void): () => void {
    this.subscribers.add(callback);
    callback(this.getState());
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  getState(): AutosaveState {
    return { ...this.state };
  }

  // Private methods
  private setupStoreSubscriptions(): void {
    // Subscribe to asset store changes
    useAssetStore.subscribe((state) => {
      // Queue asset changes when assets or global custom fields change
      this.queueChange('assets');
    });

    // Subscribe to background store changes
    useBackgroundStore.subscribe((state) => {
      this.queueChange('backgrounds');
    });

    // Subscribe to book store changes
    useBookStore.subscribe((state) => {
      if (state.currentBookId) {
        this.queueChange('worldData');
      }
    });
  }

  private queueChange(type: keyof AutosaveQueue): void {
    this.queue[type] = true;
    this.updateState({ pendingChanges: true });

    // Debounce rapid changes
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      if (this.hasPendingChanges()) {
        this.performAutosave();
      }
    }, this.DEBOUNCE_DELAY);
  }

  private async performAutosave(): Promise<void> {
    const { isAuthenticated, user } = useAuthStore.getState();
    
    if (!isAuthenticated || !user) {
      console.log('[AutosaveService] Skipping autosave - user not authenticated');
      return;
    }

    if (!this.hasPendingChanges()) {
      console.log('[AutosaveService] No pending changes to save');
      return;
    }

    this.updateState({ 
      status: 'saving', 
      errorMessage: null 
    });

    try {
      console.log('[AutosaveService] Starting autosave cycle');
      
      // Save assets and world data to Supabase
      await this.saveToSupabase();
      
      // Clear queue
      this.queue = {
        assets: false,
        backgrounds: false,
        worldData: false,
      };

      this.updateState({
        status: 'saved',
        lastSavedTime: new Date(),
        pendingChanges: false,
        errorMessage: null,
      });

      console.log('[AutosaveService] Autosave completed successfully');

      // Reset to idle after a short delay
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
      });

      // Reset to idle after error
      setTimeout(() => {
        this.updateState({ status: 'idle' });
      }, 5000);
    }
  }

  private async saveToSupabase(): Promise<void> {
    const { user } = useAuthStore.getState();
    const { currentBookId } = useBookStore.getState();
    
    if (!user || !currentBookId) {
      throw new Error('User or current book not available');
    }

    const savePromises: Promise<void>[] = [];

    // Save assets and world data if changed
    if (this.queue.assets || this.queue.worldData) {
      const assetStore = useAssetStore.getState();
      const worldData = {
        assets: assetStore.assets,
        globalCustomFields: assetStore.globalCustomFields,
      };

      savePromises.push(this.saveWorldData(user.id, currentBookId, worldData));
    }

    // Save backgrounds if changed
    if (this.queue.backgrounds) {
      const backgroundStore = useBackgroundStore.getState();
      savePromises.push(this.saveBackgroundData(user.id, currentBookId, backgroundStore.configs));
    }

    await Promise.all(savePromises);
  }

  private async saveWorldData(userId: string, bookId: string, worldData: any): Promise<void> {
    const { error } = await supabase
      .from('books')
      .update({
        world_data: worldData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to save world data: ${error.message}`);
    }
  }

  private async saveBackgroundData(userId: string, bookId: string, configs: any): Promise<void> {
    // Save background configs to user preferences or a separate table
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        book_id: bookId,
        preference_type: 'background_configs',
        preference_data: configs,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,book_id,preference_type'
      });

    if (error) {
      throw new Error(`Failed to save background data: ${error.message}`);
    }
  }

  private updateState(updates: Partial<AutosaveState>): void {
    this.state = { ...this.state, ...updates };
    
    // Update cloud store status for global access
    const cloudStore = useCloudStore.getState();
    if (updates.status) {
      cloudStore.setAutosaveStatus(updates.status);
    }
    if (updates.lastSavedTime) {
      cloudStore.setLastSyncTime(updates.lastSavedTime);
    }
    
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback(this.getState()));
  }

  // Utility methods
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
