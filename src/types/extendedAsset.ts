/**
 * Extended Asset System Types
 * Adds custom fields, viewport display settings, and other advanced features
 */

import type { Asset } from '@/components/AssetItem';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds {
  position: Point;
  size: Size;
}

/**
 * Background configuration for an asset's viewport
 */
export interface BackgroundConfig {
  src: string | null;
  opacity: number;
  position: Point;
  scale: number;
  edgeFade: boolean;
  edgeFadeAmount: number;
}

/**
 * Viewport configuration per asset
 */
export interface ViewportConfig {
  canvasSize: Size;
  zoom: number;
  pan: Point;
}

/**
 * Tag definition
 */
export interface Tag {
  id: string;
  name: string;
  color: string;
}

/**
 * Custom field types
 */
export type CustomFieldType = 'text' | 'image';

/**
 * Custom field definition
 */
export interface CustomField {
  id: string;
  label: string;
  type: CustomFieldType;
  displayInViewport: boolean; // Whether to show this field in parent viewport
  isGlobal?: boolean; // Whether this field is a global template
}

/**
 * Global custom field template
 */
export interface GlobalCustomField {
  id: string;
  label: string;
  type: CustomFieldType;
  displayInViewport: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Custom field value for an asset
 */
export interface CustomFieldValue {
  fieldId: string;
  value: string; // For text: text content, for image: base64 data URL
}

/**
 * Viewport display settings for default fields
 */
export interface ViewportDisplaySettings {
  name: boolean;
  description: boolean;
  thumbnail: boolean;
  portraitBlur: number; // 0 = no blur, 1 = full blur
}

export interface ExtendedAsset extends Asset {
  description?: string;
  customFields: CustomField[];
  customFieldValues: CustomFieldValue[];
  thumbnail?: string; // Base64 encoded image
  background?: string; // Base64 encoded image
  tags?: string[];
  viewportDisplaySettings?: ViewportDisplaySettings;
}

export interface GeneratorData {
  type: 'character' | 'city' | 'item' | 'location';
  data: Record<string, any>;
}

export interface AssetEditFormData {
  name: string;
  description?: string;
  customFields: CustomField[];
  customFieldValues: CustomFieldValue[];
  thumbnail?: string;
  background?: string;
  tags?: string[];
  viewportDisplaySettings?: ViewportDisplaySettings;
}

/**
 * Root asset (the workspace itself)
 */
export const ROOT_ASSET_ID = 'root';

/**
 * Default viewport display settings
 */
export const DEFAULT_VIEWPORT_DISPLAY_SETTINGS: ViewportDisplaySettings = {
  name: true,
  description: false,
  thumbnail: true,
  portraitBlur: 0.2, // Slight blur by default for text legibility
};

/**
 * Default viewport config
 */
export const DEFAULT_VIEWPORT: ViewportConfig = {
  canvasSize: { width: 2000, height: 1500 },
  zoom: 1,
  pan: { x: 0, y: 0 },
};

/**
 * Default background config
 */
export const DEFAULT_BACKGROUND: BackgroundConfig = {
  src: null,
  opacity: 1,
  position: { x: 0, y: 0 },
  scale: 1,
  edgeFade: false,
  edgeFadeAmount: 0.2,
};

/**
 * Create a new asset with defaults
 */
export function createAsset(
  name: string,
  parentId: string | null,
  position: Point = { x: 100, y: 100 }
): ExtendedAsset {
  const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  return {
    id,
    name,
    type: 'other',
    description: '',
    thumbnail: undefined,
    background: undefined,
    x: position.x,
    y: position.y,
    width: 200,
    height: 150,
    parentId,
    children: [],
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    customFields: [],
    customFieldValues: [],
    viewportDisplaySettings: { ...DEFAULT_VIEWPORT_DISPLAY_SETTINGS },
    isExpanded: false,
    isLocked: false,
    borderShape: 'square',
  };
}

/**
 * Predefined tag colors
 */
export const TAG_COLORS = [
  'hsl(0, 70%, 50%)',    // Red
  'hsl(30, 70%, 50%)',   // Orange
  'hsl(60, 70%, 45%)',   // Yellow
  'hsl(120, 50%, 40%)',  // Green
  'hsl(200, 70%, 50%)',  // Blue
  'hsl(270, 60%, 55%)',  // Purple
  'hsl(330, 60%, 50%)',  // Pink
  'hsl(180, 50%, 45%)',  // Teal
];

/**
 * Create a new tag
 */
export function createTag(name: string, color?: string): Tag {
  return {
    id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    color: color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)],
  };
}
