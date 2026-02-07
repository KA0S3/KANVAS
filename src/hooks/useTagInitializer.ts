import { useEffect, useRef } from 'react';
import { useTagStore } from '@/stores/tagStore';
import { useAssetStore } from '@/stores/assetStore';

// Sample tags for demonstration
const sampleTags = [
  { name: 'Character', color: '#3b82f6' },
  { name: 'Location', color: '#10b981' },
  { name: 'Item', color: '#f59e0b' },
  { name: 'Quest', color: '#8b5cf6' },
  { name: 'Lore', color: '#ef4444' },
];

export const useTagInitializer = () => {
  const { createTag, addTagToAsset, tags } = useTagStore();
  const { assets } = useAssetStore();
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Only initialize once and only if no tags exist
    if (!hasInitialized.current && Object.keys(tags).length === 0) {
      hasInitialized.current = true;
      
      // Create sample tags
      const tagIds: Record<string, string> = {};
      
      sampleTags.forEach(tagData => {
        const id = createTag(tagData);
        tagIds[tagData.name] = id;
      });

      // Add some sample tags to existing assets
      Object.values(assets).forEach((asset, index) => {
        // Add tags based on asset type or name patterns
        if (asset.name.toLowerCase().includes('hero') || asset.name.toLowerCase().includes('character')) {
          addTagToAsset(asset.id, tagIds['Character']);
        }
        if (asset.name.toLowerCase().includes('city') || asset.name.toLowerCase().includes('castle')) {
          addTagToAsset(asset.id, tagIds['Location']);
        }
        if (asset.name.toLowerCase().includes('banner') || asset.name.toLowerCase().includes('item')) {
          addTagToAsset(asset.id, tagIds['Item']);
        }
        if (asset.name.toLowerCase().includes('quest') || asset.name.toLowerCase().includes('battle')) {
          addTagToAsset(asset.id, tagIds['Quest']);
        }
        if (asset.name.toLowerCase().includes('lore') || asset.name.toLowerCase().includes('overview')) {
          addTagToAsset(asset.id, tagIds['Lore']);
        }

        // Add some random tags for demonstration
        if (index % 2 === 0 && Object.keys(tagIds).length > 0) {
          const randomTag = Object.values(tagIds)[index % Object.values(tagIds).length];
          addTagToAsset(asset.id, randomTag);
        }
      });
    }
  }, [createTag, addTagToAsset, tags]);
};
