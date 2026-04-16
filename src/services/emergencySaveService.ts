import { connectivityService } from './connectivityService';
import { useAssetStore } from '@/stores/assetStore';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { documentMutationService } from './DocumentMutationService';

interface EmergencyBackup {
  assets: Record<string, any>;
  backgrounds: Record<string, any>;
  projectId: string | null;
  timestamp: number;
}

class EmergencySaveService {
  private static instance: EmergencySaveService;
  private isInitialized: boolean = false;

  static getInstance(): EmergencySaveService {
    if (!EmergencySaveService.instance) {
      EmergencySaveService.instance = new EmergencySaveService();
    }
    return EmergencySaveService.instance;
  }

  private constructor() {
    // Don't initialize immediately - wait for explicit call
  }

  initialize(): void {
    if (this.isInitialized) return;
    
    this.setupEmergencyHandlers();
    this.isInitialized = true;
    console.log('[EmergencySave] Service initialized');
  }

  private setupEmergencyHandlers(): void {
    // Save on beforeunload (works in most browsers)
    window.addEventListener('beforeunload', (e) => {
      this.performEmergencySave();
      // Note: Modern browsers ignore custom messages, but the save will execute
    });

    // Save on pagehide (more reliable, especially on mobile)
    window.addEventListener('pagehide', (e) => {
      this.performEmergencySave();
    });

    // Save on visibility change (user switches tabs)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.performEmergencySave();
      }
    });

    console.log('[EmergencySave] Event handlers registered');
  }

  private async performEmergencySave(): Promise<void> {
    try {
      console.log('[EmergencySave] Performing emergency save');
      
      // 1. Save to localStorage immediately (fast, synchronous-ish)
      this.saveToLocalStorage();
      
      // 2. If online, attempt sync to Supabase via DocumentMutationService
      if (connectivityService.isOnline()) {
        // Use sendBeacon for reliable delivery during unload
        this.sendBeaconSync();
        
        // Also try immediate sync (may not complete during unload)
        documentMutationService.syncNow().catch(err => {
          console.warn('[EmergencySave] Immediate sync failed (expected during unload):', err);
        });
      }
    } catch (error) {
      console.error('[EmergencySave] Emergency save failed:', error);
    }
  }

  private saveToLocalStorage(): void {
    try {
      const assetStore = useAssetStore.getState();
      const backgroundStore = useBackgroundStore.getState();
      const bookStore = useBookStore.getState();
      
      const emergencyData: EmergencyBackup = {
        assets: assetStore.getCurrentBookAssets(),
        backgrounds: backgroundStore.configs || {},
        projectId: bookStore.currentBookId || null,
        timestamp: Date.now()
      };
      
      localStorage.setItem('kanvas-emergency-backup', JSON.stringify(emergencyData));
      console.log('[EmergencySave] Emergency backup saved to localStorage');
    } catch (error) {
      console.error('[EmergencySave] Failed to save to localStorage:', error);
    }
  }

  private sendBeaconSync(): void {
    try {
      const bookStore = useBookStore.getState();
      const projectId = bookStore.currentBookId;
      
      if (!projectId) {
        console.log('[EmergencySave] No project ID, skipping beacon sync');
        return;
      }

      const data = {
        projectId,
        timestamp: Date.now(),
        type: 'emergency-sync'
      };
      
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const sent = navigator.sendBeacon('/api/emergency-sync', blob);
      
      console.log(`[EmergencySave] Beacon sync ${sent ? 'sent' : 'failed'}`);
    } catch (error) {
      console.error('[EmergencySave] Beacon sync failed:', error);
    }
  }

  /**
   * Load emergency backup if available
   * Call this on app startup to recover from unexpected closure
   */
  loadEmergencyBackup(): EmergencyBackup | null {
    try {
      const backup = localStorage.getItem('kanvas-emergency-backup');
      if (!backup) return null;

      const data = JSON.parse(backup) as EmergencyBackup;
      
      // Only restore if backup is recent (within 24 hours)
      const hoursSinceBackup = (Date.now() - data.timestamp) / (1000 * 60 * 60);
      if (hoursSinceBackup > 24) {
        console.log('[EmergencySave] Backup too old, ignoring');
        localStorage.removeItem('kanvas-emergency-backup');
        return null;
      }

      console.log('[EmergencySave] Emergency backup found, age:', hoursSinceBackup.toFixed(2), 'hours');
      return data;
    } catch (error) {
      console.error('[EmergencySave] Failed to load emergency backup:', error);
      return null;
    }
  }

  /**
   * Clear emergency backup after successful sync
   */
  clearEmergencyBackup(): void {
    localStorage.removeItem('kanvas-emergency-backup');
    console.log('[EmergencySave] Emergency backup cleared');
  }

  /**
   * Check if emergency backup exists
   */
  hasEmergencyBackup(): boolean {
    return localStorage.getItem('kanvas-emergency-backup') !== null;
  }
}

export const emergencySaveService = EmergencySaveService.getInstance();
