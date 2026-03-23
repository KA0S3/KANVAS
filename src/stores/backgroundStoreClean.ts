import { create } from 'zustand';
import type { BackgroundConfig, BackgroundStore } from '@/types/background';
import { DEFAULT_BACKGROUND_CONFIG, getAssetKey } from '@/types/background';

// Clean store - no persistence, no quota issues
export const useBackgroundStoreClean = create<BackgroundStore>((set, get) => ({
  configs: {},

  getBackground: (assetId: string) => {
    const state = get();
    const key = getAssetKey(assetId);
    
    if (state.configs[key]) {
      return JSON.parse(JSON.stringify(state.configs[key]));
    }
    
    return JSON.parse(JSON.stringify(DEFAULT_BACKGROUND_CONFIG));
  },

  setBackground: (assetId: string, config: BackgroundConfig) => {
    const key = getAssetKey(assetId);
    
    // Only log if the config actually changed
    const currentState = get();
    const currentConfig = currentState.configs[key];
    const hasChanged = !currentConfig || 
      JSON.stringify(currentConfig) !== JSON.stringify(config);
    
    if (hasChanged) {
      console.log(`[BackgroundClean] Set background for ${assetId}:`, {
        hasImage: !!config.imageUrl,
        imageSize: config.imageUrl ? `${(config.imageUrl.length / 1024).toFixed(1)}KB` : 'none',
        mode: config.mode,
        position: config.position,
        scale: config.scale
      });
    }
    
    set((state) => ({
      configs: {
        ...state.configs,
        [key]: config,
      },
    }));
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

export function getAssetKeyWithBookClean(assetId: string, bookId?: string): string {
  if (assetId === "root" && bookId) {
    return `root:${bookId}`;
  }
  return `asset:${assetId}`;
}
