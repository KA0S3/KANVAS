import { create } from 'zustand';
import { subscribeWithSelector, persist, createJSONStorage } from 'zustand/middleware';
import type { BackgroundConfig, BackgroundStore } from '@/types/background';
import { DEFAULT_BACKGROUND_CONFIG, getAssetKey } from '@/types/background';
import { getBackground as getBackgroundFromStorage, setBackground as setBackgroundToStorage, loadAllBackgrounds } from '@/utils/backgroundStorage';

export const useBackgroundStore = create<BackgroundStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => {
        // Initialize configs from localStorage on store creation
        const initialConfigs = loadAllBackgrounds() || {};

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
            
            // Update in-memory store
            set((state) => ({
              configs: {
                ...state.configs,
                [key]: clonedConfig,
              },
            }));
            
            // Persist to localStorage immediately
            setBackgroundToStorage(key, clonedConfig);
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
      },
      {
        name: 'kanvas-background-storage',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          configs: state.configs,
        }),
      }
    )
  )
);

// Helper function for getting asset key with book context
export function getAssetKeyWithBook(assetId: string, bookId?: string): string {
  if (assetId === "root" && bookId) {
    return `root:${bookId}`;
  }
  return `asset:${assetId}`;
}
