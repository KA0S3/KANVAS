import { useEffect } from 'react';
import { useAssetStore } from '@/stores/assetStore';
import { useTagStore } from '@/stores/tagStore';
import type { Asset } from '@/components/AssetItem';

export function useSampleData() {
  const { createAsset, addGlobalCustomField, applyGlobalFieldsToAsset } = useAssetStore();
  const { createTag } = useTagStore();

  useEffect(() => {
    // Create sample tags
    const characterTag = createTag({ name: 'Character', color: '#3b82f6' });
    const locationTag = createTag({ name: 'Location', color: '#10b981' });
    const itemTag = createTag({ name: 'Item', color: '#f59e0b' });

    // Create global custom fields
    addGlobalCustomField({
      label: 'Backstory',
      type: 'text',
      displayInViewport: true,
    });

    addGlobalCustomField({
      label: 'Portrait',
      type: 'image',
      displayInViewport: true,
    });

    // Create sample assets with custom fields
    const heroId = createAsset({
      name: 'Aldric Stormblade',
      type: 'other',
      x: 100,
      y: 100,
      description: 'A brave warrior with a mysterious past',
      tags: [characterTag],
      customFields: [],
      customFieldValues: [],
      viewportDisplaySettings: {
        name: true,
        description: true,
        thumbnail: false,
      },
    });

    // Apply global fields to the hero
    applyGlobalFieldsToAsset(heroId);

    const castleId = createAsset({
      name: 'Stormwind Castle',
      type: 'other',
      x: 100,
      y: 100,
      description: 'Ancient fortress overlooking the sea',
      tags: [locationTag],
      customFields: [],
      customFieldValues: [],
      viewportDisplaySettings: {
        name: true,
        description: true,
        thumbnail: false,
      },
    });

    // Apply global fields to the castle
    applyGlobalFieldsToAsset(castleId);

    const swordId = createAsset({
      name: 'Stormblade',
      type: 'other',
      x: 200,
      y: 300,
      description: 'Legendary sword forged in dragon fire',
      tags: [itemTag],
      customFields: [],
      customFieldValues: [],
      viewportDisplaySettings: {
        name: true,
        description: false,
        thumbnail: false,
      },
    });

    // Apply global fields to the sword
    applyGlobalFieldsToAsset(swordId);

  }, [createAsset, createTag, addGlobalCustomField, applyGlobalFieldsToAsset]);
}
