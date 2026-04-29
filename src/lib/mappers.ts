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
  // CRITICAL FIX: Extract thumbnail from content field if present
  // Thumbnails are stored in content (unbounded TEXT) to avoid 2KB custom_fields limit
  let content = dbAsset.content || undefined;
  let thumbnail = dbAsset.custom_fields?.thumbnail || undefined;
  
  // Check if content contains embedded thumbnail
  if (content && typeof content === 'string' && content.includes('__THUMBNAIL__')) {
    const thumbnailMatch = content.match(/__THUMBNAIL__(.+?)__END_THUMBNAIL__/);
    if (thumbnailMatch) {
      thumbnail = thumbnailMatch[1];
      // Remove thumbnail from content
      content = content.replace(/__THUMBNAIL__.+?__END_THUMBNAIL__/, '').trim() || undefined;
    }
  }
  
  return {
    id: dbAsset.asset_id,
    parentId: dbAsset.parent_id,
    name: dbAsset.name,
    type: dbAsset.type as Asset['type'],
    x: dbAsset.x,
    y: dbAsset.y,
    width: dbAsset.width,
    height: dbAsset.height,
    isExpanded: dbAsset.is_expanded,
    content,
    backgroundConfig: dbAsset.background_config || {},
    viewportConfig: dbAsset.viewport_config || {},
    customFields: dbAsset.custom_fields || [],
    customFieldValues: [], // Will be populated from custom_fields if needed
    // Preserve existing fields with defaults
    children: [], // Will be reconstructed client-side from parent_id
    thumbnail,
    background: dbAsset.custom_fields?.background || undefined,
    tags: dbAsset.custom_fields?.tags || [],
    viewportDisplaySettings: dbAsset.custom_fields?.viewportDisplaySettings || undefined,
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
 * NOTE: zIndex is calculated dynamically, not stored in Asset interface
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
    z_index: 0, // zIndex is calculated dynamically, default to 0
    is_expanded: asset.isExpanded || false,
    content: asset.content || null,
    background_config: asset.backgroundConfig || {},
    viewport_config: asset.viewportConfig || {},
    custom_fields: {
      ...asset.customFields,
      tags: asset.tags,
    },
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
    coverImage: dbProject.cover_image,
    color: dbProject.color,
    gradient: dbProject.gradient,
    leatherColor: dbProject.leather_color,
    isLeatherMode: dbProject.is_leather_mode,
    coverPageSettings: dbProject.cover_page_settings,
    createdAt: new Date(dbProject.created_at).getTime(),
    updatedAt: new Date(dbProject.updated_at).getTime(),
    lastVersion: dbProject.last_version,
    assetCount: dbProject.asset_count,
  };
}
