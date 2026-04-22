/**
 * Change Tracking Hook - Phase 3/4 Integration
 * 
 * Integrates the change tracking service with the asset store
 * Provides automatic change tracking for asset mutations
 */

import { useEffect } from 'react';
import { useAssetStore } from '@/stores/assetStore';
import {
  markAssetChanged,
  markPositionChanged,
  startAutoSave,
  stopAutoSave,
  setCurrentProjectVersion,
  hasUnsavedChanges,
  manualSave
} from '@/services/changeTrackingService';

/**
 * Hook to integrate change tracking with asset store
 * Call this when loading a project to start tracking changes
 */
export function useChangeTracking(projectId: string | null) {
  const { bookAssets, currentActiveId } = useAssetStore();

  useEffect(() => {
    if (!projectId) {
      stopAutoSave();
      return;
    }

    // Start auto-save when project is loaded
    startAutoSave(projectId);

    return () => {
      stopAutoSave();
    };
  }, [projectId]);

  return {
    hasUnsavedChanges,
    manualSave,
    setCurrentProjectVersion
  };
}

/**
 * Hook to track asset position changes
 * Use this in drag handlers
 */
export function usePositionTracking() {
  const { bookAssets } = useAssetStore();

  const trackPositionChange = (assetId: string, x: number, y: number, zIndex: number = 0) => {
    markPositionChanged(assetId, x, y, zIndex);
  };

  const flushPositionChanges = async () => {
    const { onDragEnd } = await import('@/services/changeTrackingService');
    await onDragEnd();
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
      markAssetChanged(assetId, asset);
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

    const { onTyping } = require('@/services/changeTrackingService');
    onTyping(assetId, newValue, (id: string) => assets[id] || null);
  };

  return {
    trackTypingChange
  };
}
