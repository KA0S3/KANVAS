/**
 * Change Tracking Hook - Phase 3/4 Integration
 *
 * Integrates DocumentMutationService with the asset store
 * Provides automatic change tracking for asset mutations
 *
 * CRITICAL: Unified to use DocumentMutationService to avoid duplicate tracking systems
 */

import { useEffect } from 'react';
import { useAssetStore } from '@/stores/assetStore';
import { documentMutationService } from '@/services/DocumentMutationService';

/**
 * Hook to integrate change tracking with asset store
 * Call this when loading a project to start tracking changes
 */
export function useChangeTracking(projectId: string | null) {
  const { bookAssets, currentActiveId } = useAssetStore();

  useEffect(() => {
    if (!projectId) {
      // Project unloaded - DocumentMutationService handles cleanup
      return;
    }

    // Start auto-save when project is loaded
    documentMutationService.startAutoSave(projectId);

    return () => {
      // DocumentMutationService handles cleanup automatically
    };
  }, [projectId]);

  return {
    hasUnsavedChanges: () => documentMutationService.hasUnsavedChanges(),
    manualSave: () => documentMutationService.manualSave(),
    setCurrentProjectVersion: (version: number) => documentMutationService.setCurrentProjectVersion(version)
  };
}

/**
 * Hook to track asset position changes
 * Use this in drag handlers
 */
export function usePositionTracking() {
  const { bookAssets } = useAssetStore();

  const trackPositionChange = (assetId: string, x: number, y: number, zIndex: number = 0) => {
    documentMutationService.markPositionChanged(assetId, x, y, zIndex);
  };

  const flushPositionChanges = async () => {
    await documentMutationService.syncNow();
  };

  return {
    trackPositionChange,
    flushPositionChanges
  };
}

/**
 * Hook to track asset metadata changes
 * Use this when asset name, type, or other metadata changes
 */
export function useMetadataTracking() {
  const { getCurrentBookAssets } = useAssetStore();

  const trackMetadataChange = (assetId: string) => {
    const assets = getCurrentBookAssets();
    const asset = assets[assetId];
    if (asset) {
      documentMutationService.markAssetChanged(assetId, asset);
    }
  };

  return {
    trackMetadataChange
  };
}

/**
 * Hook to track typing changes (debounced)
 * Use this for text input fields
 */
export function useTypingTracking() {
  const { getCurrentBookAssets } = useAssetStore();

  const trackTypingChange = (assetId: string, newValue: string) => {
    const assets = getCurrentBookAssets();
    const asset = assets[assetId];
    if (!asset) return;

    // Update the asset content and mark as changed
    const updatedAsset = { ...asset, content: newValue };
    documentMutationService.markAssetChanged(assetId, updatedAsset);
  };

  return {
    trackTypingChange
  };
}
