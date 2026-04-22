/**
 * Change Tracking Layer - Phase 3 Frontend Integration
 * 
 * Tracks changes in memory and batches them for efficient saves.
 * Uses split RPCs for position vs metadata changes.
 * CRITICAL: Throttle position saves to 2s minimum.
 */

import { supabase } from '@/lib/supabase';
import type { Asset } from '@/components/AssetItem';

// Track changed assets in memory
let changedAssets: Record<string, Asset> = {};
let changedPositions: Record<string, { x: number; y: number; z_index: number }> = {};
let projectId: string | null = null;
let currentProjectVersion: number = 0;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let positionSaveTimer: ReturnType<typeof setTimeout> | null = null;

// CRITICAL FIX: Error callback for UI feedback
let onSaveError: ((error: Error) => void) | null = null;

const AUTO_SAVE_MS = 40000; // 40 seconds
const MAX_BATCH_SIZE = 500; // Soft cap - flush if exceeded
const POSITION_SAVE_THROTTLE = 2000; // 2 seconds minimum (CRITICAL - updated from 5s for better UX)

// Mark position changes (for hot updates) - TRUE THROTTLE (not debounce)
let isPositionSaveScheduled = false;

// =====================================================
// PUBLIC API
// =====================================================

/**
 * Set error callback for UI feedback on save failures
 */
export function setOnErrorCallback(callback: (error: Error) => void): void {
  onSaveError = callback;
}

/**
 * Mark an asset as changed (metadata)
 */
export function markAssetChanged(assetId: string, asset: Asset): void {
  changedAssets[assetId] = asset;
}

/**
 * Mark position changes (for hot updates) - TRUE THROTTLE (not debounce)
 * Debounce would never save during a long drag, losing data if browser crashes
 * Throttle ensures saves happen at regular intervals during long operations
 * 
 * Note: z_index is set to 0 since Asset interface doesn't have zIndex.
 * The frontend calculates z-index dynamically based on asset size.
 */
export function markPositionChanged(assetId: string, x: number, y: number, z_index: number = 0): void {
  changedPositions[assetId] = { x, y, z_index };

  if (!isPositionSaveScheduled) {
    isPositionSaveScheduled = true;
    // CRITICAL FIX: Assign the timer handle to positionSaveTimer so it can be cancelled
    positionSaveTimer = setTimeout(async () => {
      try {
        await savePositionChanges();
      } finally {
        isPositionSaveScheduled = false; // Allow the next batch to queue
        positionSaveTimer = null; // Reset after firing
      }
    }, POSITION_SAVE_THROTTLE);
  }
}

/**
 * Clear the change buffers
 */
export function clearChanges(): void {
  changedAssets = {};
  changedPositions = {};
}

/**
 * Build the changes array for save_assets RPC
 * 
 * CRITICAL: Maps frontend Asset interface to database schema
 * - customFields array is converted to custom_fields object
 * - tags array is stored in custom_fields.tags
 * - customFieldValues array is stored in custom_fields
 * - other fields are preserved
 */
function buildChangesArray(): any[] {
  return Object.values(changedAssets).map(asset => {
    // Build custom_fields object from frontend arrays
    const customFieldsObj: Record<string, any> = {
      customFields: asset.customFields || [],
      customFieldValues: asset.customFieldValues || [],
      tags: asset.tags || [],
      thumbnail: asset.thumbnail || null,
      background: asset.background || null,
      description: asset.description || null,
      viewportDisplaySettings: asset.viewportDisplaySettings || {}
    };

    return {
      asset_id: asset.id,
      parent_id: asset.parentId || null,
      name: asset.name,
      type: asset.type,
      x: asset.x,
      y: asset.y,
      width: asset.width,
      height: asset.height,
      z_index: 0, // z_index is managed by position saves, not metadata saves
      is_expanded: asset.isExpanded || false,
      content: asset.content || null, // CRITICAL FIX: Include content field for text assets
      background_config: asset.backgroundConfig || {},
      viewport_config: asset.viewportConfig || {},
      custom_fields: customFieldsObj
    };
  });
}

