import type { BackgroundConfig } from '@/types/background';
import { DEFAULT_BACKGROUND_CONFIG } from '@/types/background';
import { indexedDBStorage } from './indexedDBStorage';

const STORAGE_PREFIX = 'background:';
const METADATA_PREFIX = 'bgmeta:';

// Debug: Log all localStorage keys at module load
const allKeys: string[] = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key) allKeys.push(key);
}
console.log('[BackgroundStorage] Module loaded. All localStorage keys:', allKeys);
console.log('[BackgroundStorage] Background-related keys:', allKeys.filter(k => k.startsWith(STORAGE_PREFIX) || k.startsWith(METADATA_PREFIX)));

/**
 * Centralized background storage utility
 * Uses IndexedDB for image blobs, localStorage for metadata
 */

export function getStorageKey(assetId: string): string {
  return `${METADATA_PREFIX}${assetId}`;
}

export async function getBackgroundAsync(assetId: string): Promise<BackgroundConfig> {
  try {
    const storageKey = getStorageKey(assetId);
    const stored = localStorage.getItem(storageKey);
    
    let config: BackgroundConfig;
    if (stored) {
      config = JSON.parse(stored) as BackgroundConfig;
    } else {
      // Check old storage format for migration
      const oldKey = `${STORAGE_PREFIX}${assetId}`;
      const oldStored = localStorage.getItem(oldKey);
      if (oldStored) {
        const oldData = JSON.parse(oldStored);
        // If old data has base64 image, we need to migrate
        if (oldData.imageUrl?.startsWith('data:')) {
          console.log(`[BackgroundStorage] Migrating old format for ${assetId}`);
          // Migrate to IndexedDB
          await migrateOldFormat(assetId, oldData);
          config = oldData;
        } else {
          config = oldData;
        }
      } else {
        config = JSON.parse(JSON.stringify(DEFAULT_BACKGROUND_CONFIG));
      }
    }
    
    // If IndexedDB has the image, restore it to the config
    const imageUrl = await indexedDBStorage.getImage(assetId);
    if (imageUrl) {
      config.imageUrl = imageUrl;
    }
    
    // Deep clone to prevent reference sharing
    return JSON.parse(JSON.stringify(config));
  } catch (error) {
    console.error(`Error loading background config for ${assetId}:`, error);
    return JSON.parse(JSON.stringify(DEFAULT_BACKGROUND_CONFIG));
  }
}

// Sync version for backward compatibility - returns default if not cached
export function getBackground(assetId: string): BackgroundConfig {
  try {
    const storageKey = getStorageKey(assetId);
    const stored = localStorage.getItem(storageKey);
    
    if (stored) {
      const config = JSON.parse(stored) as BackgroundConfig;
      // If IndexedDB has the image, it will be loaded asynchronously later
      // For now return metadata-only version
      return JSON.parse(JSON.stringify(config));
    }
    
    // Check old format
    const oldKey = `${STORAGE_PREFIX}${assetId}`;
    const oldStored = localStorage.getItem(oldKey);
    if (oldStored) {
      return JSON.parse(oldStored);
    }
    
    return JSON.parse(JSON.stringify(DEFAULT_BACKGROUND_CONFIG));
  } catch (error) {
    console.error(`Error loading background config for ${assetId}:`, error);
    return JSON.parse(JSON.stringify(DEFAULT_BACKGROUND_CONFIG));
  }
}

async function migrateOldFormat(assetId: string, oldData: any): Promise<void> {
  if (oldData.imageUrl?.startsWith('data:')) {
    try {
      // Convert base64 to blob and store in IndexedDB
      const response = await fetch(oldData.imageUrl);
      const blob = await response.blob();
      const file = new File([blob], `background-${assetId}.jpg`, { type: blob.type });
      await indexedDBStorage.storeImage(assetId, file);
      
      // Save metadata without the large imageUrl
      const metadata = { ...oldData };
      metadata.imageUrl = null;
      metadata.indexedDBStored = true;
      localStorage.setItem(getStorageKey(assetId), JSON.stringify(metadata));
      
      // Remove old format entry
      localStorage.removeItem(`${STORAGE_PREFIX}${assetId}`);
      
      console.log(`[BackgroundStorage] Migrated ${assetId} to IndexedDB`);
    } catch (error) {
      console.error(`[BackgroundStorage] Failed to migrate ${assetId}:`, error);
    }
  }
}

