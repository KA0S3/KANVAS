import { create } from 'zustand';
import { subscribeWithSelector, persist, createJSONStorage } from 'zustand/middleware';
import type { BackgroundConfig, BackgroundStore } from '@/types/background';
import { DEFAULT_BACKGROUND_CONFIG, getAssetKey } from '@/types/background';
import { indexedDBStorage } from '@/utils/indexedDBStorage';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';

// Extended BackgroundConfig interface for enhanced storage
interface EnhancedBackgroundConfig extends BackgroundConfig {
  cloudBacked?: boolean;
  cloudUrl?: string;
  indexedDBStored?: boolean;
  indexedDBRef?: string;
  originalSize?: number;
  compressedSize?: number;
}

interface EnhancedBackgroundStore extends BackgroundStore {
  // Enhanced methods
  loadBackgroundImage: (assetId: string) => Promise<string | null>;
  cleanupOldBackgrounds: () => Promise<void>;
  getStorageInfo: () => Promise<{
    indexedDB: { count: number; totalSize: number; compressedSize: number };
    localStorage: { size: number; count: number };
  }>;
  setConfigs: (configs: Record<string, BackgroundConfig>) => void;
}

export const useBackgroundStoreEnhanced = create<EnhancedBackgroundStore>()(
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
            
            // Return default config without triggering setState during render
            return state.cloneConfig(DEFAULT_BACKGROUND_CONFIG);
          },

          setBackground: async (assetId: string, config: BackgroundConfig) => {
            const key = getAssetKey(assetId);
            const clonedConfig = get().cloneConfig(config);
            
            // Update in-memory store immediately
            set((state) => ({
              configs: {
                ...state.configs,
                [key]: clonedConfig,
              },
            }));

            // Handle image storage based on user plan
            if (config.imageUrl && config.imageUrl.startsWith('data:')) {
              await handleImageStorage(assetId, config, clonedConfig);
            } else {
              // For non-data URLs or cloud URLs, just persist metadata
              persistMetadata(key, clonedConfig);
            }
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

          // Enhanced methods
          loadBackgroundImage: async (assetId: string): Promise<string | null> => {
            try {
              const state = get();
              const key = getAssetKey(assetId);
              const config = state.configs[key] as EnhancedBackgroundConfig;

              if (!config) return null;

              // If image is cloud-backed, return cloud URL
              if (config.cloudBacked && config.cloudUrl) {
                return config.cloudUrl;
              }

              // If image is stored in IndexedDB, load it
              if (config.indexedDBStored || config.indexedDBRef) {
                const imageUrl = await indexedDBStorage.getImage(assetId);
                if (imageUrl) {
                  // Update config with loaded image
                  const updatedConfig = { ...config, imageUrl };
                  set((state) => ({
                    configs: { ...state.configs, [key]: updatedConfig }
                  }));
                  return imageUrl;
                }
              }

              // Return existing image URL if any
              return config.imageUrl || null;

            } catch (error) {
              console.error('Failed to load background image:', error);
              return null;
            }
          },

          cleanupOldBackgrounds: async () => {
            const stats = await indexedDBStorage.getStorageStats();
            console.log('IndexedDB storage stats:', stats);
            
            // Auto-cleanup if using too much space
            if (stats.count > 100) {
              console.log('Cleaning up old background images...');
              await indexedDBStorage.clearAll();
            }
          },

          getStorageInfo: async () => {
            const indexedDBStats = await indexedDBStorage.getStorageStats();
            
            // Calculate localStorage usage
            let localStorageSize = 0;
            for (let key in localStorage) {
              if (key.startsWith('background:')) {
                localStorageSize += localStorage[key].length + key.length;
              }
            }

            return {
              indexedDB: indexedDBStats,
              localStorage: { size: localStorageSize, count: Object.keys(localStorage).filter(k => k.startsWith('background:')).length }
            };
          },

          setConfigs: (configs: Record<string, BackgroundConfig>) => {
            set({ configs: { ...get().configs, ...configs } });
          }
        };
      },
      {
        name: 'kanvas-background-storage-enhanced',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          configs: state.configs,
        }),
        onRehydrateStorage: () => (state) => {
          if (state) {
            console.log('[BackgroundStoreEnhanced] Rehydrated background configs');
            // Note: Images will be loaded on-demand by components
          }
        },
      }
    )
  )
);