/**
 * Build positions array for save_positions RPC
 */
function buildPositionsArray(): any[] {
  return Object.entries(changedPositions).map(([asset_id, pos]) => ({
    asset_id,
    x: pos.x,
    y: pos.y,
    z_index: pos.z_index
  }));
}

/**
 * Save metadata changes to Supabase (full upsert)
 */
async function saveMetadataChanges(): Promise<void> {
  if (!projectId || Object.keys(changedAssets).length === 0) return;

  const changes = buildChangesArray();
  const keysSaved = Object.keys(changedAssets);

  // CRITICAL FIX: Clear only the keys we are actively saving, BEFORE the await
  // This prevents data loss if user makes changes during the network request
  keysSaved.forEach(key => delete changedAssets[key]);

  const { error } = await supabase.rpc('save_assets', {
    p_project_id: projectId,
    p_assets: changes,
    p_expected_version: currentProjectVersion
  });

  if (error) {
    console.error('Failed to save metadata changes:', error);
    throw error;
  }

  // Update local version
  currentProjectVersion += 1;
}

/**
 * Save position changes to Supabase (hot update - cheap)
 */
async function savePositionChanges(): Promise<void> {
  if (!projectId || Object.keys(changedPositions).length === 0) return;

  const positions = buildPositionsArray();
  const keysSaved = Object.keys(changedPositions);

  // CRITICAL FIX: Clear only the keys we are actively saving, BEFORE the await
  // This prevents data loss if user makes changes during the network request
  keysSaved.forEach(key => delete changedPositions[key]);

  const { error } = await supabase.rpc('save_positions', {
    p_project_id: projectId,
    p_positions: positions
  });

  if (error) {
    console.error('Failed to save position changes:', error);
    throw error;
  }
}

/**
 * Save all changes (both positions and metadata)
 */
async function saveChanges(): Promise<void> {
  if (!projectId) return;

  // Save positions first (cheap)
  if (Object.keys(changedPositions).length > 0) {
    await savePositionChanges();
  }

  // Save metadata (expensive - with version check)
  if (Object.keys(changedAssets).length > 0) {
    await saveMetadataChanges();
  }
}

/**
 * Start auto-save timer (40 seconds)
 */
export function startAutoSave(currentProjectId: string): void {
  projectId = currentProjectId;

  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
  }

  autoSaveTimer = setInterval(async () => {
    // Check if there are changes to save
    const totalChanges = Object.keys(changedAssets).length + Object.keys(changedPositions).length;
    if (totalChanges > 0) {
      // Log warning if batch cap exceeded
      if (totalChanges >= MAX_BATCH_SIZE) {
        console.warn(`Batch size exceeded (${totalChanges}), flushing early`);
      }
      try {
        await saveChanges();
      } catch (error) {
        console.error('Auto-save failed:', error);
        // CRITICAL FIX: Notify UI of persistent save failure
        if (onSaveError) {
          onSaveError(error as Error);
        }
      }
    }
  }, AUTO_SAVE_MS);
}

/**
 * Stop auto-save timer
 */
export function stopAutoSave(): void {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
  if (positionSaveTimer) {
    clearTimeout(positionSaveTimer);
    positionSaveTimer = null;
  }
  projectId = null;
  currentProjectVersion = 0;
}

/**
 * Manual save trigger (flush immediately)
 */
export async function manualSave(): Promise<void> {
  await saveChanges();
}

/**
 * Get current project version
 */
export function getCurrentProjectVersion(): number {
  return currentProjectVersion;
}

/**
 * Check if there are unsaved changes
 */
export function hasUnsavedChanges(): boolean {
  return Object.keys(changedAssets).length > 0 || Object.keys(changedPositions).length > 0;
}

/**
 * Get current project ID
 */
export function getCurrentProjectId(): string | null {
  return projectId;
}

/**
 * Set current project version (called after loading project)
 */
export function setCurrentProjectVersion(version: number): void {
  currentProjectVersion = version;
}

// =====================================================
// RETRY LOGIC (Failure & Recovery)
// =====================================================

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 second

/**
 * Save with retry logic and exponential backoff
 */
