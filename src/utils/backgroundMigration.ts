/**
 * Migration utility to move background images from localStorage to IndexedDB
 * This helps users transition from the old system to the new enhanced storage
 */

import { indexedDBStorage } from './indexedDBStorage';

interface MigrationResult {
  success: boolean;
  migrated: number;
  failed: number;
  errors: string[];
  spaceSaved: number; // in bytes
}

class BackgroundMigration {
  private static readonly STORAGE_PREFIX = 'background:';

  /**
   * Migrate all background images from localStorage to IndexedDB
   */
  static async migrateAll(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      migrated: 0,
      failed: 0,
      errors: [],
      spaceSaved: 0
    };

    try {
      console.log('[BackgroundMigration] Starting migration...');
      
      // Find all background entries in localStorage
      const backgroundEntries: { key: string; data: any }[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_PREFIX)) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data.imageUrl && data.imageUrl.startsWith('data:')) {
              backgroundEntries.push({ key, data });
            }
          } catch (error) {
            console.warn(`[BackgroundMigration] Failed to parse ${key}:`, error);
          }
        }
      }

      console.log(`[BackgroundMigration] Found ${backgroundEntries.length} background images to migrate`);

      // Migrate each image
      for (const entry of backgroundEntries) {
        try {
          const assetId = this.extractAssetIdFromKey(entry.key);
          if (!assetId) {
            result.errors.push(`Invalid key format: ${entry.key}`);
            result.failed++;
            continue;
          }

          // Convert data URL to File
          const response = await fetch(entry.data.imageUrl);
          const blob = await response.blob();
          const file = new File([blob], `background-${assetId}.jpg`, { type: blob.type });

          // Store in IndexedDB
          const storeResult = await indexedDBStorage.storeImage(assetId, file);
          
          if (storeResult.success) {
            // Update localStorage entry to remove the large data URL
            const updatedData = { ...entry.data };
            const originalSize = entry.data.imageUrl.length;
            updatedData.imageUrl = null;
            updatedData.indexedDBRef = assetId;
            updatedData.indexedDBStored = true;
            updatedData.originalSize = originalSize;
            updatedData.compressedSize = storeResult.compressedSize || 0;
            
            localStorage.setItem(entry.key, JSON.stringify(updatedData));
            
            result.migrated++;
            if (storeResult.compressedSize) {
              result.spaceSaved += originalSize - storeResult.compressedSize;
            }
            
            console.log(`[BackgroundMigration] Migrated ${assetId} (${originalSize} -> ${storeResult.compressedSize} bytes)`);
          } else {
            result.errors.push(`Failed to store ${assetId}: ${storeResult.error}`);
            result.failed++;
          }
        } catch (error) {
          result.errors.push(`Error migrating ${entry.key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          result.failed++;
        }
      }

      console.log(`[BackgroundMigration] Migration complete: ${result.migrated} migrated, ${result.failed} failed, ${(result.spaceSaved / 1024 / 1024).toFixed(2)}MB saved`);

    } catch (error) {
      result.success = false;
      result.errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('[BackgroundMigration] Migration failed:', error);
    }

    return result;
  }

  /**
   * Check if migration is needed
   */
  static needsMigration(): boolean {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.STORAGE_PREFIX)) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          if (data.imageUrl && data.imageUrl.startsWith('data:') && !data.indexedDBStored) {
            return true;
          }
        } catch (error) {
          // If we can't parse, assume migration is needed
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get migration statistics
   */
  static getMigrationStats(): {
    totalEntries: number;
    entriesWithImages: number;
    estimatedSize: number;
    entriesNeedingMigration: number;
  } {
    let totalEntries = 0;
    let entriesWithImages = 0;
    let estimatedSize = 0;
    let entriesNeedingMigration = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.STORAGE_PREFIX)) {
        totalEntries++;
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          if (data.imageUrl && data.imageUrl.startsWith('data:')) {
            entriesWithImages++;
            estimatedSize += data.imageUrl.length;
            if (!data.indexedDBStored) {
              entriesNeedingMigration++;
            }
          }
        } catch (error) {
          // Count as needing migration if we can't parse
          entriesNeedingMigration++;
        }
      }
    }

    return {
      totalEntries,
      entriesWithImages,
      estimatedSize,
      entriesNeedingMigration
    };
  }

  /**
   * Clean up old localStorage entries after successful migration
   */
  static async cleanupOldEntries(): Promise<void> {
    console.log('[BackgroundMigration] Cleaning up old localStorage entries...');
    
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.STORAGE_PREFIX)) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          // Remove entries that have been migrated to IndexedDB
          if (data.indexedDBStored && data.imageUrl === null) {
            keysToRemove.push(key);
          }
        } catch (error) {
          // Remove corrupted entries
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });

    console.log(`[BackgroundMigration] Cleaned up ${keysToRemove.length} old entries`);
  }

  /**
   * Extract asset ID from storage key
   */
  private static extractAssetIdFromKey(key: string): string | null {
    // Remove the prefix and return the asset ID
    const assetId = key.substring(this.STORAGE_PREFIX.length);
    return assetId || null;
  }

  /**
   * Estimate time to complete migration
   */
  static estimateMigrationTime(): number {
    const stats = this.getMigrationStats();
    // Rough estimate: 500ms per image
    return stats.entriesNeedingMigration * 500;
  }
}

export { BackgroundMigration };
