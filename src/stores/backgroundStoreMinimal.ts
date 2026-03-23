import { create } from 'zustand';
import type { BackgroundConfig, BackgroundStore } from '@/types/background';
import { DEFAULT_BACKGROUND_CONFIG, getAssetKey } from '@/types/background';

// Minimal store - just in memory, no persistence for testing
export const useBackgroundStoreMinimal = create<BackgroundStore>((set, get) => ({
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
    const clonedConfig = JSON.parse(JSON.stringify(config));
    
    set((state) => ({
      configs: {
        ...state.configs,
        [key]: clonedConfig,
      },
    }));
    
    console.log(`[BackgroundMinimal] Set background for ${assetId}:`, {
      hasImage: !!clonedConfig.imageUrl,
      mode: clonedConfig.mode,
      position: clonedConfig.position,
      scale: clonedConfig.scale
    });
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

export function getAssetKeyWithBookMinimal(assetId: string, bookId?: string): string {
  if (assetId === "root" && bookId) {
    return `root:${bookId}`;
  }
  return `asset:${assetId}`;
}
