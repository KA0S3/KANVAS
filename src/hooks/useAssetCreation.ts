import { useAssetStore } from '@/stores/assetStore';
import type { Asset } from '@/components/AssetItem';

export function useAssetCreation() {
  const { createAsset } = useAssetStore();

  const createNewAsset = (assetData: Omit<Asset, 'id' | 'children'>, parentId?: string, options?: { fromUserClick?: boolean }): string => {
    // SAFEGUARD: Only allow creation if explicitly triggered by user click
    if (!options?.fromUserClick) {
      throw new Error("Asset creation blocked: not triggered by user click");
    }
    
    console.log('Creating asset from modal');
    
    return createAsset(assetData, parentId);
  };

  return { createNewAsset };
}
