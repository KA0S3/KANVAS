import { create } from 'zustand';
import type { BackgroundConfig, BackgroundStore } from '@/types/background';
import { DEFAULT_BACKGROUND_CONFIG, getAssetKey } from '@/types/background';

// Debug store with detailed logging
export const useBackgroundStoreDebug = create<BackgroundStore>((set, get) => ({
  configs: {},

  getBackground: (assetId: string) => {
    const state = get();
    const key = getAssetKey(assetId);
    
    console.log(`[BackgroundDebug] Getting background for ${assetId} -> key: ${key}`);
    console.log(`[BackgroundDebug] Available keys:`, Object.keys(state.configs));
    
    if (state.configs[key]) {
      console.log(`[BackgroundDebug] Found config for ${key}:`, {
        hasImage: !!state.configs[key].imageUrl,
        mode: state.configs[key].mode
      });
      return JSON.parse(JSON.stringify(state.configs[key]));
    }
    
    console.log(`[BackgroundDebug] No config found for ${key}, using default`);
    return JSON.parse(JSON.stringify(DEFAULT_BACKGROUND_CONFIG));
  },

  setBackground: (assetId: string, config: BackgroundConfig) => {
    const key = getAssetKey(assetId);
    
    console.log(`[BackgroundDebug] Setting background for ${assetId} -> key: ${key}`);
    console.log(`[BackgroundDebug] Config:`, {
      hasImage: !!config.imageUrl,
      imageSize: config.imageUrl ? `${(config.imageUrl.length / 1024).toFixed(1)}KB` : 'none',
      mode: config.mode,
      position: config.position,
      scale: config.scale
    });
    
    set((state) => ({
      configs: {
        ...state.configs,
        [key]: config,
      },
    }));
    
    console.log(`[BackgroundDebug] Set complete. All configs:`, state.configs);
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
}));

export function getAssetKeyWithBookDebug(assetId: string, bookId?: string): string {
  const key = assetId === "root" && bookId ? `root:${bookId}` : `asset:${assetId}`;
  console.log(`[BackgroundDebug] getAssetKeyWithBookDebug: ${assetId}, ${bookId} -> ${key}`);
  return key;
}
