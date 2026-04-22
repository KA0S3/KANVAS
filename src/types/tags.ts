/**
 * Tags System Schema - Phase 3 Frontend Integration
 * 
 * CRITICAL: Explicit type contracts for tags system to prevent incompatible implementations
 */

// =====================================================
// PROJECT-LEVEL TAGS CONFIG
// =====================================================

/**
 * Tag configuration stored in: projects.tags_config (JSONB)
 * Type: Record<string, TagDefinition>
 */
export interface TagConfig {
  [tagId: string]: TagDefinition;
}

/**
 * Tag definition for a single tag
 */
export interface TagDefinition {
  name: string;        // Human-readable tag name
  color: string;       // Hex color code (e.g., '#ff0000')
  icon?: string;       // Optional icon identifier
  description?: string; // Optional tag description
}

// =====================================================
// ASSET-LEVEL TAG ASSIGNMENT
// =====================================================

/**
 * Tag assignment stored in: assets.custom_fields.tags (JSONB array)
 * Assets reference tags by their tag_id (key from tags_config)
 * Type: string[] (Array of tag IDs)
 */
export type AssetTagAssignment = string[];

// =====================================================
// TAGS SYSTEM TYPES
// =====================================================

/**
 * Custom fields interface including tags
 * Stored in: assets.custom_fields (JSONB)
 */
export interface CustomFields {
  tags?: AssetTagAssignment;  // Array of tag IDs from project.tags_config
  notes?: string;             // User notes
  customFields?: any[];       // Existing custom fields array
  customFieldValues?: any[];  // Existing custom field values
  thumbnail?: string;         // Asset thumbnail
  background?: string;        // Asset background
  description?: string;       // Asset description
  viewportDisplaySettings?: any; // Viewport display settings
  [key: string]: any;         // Other user-defined fields
}

// =====================================================
// TAG VALIDATION
// =====================================================

/**
 * Validate tag assignment
 * Tag IDs in asset.custom_fields.tags MUST exist in project.tags_config
 * 
 * @param tagIds - Array of tag IDs to validate
 * @param tagsConfig - Project's tags_config object
 * @returns true if all tag IDs are valid, false otherwise
 */
export function validateTagAssignment(tagIds: string[], tagsConfig: TagConfig): boolean {
  return tagIds.every(tagId => tagId in tagsConfig);
}

/**
 * Get tag details for display
 * 
 * @param tagId - Tag ID to look up
 * @param tagsConfig - Project's tags_config object
 * @returns Tag definition or null if not found
 */
export function getTagDetails(tagId: string, tagsConfig: TagConfig): TagDefinition | null {
  return tagsConfig[tagId] || null;
}

/**
 * Get all tag details for multiple tag IDs
 * 
 * @param tagIds - Array of tag IDs
 * @param tagsConfig - Project's tags_config object
 * @returns Array of tag definitions (only for valid IDs)
 */
export function getTagDetailsBatch(tagIds: string[], tagsConfig: TagConfig): TagDefinition[] {
  return tagIds
    .map(tagId => getTagDetails(tagId, tagsConfig))
    .filter((tag): tag is TagDefinition => tag !== null);
}

// =====================================================
// EXAMPLE USAGE
// =====================================================

/**
 * Example project tags_config:
 * 
 * project.tags_config = {
 *   'tag-urgent': {
 *     name: 'Urgent',
 *     color: '#ff0000',
 *     icon: 'alert',
 *     description: 'High priority items'
 *   },
 *   'tag-review': {
 *     name: 'Review',
 *     color: '#ffaa00',
 *     description: 'Needs review'
 *   }
 * };
 */

/**
 * Example asset tag assignment:
 * 
 * asset.custom_fields = {
 *   tags: ['tag-urgent', 'tag-review'],
 *   notes: 'This asset is urgent and needs review'
 * };
 */
