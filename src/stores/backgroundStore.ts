import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { BackgroundConfig, BackgroundStore } from '@/types/background';
import { DEFAULT_BACKGROUND_CONFIG, getAssetKey } from '@/types/background';
import { getBackground as getBackgroundFromStorage, setBackground as setBackgroundToStorage, loadAllBackgrounds, loadAllBackgroundsAsync } from '@/utils/backgroundStorage';
import { documentMutationService } from '@/services/DocumentMutationService';

const storeInitTime = Date.now();
console.log('[BackgroundStore] ============================================');
console.log('[BackgroundStore] STORE INITIALIZING at', storeInitTime);
console.log('[BackgroundStore] ============================================');

// Debounce timers for background saves to prevent excessive writes
const backgroundSaveDebouncers = new Map<string, number>();
const BACKGROUND_DEBOUNCE_MS = 500; // 500ms debounce for background changes

export const useBackgroundStore = create<BackgroundStore>()(
  subscribeWithSelector(
    (set, get) => {
        // Initialize configs from localStorage on store creation
        console.log('[BackgroundStore] Running store creator function...');
        const initialConfigs = loadAllBackgrounds() || {};
        const configCount = Object.keys(initialConfigs).length;
        console.log(`[BackgroundStore] Initial sync load complete: ${configCount} backgrounds found`);

        // Async load images from IndexedDB to restore actual image URLs
        // The sync load only gets metadata (with imageUrl: null), we need to fetch the actual images
        if (configCount > 0) {
          console.log('[BackgroundStore] Starting async IndexedDB image load...');
          loadAllBackgroundsAsync().then(loadedConfigs => {
            const loadedCount = Object.keys(loadedConfigs).length;
            const configsWithImages = Object.entries(loadedConfigs).filter(([_, config]) => config.imageUrl).length;
            console.log(`[BackgroundStore] ✅ Async load complete: ${loadedCount} configs, ${configsWithImages} with images`);
            
            // Merge loaded configs with current state (preserving any in-memory changes)
            set((state) => ({
              configs: {
                ...state.configs,
                ...loadedConfigs
              }
            }));
            console.log('[BackgroundStore] Store updated with images from IndexedDB');
          }).catch(error => {
            console.error('[BackgroundStore] Failed to load images from IndexedDB:', error);
          });
        } else {
          console.log('[BackgroundStore] ✅ Store initialized - no backgrounds to load');
        }

        return {
          configs: initialConfigs,

          getBackground: (assetId: string) => {
            const state = get();
            const key = getAssetKey(assetId);

            // Try to get from in-memory store first
            if (state.configs[key]) {
              return state.cloneConfig(state.configs[key]);
            }

            // Fallback to localStorage and update store
            const localStorageConfig = getBackgroundFromStorage(key);
            set((state) => ({
              configs: {
                ...state.configs,
                [key]: localStorageConfig,
              },
            }));

            return localStorageConfig;
          },

          setBackground: (assetId: string, config: BackgroundConfig) => {
            const key = getAssetKey(assetId);
            const clonedConfig = get().cloneConfig(config);

            console.log(`[BackgroundStore] Setting background for ${assetId} (key: ${key}):`, clonedConfig.mode);

            // Update in-memory store immediately (no debounce needed for UI)
            set((state) => ({
              configs: {
                ...state.configs,
                [key]: clonedConfig,
              },
            }));

            // Debounce localStorage and cloud sync to prevent excessive writes
            // Clear existing timer for this asset
            if (backgroundSaveDebouncers.has(key)) {
              clearTimeout(backgroundSaveDebouncers.get(key)!);
            }

            // Set new debounced timer
            backgroundSaveDebouncers.set(key, window.setTimeout(() => {
              // Persist to localStorage
              setBackgroundToStorage(key, clonedConfig);
              console.log(`[BackgroundStore] Saved background to localStorage for ${assetId}`);
              
              // Sync backgrounds using saveGlobalBackgrounds (MASTER_PLAN.md state-based tracking)
              // This stores all background configs in world_document.backgrounds as single source of truth
              // Only sync if a project is loaded (user has entered a book)
              const updatedConfigs = {
                ...get().configs,
                [key]: clonedConfig
              };
              if (documentMutationService.getCurrentProjectId()) {
                documentMutationService.saveGlobalBackgrounds(updatedConfigs);
              } else {
                console.log('[BackgroundStore] Background saved locally - will sync when book is entered');
              }
              
              // Clean up timer
              backgroundSaveDebouncers.delete(key);
            }, BACKGROUND_DEBOUNCE_MS));
          },

          cloneConfig: (config: BackgroundConfig): BackgroundConfig => {
            try {
              // Use safe serialization to prevent circular reference issues
              const jsonString = JSON.stringify(config, (key, val) => {
                if (typeof val === 'object' && val !== null) {
                  // Check for circular references
                  if (val.constructor && val.constructor.name === 'Object') {
                    return val;
                  }
                  // Handle potential circular references in complex objects
                  if (key === 'parent' || key === 'children') {
                    return undefined;
                  }
                }
                return val;
              });
              return JSON.parse(jsonString);
            } catch (error) {
              console.error('[BackgroundStore] Failed to clone config:', error);
              // Fallback to shallow clone
              return { ...config };
            }
          },

          migrateLegacyConfig: (legacyConfig: any): BackgroundConfig => {
            // Convert old toggle-based config to new mode-based config
            let mode: "glass" | "parchment" | "color" = "glass";
            
            if (legacyConfig.useParchment) {
              mode = "parchment";
            } else if (legacyConfig.isClear === false) {
              mode = "color";
            } else {
              mode = "glass";
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
      }
    )
);

// Helper function for getting asset key with book context
export function getAssetKeyWithBook(assetId: string, bookId?: string): string {
  if (assetId === "root" && bookId) {
    return `root:${bookId}`;
  }
  return `asset:${assetId}`;
}
