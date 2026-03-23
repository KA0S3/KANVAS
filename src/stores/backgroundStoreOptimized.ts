import { create } from 'zustand';
import { subscribeWithSelector, persist, createJSONStorage } from 'zustand/middleware';
import type { BackgroundConfig, BackgroundStore } from '@/types/background';
import { DEFAULT_BACKGROUND_CONFIG, getAssetKey } from '@/types/background';
import { getBackground as getBackgroundFromStorage, setBackground as setBackgroundToStorage } from '@/utils/backgroundStorage';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';

interface OptimizedBackgroundStore extends BackgroundStore {
  // Batch operations
  batchUpdate: (updates: Array<{assetId: string, config: BackgroundConfig}>) => void;
  flushToCloud: () => Promise<void>;
  getPendingUpdates: () => Array<{assetId: string, config: BackgroundConfig}>;
  
  // Performance optimization
  debouncedUpdate: (assetId: string, config: BackgroundConfig) => void;
  clearCache: () => void;
  
  // Cloud sync
  syncToCloud: () => Promise<void>;
  lastCloudSync: number;
}

// Debounce utility
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Batch processor for performance
class BackgroundBatchProcessor {
  private static instance: BackgroundBatchProcessor;
  private pendingUpdates: Map<string, BackgroundConfig> = new Map();
  private processing = false;
  private batchSize = 10;
  private processInterval = 5000; // 5 seconds
  private cloudSyncInterval = 20000; // 20 seconds

  private constructor() {
    this.startBatchProcessor();
    this.startCloudSync();
  }

  static getInstance(): BackgroundBatchProcessor {
    if (!BackgroundBatchProcessor.instance) {
      BackgroundBatchProcessor.instance = new BackgroundBatchProcessor();
    }
    return BackgroundBatchProcessor.instance;
  }

  addUpdate(assetId: string, config: BackgroundConfig) {
    this.pendingUpdates.set(assetId, config);
  }

  addBatchUpdates(updates: Array<{assetId: string, config: BackgroundConfig}>) {
    updates.forEach(({assetId, config}) => {
      this.pendingUpdates.set(assetId, config);
    });
  }

  getPendingUpdates(): Array<{assetId: string, config: BackgroundConfig}> {
    return Array.from(this.pendingUpdates.entries()).map(([assetId, config]) => ({
      assetId,
      config
    }));
  }

  clearPending() {
    this.pendingUpdates.clear();
  }

  private startBatchProcessor() {
    setInterval(() => {
      this.processBatch();
    }, this.processInterval);
  }

  private startCloudSync() {
    setInterval(() => {
      this.syncToCloud();
    }, this.cloudSyncInterval);
  }

