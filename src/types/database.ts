/**
 * Database Schema Types
 * These types match the Phase 1 database schema from MASTER_PLAN.md
 * They are used for RPC calls and database operations
 */

/**
 * Project record from database
 */
export interface DbProject {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  viewport: any;
  backgrounds: any;
  tags_config: any;
  created_at: string;
  updated_at: string;
  last_version: number;
  deleted_at: string | null;
}

/**
 * Asset record from database
 */
export interface DbAsset {
  project_id: string;
  asset_id: string;
  parent_id: string | null;
  name: string;
  type: 'card' | 'image' | 'text' | 'container' | 'viewport' | 'tag' | 'document' | 'video' | 'audio' | 'code';
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  is_expanded: boolean;
  content: string | null;
  background_config: any;
  viewport_config: any;
  custom_fields: any;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * File record from database
 */
export interface DbFile {
  id: string;
  project_id: string | null;
  asset_id: string | null;
  storage_key: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

/**
 * Input type for save_assets RPC
 */
export interface DbAssetInput {
  asset_id: string;
  parent_id?: string | null;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  is_expanded: boolean;
  content?: string | null;
  background_config?: any;
  viewport_config?: any;
  custom_fields?: any;
  deleted_at?: string | null;
}

/**
 * Input type for save_positions RPC
 */
export interface DbPositionInput {
  asset_id: string;
  x: number;
  y: number;
  z_index: number;
}

/**
 * Input type for save_project RPC
 */
export interface DbProjectInput {
  p_viewport?: any;
  p_backgrounds?: any;
  p_tags_config?: any;
  p_name?: string;
  p_description?: string | null;
  p_expected_version?: number | null;
}

/**
 * Tag configuration schema (stored in projects.tags_config)
 */
export interface TagConfig {
  [tagId: string]: TagDefinition;
}

export interface TagDefinition {
  name: string;
  color: string;
  icon?: string;
  description?: string;
}

/**
 * Custom fields schema (stored in assets.custom_fields)
 */
export interface CustomFields {
  tags?: string[];
  notes?: string;
  [key: string]: any;
}