// Async version that stores images in IndexedDB
export async function setBackgroundAsync(assetId: string, config: BackgroundConfig): Promise<void> {
  try {
    const storageKey = getStorageKey(assetId);
    
    // Deep clone config
    const configToStore = JSON.parse(JSON.stringify(config));
    
    // If there's a base64 image, store it in IndexedDB instead
    if (configToStore.imageUrl?.startsWith('data:')) {
      try {
        const response = await fetch(configToStore.imageUrl);
        const blob = await response.blob();
        const file = new File([blob], `background-${assetId}.jpg`, { type: blob.type });
        const result = await indexedDBStorage.storeImage(assetId, file);
        
        if (result.success) {
          // Store metadata only, remove large base64 from localStorage
          configToStore.imageUrl = null;
          configToStore.indexedDBStored = true;
          configToStore.compressedSize = result.compressedSize;
        }
      } catch (error) {
        console.error(`[BackgroundStorage] Failed to store image in IndexedDB:`, error);
        // Fall back to storing in localStorage if IndexedDB fails
      }
    }
    
    localStorage.setItem(storageKey, JSON.stringify(configToStore));
  } catch (error) {
    console.error(`Error saving background config for ${assetId}:`, error);
  }
}

// Sync version for backward compatibility
export function setBackground(assetId: string, config: BackgroundConfig): void {
  try {
    const storageKey = getStorageKey(assetId);
    console.log(`[BackgroundStorage] Saving background for ${assetId} to key ${storageKey}`);
    const configToStore = JSON.parse(JSON.stringify(config));

    // CRITICAL FIX: Don't store large base64 images in localStorage/IndexedDB
    // Images should be uploaded to R2 and referenced by URL only
    // This follows low-IO principles and prevents localStorage bloat
    if (configToStore.imageUrl?.startsWith('data:')) {
      if (configToStore.imageUrl.length > 2048) {
        console.log(`[BackgroundStorage] Excluding large base64 image (${configToStore.imageUrl.length} bytes) - should be uploaded to R2`);
        configToStore.imageUrl = null;
      } else {
        // Only keep small base64 images (< 2KB)
        console.log(`[BackgroundStorage] Keeping small base64 image (${configToStore.imageUrl.length} bytes)`);
      }
    }

    localStorage.setItem(storageKey, JSON.stringify(configToStore));
    console.log(`[BackgroundStorage] Successfully saved background for ${assetId} to ${storageKey}`);
  } catch (error) {
    console.error(`[BackgroundStorage] Error saving background config for ${assetId}:`, error);
  }
}

// Async version that loads images from IndexedDB
export async function loadAllBackgroundsAsync(): Promise<Record<string, BackgroundConfig>> {
  const configs: Record<string, BackgroundConfig> = {};
  const processedIds = new Set<string>();
  
  try {
    // Check new metadata format first
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(METADATA_PREFIX)) {
        const assetId = key.substring(METADATA_PREFIX.length);
        if (!processedIds.has(assetId)) {
          processedIds.add(assetId);
          const config = await getBackgroundAsync(assetId);
          configs[assetId] = config;
        }
      }
    }
    
    // Check old format for any unmigrated backgrounds
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const assetId = key.substring(STORAGE_PREFIX.length);
        if (!processedIds.has(assetId)) {
          processedIds.add(assetId);
          const config = await getBackgroundAsync(assetId);
          configs[assetId] = config;
        }
      }
    }
  } catch (error) {
    console.error('Error loading all background configs:', error);
  }
  
  return configs;
}

// Sync version for backward compatibility
export function loadAllBackgrounds(): Record<string, BackgroundConfig> {
  const configs: Record<string, BackgroundConfig> = {};
  const foundKeys: string[] = [];

  try {
    // Check new metadata format
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(METADATA_PREFIX)) {
        const assetId = key.substring(METADATA_PREFIX.length);
        const stored = localStorage.getItem(key);
        if (stored) {
          configs[assetId] = JSON.parse(stored);
          foundKeys.push(assetId);
        }
      }
    }

    // Check old format
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const assetId = key.substring(STORAGE_PREFIX.length);
        if (!configs[assetId]) {
          const stored = localStorage.getItem(key);
          if (stored) {
            configs[assetId] = JSON.parse(stored);
            foundKeys.push(`${assetId} (old format)`);
          }
        }
      }
    }

    console.log(`[BackgroundStorage] loadAllBackgrounds found ${foundKeys.length} backgrounds:`, foundKeys);
  } catch (error) {
    console.error('Error loading all background configs:', error);
  }

  return configs;
}

export function removeBackground(assetId: string): void {
  try {
    // Remove from both new and old storage locations
    localStorage.removeItem(getStorageKey(assetId));
    localStorage.removeItem(`${STORAGE_PREFIX}${assetId}`);
    // Also remove from IndexedDB
    indexedDBStorage.removeImage(assetId);
  } catch (error) {
    console.error(`Error removing background config for ${assetId}:`, error);
  }
}

export function clearAllBackgrounds(): void {
  try {
    const keysToRemove: string[] = [];
    
    // Find all background storage keys (both old and new format)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(STORAGE_PREFIX) || key.startsWith(METADATA_PREFIX))) {
        keysToRemove.push(key);
      }
    }
    
    // Remove all background storage keys
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Clear IndexedDB backgrounds
    indexedDBStorage.clearAll();
  } catch (error) {
    console.error('Error clearing all background configs:', error);
  }
}
