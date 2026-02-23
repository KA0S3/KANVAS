import type { BackgroundConfig } from '@/types/background';
import { DEFAULT_BACKGROUND_CONFIG } from '@/types/background';

const STORAGE_PREFIX = 'background:';

/**
 * Centralized background storage utility
 * Handles all localStorage operations for background configurations
 */

export function getStorageKey(assetId: string): string {
  return `${STORAGE_PREFIX}${assetId}`;
}

export function getBackground(assetId: string): BackgroundConfig {
  try {
    const storageKey = getStorageKey(assetId);
    const stored = localStorage.getItem(storageKey);
    
    if (stored) {
      const config = JSON.parse(stored) as BackgroundConfig;
      // Deep clone to prevent reference sharing
      return JSON.parse(JSON.stringify(config));
    }
    
    // Return default config if nothing stored
    return JSON.parse(JSON.stringify(DEFAULT_BACKGROUND_CONFIG));
  } catch (error) {
    console.error(`Error loading background config for ${assetId}:`, error);
    return JSON.parse(JSON.stringify(DEFAULT_BACKGROUND_CONFIG));
  }
}

export function setBackground(assetId: string, config: BackgroundConfig): void {
  try {
    const storageKey = getStorageKey(assetId);
    // Deep clone before storing to prevent reference issues
    const configToStore = JSON.parse(JSON.stringify(config));
    localStorage.setItem(storageKey, JSON.stringify(configToStore));
  } catch (error) {
    console.error(`Error saving background config for ${assetId}:`, error);
  }
}

export function loadAllBackgrounds(): Record<string, BackgroundConfig> {
  const configs: Record<string, BackgroundConfig> = {};
  
  try {
    // Iterate through all localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const assetId = key.substring(STORAGE_PREFIX.length);
        const config = getBackground(assetId);
        configs[assetId] = config;
      }
    }
  } catch (error) {
    console.error('Error loading all background configs:', error);
  }
  
  return configs;
}

export function removeBackground(assetId: string): void {
  try {
    const storageKey = getStorageKey(assetId);
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.error(`Error removing background config for ${assetId}:`, error);
  }
}

export function clearAllBackgrounds(): void {
  try {
    const keysToRemove: string[] = [];
    
    // Find all background storage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    
    // Remove all background storage keys
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.error('Error clearing all background configs:', error);
  }
}
