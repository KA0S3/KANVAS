import type { Asset } from '@/components/AssetItem';

export interface ViewportConfig {
  zoom: number;
  panX: number;
  panY: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Convert global canvas coordinates to local asset coordinates
 * This ensures child assets are positioned relative to their parent's (0,0) point
 */
export function globalToLocalCoords(
  globalPoint: Point,
  parentAsset: Asset,
  viewportConfig: ViewportConfig = { zoom: 1, panX: 0, panY: 0 }
): Point {
  // Convert to local coordinates relative to parent's position
  const localPoint = {
    x: globalPoint.x - parentAsset.x,
    y: globalPoint.y - parentAsset.y,
  };

  return localPoint;
}

/**
 * Convert local asset coordinates to global canvas coordinates
 */
export function localToGlobalCoords(
  localPoint: Point,
  parentAsset: Asset,
  viewportConfig: ViewportConfig = { zoom: 1, panX: 0, panY: 0 }
): Point {
  // Convert to global coordinates relative to parent's position
  const globalPoint = {
    x: localPoint.x + parentAsset.x,
    y: localPoint.y + parentAsset.y,
  };

  return globalPoint;
}

/**
 * Convert screen coordinates to viewport-adjusted coordinates
 */
export function screenToViewportCoords(
  screenPoint: Point,
  viewportConfig: ViewportConfig
): Point {
  return {
    x: (screenPoint.x - viewportConfig.panX) / viewportConfig.zoom,
    y: (screenPoint.y - viewportConfig.panY) / viewportConfig.zoom,
  };
}

/**
 * Convert viewport coordinates to screen coordinates
 */
export function viewportToScreenCoords(
  viewportPoint: Point,
  viewportConfig: ViewportConfig
): Point {
  return {
    x: viewportPoint.x * viewportConfig.zoom + viewportConfig.panX,
    y: viewportPoint.y * viewportConfig.zoom + viewportConfig.panY,
  };
}

/**
 * Get the default viewport configuration for an asset
 */
export function getDefaultViewportConfig(): ViewportConfig {
  return {
    zoom: 1,
    panX: 0,
    panY: 0,
  };
}

/**
 * Get the default background configuration for an asset
 */
export function getDefaultBackgroundConfig() {
  return {
    color: undefined,
    image: undefined,
    gridSize: 40,
  };
}

/**
 * Calculate the transform needed to center an asset in the viewport
 */
export function calculateCenterTransform(
  asset: Asset,
  containerWidth: number,
  containerHeight: number
): ViewportConfig {
  const assetCenterX = asset.x + 100; // Assuming asset width of 200px
  const assetCenterY = asset.y + 25; // Assuming asset height of 50px

  return {
    zoom: 1,
    panX: containerWidth / 2 - assetCenterX,
    panY: containerHeight / 2 - assetCenterY,
  };
}

/**
 * Check if a point is within an asset's bounds
 */
export function isPointInAsset(
  point: Point,
  asset: Asset,
  assetWidth: number = 200,
  assetHeight: number = 50
): boolean {
  return (
    point.x >= asset.x &&
    point.x <= asset.x + assetWidth &&
    point.y >= asset.y &&
    point.y <= asset.y + assetHeight
  );
}
