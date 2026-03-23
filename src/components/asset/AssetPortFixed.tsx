import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { AssetItem } from './AssetItem';
import { AssetCreationModalFixed } from './AssetCreationModalFixed';
import { BackgroundMapEditorFixed } from './BackgroundMapEditorFixed';
import { StorageCleanup } from '@/utils/storageCleanup';
import type { Asset } from './AssetItem';

interface AssetPortProps {
  assetId: string;
  viewportSize: { width: number; height: number };
  className?: string;
}

export function AssetPortFixed({ assetId, viewportSize, className }: AssetPortProps) {
  const { assets, getAssetChildren } = useAssetStore();
  const { getCurrentBook } = useBookStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [effectiveViewportSize, setEffectiveViewportSize] = useState(viewportSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Debounced viewport size update to prevent excessive re-renders
  const debouncedViewportUpdate = useCallback(
    debounce((size: { width: number; height: number }) => {
      setEffectiveViewportSize(size);
    }, 100),
    []
  );

  // Setup resize observer with debouncing
  useEffect(() => {
    if (!containerRef.current) return;

    resizeObserverRef.current = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        debouncedViewportUpdate({ width, height });
      }
    });

    resizeObserverRef.current.observe(containerRef.current);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [debouncedViewportUpdate]);

  // Check storage usage periodically
  useEffect(() => {
    const checkInterval = setInterval(() => {
      StorageCleanup.checkAndCleanup();
    }, 30000); // Check every 30 seconds

    // Initial check
    StorageCleanup.checkAndCleanup();

    return () => clearInterval(checkInterval);
  }, []);

  const currentAsset = assets[assetId];
  const currentBook = getCurrentBook();
  const childAssets = useMemo(() => getAssetChildren(assetId), [assetId, getAssetChildren]);

  // Memoize position calculation to prevent re-renders
  const createModalPosition = useMemo(() => {
    return {
      x: effectiveViewportSize.width / 2 - 150, // Center horizontally (modal is ~300px wide)
      y: effectiveViewportSize.height / 2 - 100, // Center vertically (modal is ~200px tall)
    };
  }, [effectiveViewportSize]);

  const handleOpenCreateModal = useCallback(() => {
    console.log('🎯 Opening create modal');
    console.log('AssetPort: Opening asset modal at screen center:', createModalPosition.x, createModalPosition.y);
    console.log('AssetPort: Using screen viewport size:', effectiveViewportSize);
    setShowCreateModal(true);
  }, [createModalPosition, effectiveViewportSize]);

  const handleOpenBackgroundModal = useCallback(() => {
    setShowBackgroundModal(true);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setShowCreateModal(false);
  }, []);

  const handleCloseBackgroundModal = useCallback(() => {
    setShowBackgroundModal(false);
  }, []);

  // Prevent setState during render by using callbacks
  const handleAssetAction = useCallback((action: string, asset: Asset) => {
    // Handle asset actions without causing render loops
    console.log('Asset action:', action, asset.id);
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`asset-port relative w-full h-full overflow-hidden ${className || ''}`}
      style={{ width: effectiveViewportSize.width, height: effectiveViewportSize.height }}
    >
      {/* Background */}
      {currentAsset?.backgroundConfig && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: currentAsset.backgroundConfig.color || 'transparent',
            backgroundImage: currentAsset.backgroundConfig.image 
              ? `url(${currentAsset.backgroundConfig.image})` 
              : 'none',
            backgroundPosition: `${currentAsset.backgroundConfig.position?.x || 0}px ${currentAsset.backgroundConfig.position?.y || 0}px`,
            backgroundSize: `${(currentAsset.backgroundConfig.scale || 1) * 100}%`,
            opacity: currentAsset.backgroundConfig.isClear === false ? 1 : 0.3,
          }}
        />
      )}

      {/* Child Assets */}
      {childAssets.map((childAsset) => (
        <AssetItem
          key={childAsset.id}
          asset={childAsset}
          viewportSize={effectiveViewportSize}
          onAction={handleAssetAction}
        />
      ))}

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex gap-2">
        <button
          onClick={handleOpenBackgroundModal}
          className="px-3 py-2 bg-glass/50 border border-glass-border/40 rounded-md hover:bg-glass/70 transition-colors text-sm"
        >
          Background
        </button>
        <button
          onClick={handleOpenCreateModal}
          className="px-3 py-2 bg-primary/50 border border-primary/40 rounded-md hover:bg-primary/70 transition-colors text-sm"
        >
          Add Asset
        </button>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <AssetCreationModalFixed
          isOpen={showCreateModal}
          onClose={handleCloseCreateModal}
          parentId={assetId}
          projectId={currentBook?.id}
          viewportSize={effectiveViewportSize}
          initialData={createModalPosition}
        />
      )}

      {showBackgroundModal && (
        <BackgroundMapEditorFixed
          isOpen={showBackgroundModal}
          onClose={handleCloseBackgroundModal}
          assetId={assetId}
          viewportSize={effectiveViewportSize}
        />
      )}
    </div>
  );
}

// Simple debounce utility
function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout;
  return ((...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}
