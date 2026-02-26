import { useEffect } from 'react';
import { useAssetStore } from '@/stores/assetStore';
import { useTagStore } from '@/stores/tagStore';
import type { Asset } from '@/components/AssetItem';

export function useSampleData() {
  const { addGlobalCustomField, applyGlobalFieldsToAsset } = useAssetStore();
  const { createTag, addTagToAsset } = useTagStore();

  useEffect(() => {
    // No sample data - start with empty canvas
  }, []);
}