async function saveWithRetry(fn: () => Promise<void>): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await fn();
      return; // Success
    } catch (error: any) {
      lastError = error;

      // CRITICAL FIX: Handle 401 auth errors - refresh token and retry once
      if (error.status === 401 || error.message?.includes('JWT')) {
        console.warn('Auth token expired, refreshing...');
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.error('Failed to refresh auth token:', refreshError);
          throw error; // Re-throw original error if refresh fails
        }
        // Retry once after successful refresh
        if (attempt < MAX_RETRIES - 1) {
          continue;
        }
      }

      // Version conflict - special handling
      if (error.message?.includes('Version conflict')) {
        console.warn('Version conflict detected, reloading project...');
        // TODO: Implement reloadProject and mergeUnsavedChanges
        // For now, just retry after delay
        if (attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
          console.warn(`Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      // Network error - exponential backoff
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
        console.warn(`Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError; // All retries failed
}

/**
 * Override saveChanges to use retry logic
 */
export async function saveChangesWithRetry(): Promise<void> {
  await saveWithRetry(async () => {
    // Save positions first (cheap)
    if (Object.keys(changedPositions).length > 0) {
      await savePositionChanges();
    }

    // Save metadata (expensive - with version check)
    if (Object.keys(changedAssets).length > 0) {
      await saveMetadataChanges();
    }
  });
}

// =====================================================
// AUTH SESSION HANDLING
// =====================================================

/**
 * Set up auth state listener to save before session expires
 */
export function setupAuthListener(): void {
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'TOKEN_REFRESHED') {
      console.log('Auth token refreshed');
    } else if (event === 'SIGNED_OUT') {
      console.warn('User signed out, attempting to save unsaved changes before clearing');
      try {
        await manualSave();
      } catch (error) {
        console.error('Failed to save on sign-out:', error);
      }
      clearChanges();
    }
  });
}

// =====================================================
// BROWSER CLOSE WARNING
// =====================================================

let beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;

/**
 * Set up beforeunload handler for unsaved changes warning
 */
export function setupBeforeUnloadHandler(): void {
  const handler = (e: BeforeUnloadEvent) => {
    // CRITICAL FIX: Check both changedAssets AND changedPositions
    // Position-only changes should also trigger unsaved warning
    if (Object.keys(changedAssets).length > 0 || Object.keys(changedPositions).length > 0) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Stay on page to save, or leave to lose changes.';
    }
  };

  beforeUnloadHandler = handler;
  window.addEventListener('beforeunload', handler);
}

/**
 * Remove beforeunload handler
 */
export function removeBeforeUnloadHandler(): void {
  if (beforeUnloadHandler) {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    beforeUnloadHandler = null;
  }
}

// =====================================================
// DRAG / TYPING BEHAVIOR HELPERS
// =====================================================

let typingDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Handle drag move - use hot updates (position only - cheap)
 */
export function onDragMove(assetId: string, newX: number, newY: number, getLocalAsset: (id: string) => Asset | undefined): void {
  // Mark position changed (will use save_positions RPC)
  const asset = getLocalAsset(assetId);
  if (asset) {
    markPositionChanged(assetId, newX, newY, 0); // z_index will be managed separately
  }
}

/**
 * Handle drag end - immediate flush (CRITICAL for UX)
 */
export async function onDragEnd(): Promise<void> {
  // Flush position changes immediately on drag end
  try {
    await savePositionChanges();
  } catch (error) {
    console.error('Failed to save position on drag end:', error);
    if (onSaveError) {
      onSaveError(error as Error);
    }
  }
}

/**
 * Handle typing - debounce (500ms) then mark metadata changed
 */
export function onTyping(assetId: string, newValue: string, getLocalAsset: (id: string) => Asset | undefined): void {
  const asset = getLocalAsset(assetId);
  if (!asset) return;

  if (typingDebounceTimer) {
    clearTimeout(typingDebounceTimer);
  }

  typingDebounceTimer = setTimeout(() => {
    markAssetChanged(assetId, { ...asset, name: newValue });
  }, 500); // 500ms debounce
}
