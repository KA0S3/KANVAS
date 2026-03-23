import { create } from 'zustand';
import { subscribeWithSelector, persist, createJSONStorage } from 'zustand/middleware';
import type { BackgroundConfig, BackgroundStore } from '@/types/background';
import { DEFAULT_BACKGROUND_CONFIG, getAssetKey } from '@/types/background';
import { getBackground as getBackgroundFromStorage, setBackground as setBackgroundToStorage, loadAllBackgrounds } from '@/utils/backgroundStorage';

export const useBackgroundStoreFixed = create<BackgroundStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => {
        // Initialize configs from localStorage on store creation
        const initialConfigs = loadAllBackgrounds();

        return {
          configs: initialConfigs,

          getBackground: (assetId: string) => {
            const state = get();
            const key = getAssetKey(assetId);
            
            // Try to get from in-memory store first
            if (state.configs[key]) {
              return state.cloneConfig(state.configs[key]);
            }
            
            // Return default config without triggering setState during render
            return state.cloneConfig(DEFAULT_BACKGROUND_CONFIG);
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
            
            // Persist to localStorage in a timeout to prevent render loops
            setTimeout(() => {
              try {
                setBackgroundToStorage(key, clonedConfig);
              } catch (error) {
                console.error(`Error saving background config for ${assetId}:`, error);
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
        name: 'kanvas-background-storage-fixed',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          configs: state.configs,
        }),
        onRehydrateStorage: () => (state) => {
          // Prevent setState during rehydration
          console.log('[BackgroundStoreFixed] Rehydrated background configs');
        },
      }
    )
  )
);

// Helper function for getting asset key with book context
export function getAssetKeyWithBookFixed(assetId: string, bookId?: string): string {
  if (assetId === "root" && bookId) {
    return `root:${bookId}`;
  }
  return `asset:${assetId}`;
}
