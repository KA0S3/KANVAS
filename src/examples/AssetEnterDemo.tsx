import { useEffect } from 'react';
import { useAssetTree } from '@/hooks/useAssetTree';
import type { Asset } from '@/components/AssetItem';

/**
 * Demo component that sets up a hierarchical asset structure
 * to demonstrate the "Enter Asset" functionality
 */
export function AssetEnterDemo() {
  const { createAsset, assets } = useAssetTree();

  useEffect(() => {
    // Only create demo assets if there are no existing assets
    if (Object.keys(assets).length === 0) {
      setupDemoAssets();
    }
  }, [assets]);

  const setupDemoAssets = () => {
    // Create root level assets
    const folder1Id = createAsset({
      name: 'Project Folder',
      type: 'other',
      x: 100,
      y: 100,
      customFields: [],
      viewportConfig: {
        zoom: 1.2,
        panX: 50,
        panY: 30,
      },
      backgroundConfig: {
        color: '#1a1a2e',
        gridSize: 30,
      },
    });

    const folder2Id = createAsset({
      name: 'Resources',
      type: 'other',
      x: 400,
      y: 200,
      customFields: [],
      viewportConfig: {
        zoom: 0.8,
        panX: -20,
        panY: -10,
      },
      backgroundConfig: {
        color: '#16213e',
        gridSize: 50,
      },
    });

    // Create child assets for folder1
    createAsset({
      name: 'Design.sketch',
      type: 'image',
      x: 50,
      y: 80,
      customFields: [],
    }, folder1Id);

    createAsset({
      name: 'Prototype.fig',
      type: 'image',
      x: 250,
      y: 120,
      customFields: [],
    }, folder1Id);

    createAsset({
      name: 'Documentation.pdf',
      type: 'document',
      x: 150,
      y: 200,
      customFields: [],
    }, folder1Id);

    // Create child assets for folder2
    createAsset({
      name: 'Hero Image.png',
      type: 'image',
      x: 80,
      y: 100,
      customFields: [],
    }, folder2Id);

    createAsset({
      name: 'Background Music.mp3',
      type: 'audio',
      x: 300,
      y: 150,
      customFields: [],
    }, folder2Id);

    // Create a nested structure (subfolder)
    const subFolderId = createAsset({
      name: 'Subfolder',
      type: 'other',
      x: 200,
      y: 250,
      customFields: [],
      viewportConfig: {
        zoom: 1.5,
        panX: 0,
        panY: 0,
      },
      backgroundConfig: {
        color: '#0f3460',
        gridSize: 25,
      },
    }, folder1Id);

    // Add assets to subfolder
    createAsset({
      name: 'Deep Asset.txt',
      type: 'document',
      x: 100,
      y: 100,
      customFields: [],
    }, subFolderId);
  };

  return null; // This is a setup component, it doesn't render anything
}

/**
 * Instructions for testing the Enter Asset functionality:
 * 
 * 1. Double-click on any folder asset (e.g., "Project Folder" or "Resources")
 *    - The canvas should zoom/pan to show the folder's internal coordinate system
 *    - Only child assets should be visible
 *    - The header should show "Inside: [Folder Name]"
 *    - An exit button (←) should appear
 * 
 * 2. While inside a folder:
 *    - Child assets should be positioned relative to the folder's (0,0) point
 *    - The background should use the folder's custom configuration
 *    - Dragging child assets should update their global positions correctly
 *    - Double-clicking another folder asset will enter that folder
 * 
 * 3. Exit the folder by:
 *    - Clicking the exit button (←) in the header
 *    - Clicking on empty canvas space
 *    - The canvas should return to the root level view
 * 
 * 4. Coordinate System Verification:
 *    - Child assets maintain their relative positions when entering/exiting folders
 *    - The coordinate transformation preserves spatial relationships
 *    - Viewport settings (zoom/pan) are applied correctly per asset
 */