// Helper functions outside the store
async function handleImageStorage(assetId: string, config: BackgroundConfig, clonedConfig: BackgroundConfig) {
  try {
    const { user, plan, isAuthenticated } = useAuthStore.getState();
    const { syncEnabled } = useCloudStore.getState();

    // Check if user is pro and sync is enabled
    if (isAuthenticated && plan !== 'guest' && syncEnabled) {
      // For pro users: store in Supabase/Cloudflare (existing flow)
      await storeInCloud(assetId, config, clonedConfig);
    } else {
      // For guest users: store in IndexedDB
      await storeInIndexedDB(assetId, config, clonedConfig);
    }
  } catch (error) {
    console.error('Failed to handle image storage:', error);
    // Fallback to IndexedDB on any error
    await storeInIndexedDB(assetId, config, clonedConfig);
  }
}

async function storeInCloud(assetId: string, config: BackgroundConfig, clonedConfig: BackgroundConfig) {
  // Convert data URL to File for cloud upload
  if (config.imageUrl && config.imageUrl.startsWith('data:')) {
    const response = await fetch(config.imageUrl);
    const blob = await response.blob();
    const file = new File([blob], `background-${assetId}.jpg`, { type: blob.type });

    // Use existing cloud upload service
    // This would integrate with your existing assetUploadService
    console.log('Storing background in cloud for pro user:', assetId);
    
    // For now, store metadata and mark as cloud-backed
    const cloudConfig = { ...clonedConfig, cloudBacked: true } as EnhancedBackgroundConfig;
    persistMetadata(getAssetKey(assetId), cloudConfig);
  }
}

async function storeInIndexedDB(assetId: string, config: BackgroundConfig, clonedConfig: BackgroundConfig) {
  if (config.imageUrl && config.imageUrl.startsWith('data:')) {
    // Extract file from data URL
    const response = await fetch(config.imageUrl);
    const blob = await response.blob();
    const file = new File([blob], `background-${assetId}.jpg`, { type: blob.type });

    // Store in IndexedDB with compression
    const result = await indexedDBStorage.storeImage(assetId, file);
    
    if (result.success) {
      // Update config to reference IndexedDB stored image
      const indexedDBConfig = { 
        ...clonedConfig, 
        indexedDBStored: true,
        originalSize: file.size,
        compressedSize: result.compressedSize 
      } as EnhancedBackgroundConfig;
      
      // Store metadata in localStorage (without the large data URL)
      const metadataOnlyConfig = { 
        ...indexedDBConfig, 
        imageUrl: null, // Remove data URL from localStorage
        indexedDBRef: assetId 
      };
      
      persistMetadata(getAssetKey(assetId), metadataOnlyConfig);
      console.log('Background stored in IndexedDB:', assetId, 'Compressed:', result.compressedSize);
    } else {
      console.error('Failed to store in IndexedDB:', result.error);
      // Fallback to localStorage (might fail with quota error)
      persistMetadata(getAssetKey(assetId), clonedConfig);
    }
  } else {
    // No image to store, just persist metadata
    persistMetadata(getAssetKey(assetId), clonedConfig);
  }
}

function persistMetadata(key: string, config: BackgroundConfig) {
  // Use timeout to prevent render loops
  setTimeout(() => {
    try {
      // Store only metadata in localStorage
      const metadataToStore = { ...config };
      if (metadataToStore.imageUrl && metadataToStore.imageUrl.startsWith('data:')) {
        // Don't store large data URLs in localStorage
        metadataToStore.imageUrl = null;
      }
      
      localStorage.setItem(`background:${key}`, JSON.stringify(metadataToStore));
    } catch (error) {
      console.error(`Error saving background metadata for ${key}:`, error);
    }
  }, 0);
}

// Helper function for getting asset key with book context
export function getAssetKeyWithBookEnhanced(assetId: string, bookId?: string): string {
  if (assetId === "root" && bookId) {
    return `root:${bookId}`;
  }
  return `asset:${assetId}`;
}