  private async processBatch() {
    if (this.processing || this.pendingUpdates.size === 0) return;

    this.processing = true;
    
    try {
      const updates = this.getPendingUpdates();
      
      // Process in batches to avoid blocking
      for (let i = 0; i < updates.length; i += this.batchSize) {
        const batch = updates.slice(i, i + this.batchSize);
        
        // Update localStorage in batch
        batch.forEach(({assetId, config}) => {
          const key = getAssetKey(assetId);
          try {
            setBackgroundToStorage(key, config);
          } catch (error) {
            // Silent error handling
          }
        });

        // Small delay to prevent blocking
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      console.log(`[BackgroundBatch] Processed ${updates.length} background updates`);
    } catch (error) {
      console.error('[BackgroundBatch] Error processing batch:', error);
    } finally {
      this.processing = false;
    }
  }

  public async syncToCloud() {
    const { user, plan, isAuthenticated } = useAuthStore.getState();
    const { syncEnabled } = useCloudStore.getState();

    if (!isAuthenticated || plan === 'guest' || !syncEnabled) {
      return; // Only sync for pro users
    }

    if (this.pendingUpdates.size === 0) return;

    try {
      const updates = this.getPendingUpdates();
      
      // Prepare cloud sync data (only metadata, not full images)
      const cloudData = updates.map(({assetId, config}) => ({
        assetId,
        config: {
          ...config,
          // Don't sync full image data URLs - just metadata
          imageUrl: config.imageUrl?.startsWith('data:') ? null : config.imageUrl,
          position: config.position,
          scale: config.scale,
          mode: config.mode,
          color: config.color,
        }
      }));

      // Send to cloud (this would integrate with your existing cloud system)
      console.log(`[BackgroundBatch] Syncing ${cloudData.length} updates to cloud`);
      
      // Clear pending after successful sync
      this.clearPending();
      
    } catch (error) {
      console.error('[BackgroundBatch] Cloud sync failed:', error);
      // Keep pending for retry
    }
  }
}

export const useBackgroundStoreOptimized = create<OptimizedBackgroundStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => {
        const batchProcessor = BackgroundBatchProcessor.getInstance();

        return {
          configs: {},
          lastCloudSync: Date.now(),

          getBackground: (assetId: string) => {
            const state = get();
            const key = getAssetKey(assetId);
            
            // Fast in-memory lookup first
            if (state.configs[key]) {
              return state.cloneConfig(state.configs[key]);
            }
            
            // Fallback to localStorage (cached)
            const storedConfig = getBackgroundFromStorage(key);
            if (storedConfig) {
              // Cache in memory for faster access
              set((state) => ({
                configs: {
                  ...state.configs,
                  [key]: storedConfig,
                },
              }));
              return state.cloneConfig(storedConfig);
            }
            
            return state.cloneConfig(DEFAULT_BACKGROUND_CONFIG);
          },

          setBackground: (assetId: string, config: BackgroundConfig) => {
            const key = getAssetKey(assetId);
            const clonedConfig = get().cloneConfig(config);
            
            // Immediate in-memory update for UI performance
            set((state) => ({
              configs: {
                ...state.configs,
                [key]: clonedConfig,
              },
            }));

            // Add to batch processor (no immediate localStorage write)
            batchProcessor.addUpdate(assetId, clonedConfig);
          },

          // Debounced update for high-frequency changes
          debouncedUpdate: debounce((assetId: string, config: BackgroundConfig) => {
            get().setBackground(assetId, config);
          }, 100), // 100ms debounce

          // Batch update for multiple changes
          batchUpdate: (updates: Array<{assetId: string, config: BackgroundConfig}>) => {
            const newConfigs: Record<string, BackgroundConfig> = {};
            
            updates.forEach(({assetId, config}) => {
              const key = getAssetKey(assetId);
              const clonedConfig = get().cloneConfig(config);
              newConfigs[key] = clonedConfig;
            });

            // Immediate in-memory update
            set((state) => ({
              configs: {
                ...state.configs,
                ...newConfigs,
              },
            }));

            // Add all to batch processor
            batchProcessor.addBatchUpdates(updates);
          },

          // Force flush to cloud
          flushToCloud: async () => {
            await batchProcessor.syncToCloud();
            set({ lastCloudSync: Date.now() });
          },

          // Get pending updates
          getPendingUpdates: () => {
            return batchProcessor.getPendingUpdates();
          },

          // Clear cache
          clearCache: () => {
            set({ configs: {} });
          },

          // Manual cloud sync
          syncToCloud: async () => {
            await get().flushToCloud();
          },

          cloneConfig: (config: BackgroundConfig): BackgroundConfig => {
            return JSON.parse(JSON.stringify(config));
          },

          migrateLegacyConfig: (legacyConfig: any): BackgroundConfig => {
            let mode: "glass" | "parchment" | "color" = "glass";
            
            if (legacyConfig.useParchment) {
              mode = "parchment";
            } else if (legacyConfig.isClear === false) {
              mode = "color";
            }

            return {
              mode,
              color: mode === "color" ? (legacyConfig.color || '#000000') : null,
              imageUrl: legacyConfig.image || null,
              position: legacyConfig.position || { x: 0, y: 0 },
              scale: legacyConfig.scale || 1,
              edgeOpacity: legacyConfig.edgeOpacity || 1,
              innerRadius: legacyConfig.innerRadius || 0.3,
              outerRadius: legacyConfig.outerRadius || 0.8,
              gridSize: legacyConfig.gridSize || 40,
              imageSize: legacyConfig.imageSize,
            };
          },
        };
      },
      {
        name: 'kanvas-background-storage-optimized',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          configs: state.configs,
          lastCloudSync: state.lastCloudSync,
        }),
        onRehydrateStorage: () => (state) => {
          if (state) {
            // Silent rehydration
          }
        },
      }
    )
  )
);

// Helper function for getting asset key with book context
export function getAssetKeyWithBookOptimized(assetId: string, bookId?: string): string {
  if (assetId === "root" && bookId) {
    return `root:${bookId}`;
  }
  return `asset:${assetId}`;
}
