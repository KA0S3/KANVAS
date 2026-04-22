/**
 * Mapping functions between database schema and frontend formats
 * These functions convert between DB column names (snake_case) and frontend property names (camelCase)
 * 
 * CRITICAL: Never change the Asset interface structure - only map between formats
 */

import type { Asset } from '@/components/AssetItem';
import type { DbAsset, DbAssetInput, DbPositionInput } from '@/types/database';

/**
 * Convert database asset to frontend Asset
 * Maps snake_case DB columns to camelCase frontend properties
 */
export function dbAssetToAsset(dbAsset: DbAsset): Asset {
  return {
    id: dbAsset.asset_id,
    parentId: dbAsset.parent_id,
    name: dbAsset.name,
    type: dbAsset.type as Asset['type'],
    x: dbAsset.x,
    y: dbAsset.y,
    width: dbAsset.width,
    height: dbAsset.height,
    zIndex: dbAsset.z_index,
    isExpanded: dbAsset.is_expanded,
    content: dbAsset.content || undefined,
    backgroundConfig: dbAsset.background_config || {},
    viewportConfig: dbAsset.viewport_config || {},
    customFields: dbAsset.custom_fields || [],
    customFieldValues: [], // Will be populated from custom_fields if needed
    // Preserve existing fields with defaults
    children: [], // Will be reconstructed client-side from parent_id
    thumbnail: undefined,
    background: undefined,
    tags: dbAsset.custom_fields?.tags || [],
    viewportDisplaySettings: undefined,
    createdAt: new Date(dbAsset.created_at).getTime(),
    updatedAt: new Date(dbAsset.updated_at).getTime(),
    isLocked: false,
    borderShape: 'square',
    showTagBorder: false,
  };
}

/**
 * Convert frontend Asset to database input format
 * Maps camelCase frontend properties to snake_case DB columns
 * Used for save_assets RPC
 */
export function assetToDbAssetInput(asset: Asset): DbAssetInput {
  return {
    asset_id: asset.id,
    parent_id: asset.parentId,
    name: asset.name,
    type: asset.type,
    x: asset.x,
    y: asset.y,
    width: asset.width,
    height: asset.height,
    z_index: asset.zIndex,
    is_expanded: asset.isExpanded || false,
    content: asset.content || null,
    background_config: asset.backgroundConfig || {},
    viewport_config: asset.viewportConfig || {},
    custom_fields: {
      ...asset.customFields,
      tags: asset.tags,
    } || {},
  };
}

/**
 * Build changes array for save_assets RPC
 * Converts multiple assets to database input format
 */
export function buildChangesArray(assets: Asset[]): DbAssetInput[] {
  return assets.map(asset => assetToDbAssetInput(asset));
}

/**
 * Build positions array for save_positions RPC
 * Extracts only position fields for hot updates (cheap I/O)
 */
export function buildPositionsArray(
  positions: Record<string, { x: number; y: number; z_index: number }>
): DbPositionInput[] {
  return Object.entries(positions).map(([asset_id, pos]) => ({
    asset_id,
    x: pos.x,
    y: pos.y,
    z_index: pos.z_index,
  }));
}

/**
 * Convert database project to frontend format
 */
export function dbProjectToFrontend(dbProject: any): any {
  return {
    id: dbProject.id,
    userId: dbProject.user_id,
    name: dbProject.name,
    description: dbProject.description,
    viewport: dbProject.viewport,
    backgrounds: dbProject.backgrounds,
    tagsConfig: dbProject.tags_config,
    createdAt: new Date(dbProject.created_at).getTime(),
    updatedAt: new Date(dbProject.updated_at).getTime(),
    lastVersion: dbProject.last_version,
    assetCount: dbProject.asset_count,
  };
}
