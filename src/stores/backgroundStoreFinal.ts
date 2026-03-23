import { create } from 'zustand';
import { subscribeWithSelector, persist, createJSONStorage } from 'zustand/middleware';
import type { BackgroundConfig, BackgroundStore } from '@/types/background';
import { DEFAULT_BACKGROUND_CONFIG, getAssetKey } from '@/types/background';
import { getBackground as getBackgroundFromStorage, setBackground as setBackgroundToStorage } from '@/utils/backgroundStorage';

export const useBackgroundStoreFinal = create<BackgroundStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => {
        return {
          configs: {},

          getBackground: (assetId: string) => {
            const state = get();
            const key = getAssetKey(assetId);
            
            // Try to get from in-memory store first
            if (state.configs[key]) {
              return state.cloneConfig(state.configs[key]);
            }
            
            // Try to get from localStorage
            const storedConfig = getBackgroundFromStorage(key);
            if (storedConfig) {
              return state.cloneConfig(storedConfig);
            }
            
            // Return default config without triggering setState during render
            return state.cloneConfig(DEFAULT_BACKGROUND_CONFIG);
          },

          setBackground: (assetId: string, config: BackgroundConfig) => {
            const key = getAssetKey(assetId);
            const clonedConfig = get().cloneConfig(config);
            
            // Update in-memory store immediately
            set((state) => ({
              configs: {
                ...state.configs,
                [key]: clonedConfig,
              },
            }));
            
            // Persist to localStorage in a timeout to prevent render loops
            setTimeout(() => {
              try {
                setBackgroundToStorage(key, clonedConfig);
              } catch (error) {
                // Silent error handling to prevent console spam
                // Only log in development
                if (process.env.NODE_ENV === 'development') {
                  console.error(`Background save error for ${assetId}:`, error);
                }
              }
            }, 0);
          },

          cloneConfig: (config: BackgroundConfig): BackgroundConfig => {
            return JSON.parse(JSON.stringify(config));
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
        name: 'kanvas-background-storage-final',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          configs: state.configs,
        }),
        onRehydrateStorage: () => (state) => {
          if (state) {
            // Silent rehydration - no console logs
          }
        },
      }
    )
  )
);

// Helper function for getting asset key with book context
export function getAssetKeyWithBookFinal(assetId: string, bookId?: string): string {
  if (assetId === "root" && bookId) {
    return `root:${bookId}`;
  }
  return `asset:${assetId}`;
}
