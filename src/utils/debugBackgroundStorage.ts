/**
 * Debug utility for background storage issues
 */

import { indexedDBStorage } from './indexedDBStorage';
import { getAssetKeyWithBookEnhanced } from '@/stores/backgroundStoreEnhanced';

export class DebugBackgroundStorage {
  /**
   * Check what's stored in IndexedDB
   */
  static async checkIndexedDB(): Promise<void> {
    console.log('🔍 [Debug] Checking IndexedDB storage...');
    
    try {
      const stats = await indexedDBStorage.getStorageStats();
      console.log('📊 [Debug] IndexedDB stats:', stats);
      
      // List all stored images
      console.log('📝 [Debug] Stored images:');
      // Note: We can't easily list all keys without modifying the storage class
      
      console.log('✅ [Debug] IndexedDB check complete');
    } catch (error) {
      console.error('❌ [Debug] IndexedDB check failed:', error);
    }
  }

  /**
   * Check localStorage for background configs
   */
  static async checkLocalStorage(): Promise<void> {
    console.log('🔍 [Debug] Checking localStorage...');
    
    const backgroundKeys: string[] = [];
    let totalSize = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('background:')) {
        backgroundKeys.push(key);
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += value.length + key.length;
          
          try {
            const config = JSON.parse(value);
            console.log(`📝 [Debug] ${key}:`, {
              hasImageUrl: !!config.imageUrl,
              imageUrlStart: config.imageUrl ? config.imageUrl.substring(0, 50) + '...' : 'none',
              indexedDBStored: config.indexedDBStored,
              indexedDBRef: config.indexedDBRef,
              cloudBacked: config.cloudBacked
            });
          } catch (error) {
            console.error(`❌ [Debug] Failed to parse ${key}:`, error);
          }
        }
      }
    }
    
    console.log(`📊 [Debug] Found ${backgroundKeys.length} background entries, total size: ${(totalSize / 1024).toFixed(2)}KB`);
  }

  /**
   * Test storing and retrieving an image
   */
  static async testIndexedDB(): Promise<void> {
    console.log('🧪 [Debug] Testing IndexedDB storage...');
    
    const testId = 'debug-test-image';
    const testData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    
    try {
      // Convert to File
      const response = await fetch(testData);
      const blob = await response.blob();
      const file = new File([blob], 'test.png', { type: 'image/png' });
      
      // Store
      console.log('💾 [Debug] Storing test image...');
      const result = await indexedDBStorage.storeImage(testId, file);
      console.log('✅ [Debug] Store result:', result);
      
      // Retrieve
      console.log('📖 [Debug] Retrieving test image...');
      const retrieved = await indexedDBStorage.getImage(testId);
      console.log('✅ [Debug] Retrieved image length:', retrieved?.length);
      
      // Clean up
      console.log('🗑️ [Debug] Cleaning up test image...');
      const removed = await indexedDBStorage.removeImage(testId);
      console.log('✅ [Debug] Remove result:', removed);
      
      console.log('✅ [Debug] IndexedDB test complete');
    } catch (error) {
      console.error('❌ [Debug] IndexedDB test failed:', error);
    }
  }

  /**
   * Check a specific asset's background
   */
  static async checkAssetBackground(assetId: string, bookId?: string): Promise<void> {
    console.log(`🔍 [Debug] Checking background for asset: ${assetId}`);
    
    const key = getAssetKeyWithBookEnhanced(assetId, bookId);
    console.log(`🔑 [Debug] Storage key: ${key}`);
    
    // Check localStorage
    const localStorageData = localStorage.getItem(`background:${key}`);
    if (localStorageData) {
      try {
        const config = JSON.parse(localStorageData);
        console.log('📝 [Debug] LocalStorage config:', {
          hasImageUrl: !!config.imageUrl,
          indexedDBStored: config.indexedDBStored,
          indexedDBRef: config.indexedDBRef,
          cloudBacked: config.cloudBacked
        });
      } catch (error) {
        console.error('❌ [Debug] Failed to parse localStorage config:', error);
      }
    } else {
      console.log('📝 [Debug] No localStorage entry found');
    }
    
    // Check IndexedDB
    try {
      const indexedDBImage = await indexedDBStorage.getImage(assetId);
      console.log('📝 [Debug] IndexedDB image found:', !!indexedDBImage);
      if (indexedDBImage) {
        console.log('📝 [Debug] IndexedDB image length:', indexedDBImage.length);
        console.log('📝 [Debug] IndexedDB image start:', indexedDBImage.substring(0, 50) + '...');
      }
    } catch (error) {
      console.error('❌ [Debug] Failed to check IndexedDB:', error);
    }
  }

  /**
   * Run all debug checks
   */
  static async runAllChecks(assetId?: string, bookId?: string): Promise<void> {
    console.log('🚀 [Debug] Starting background storage debug...');
    
    await this.checkLocalStorage();
    await this.checkIndexedDB();
    await this.testIndexedDB();
    
    if (assetId) {
      await this.checkAssetBackground(assetId, bookId);
    }
    
    console.log('✅ [Debug] Debug checks complete');
  }
}

// Make it available globally for easy debugging
if (typeof window !== 'undefined') {
  (window as any).debugBackgroundStorage = DebugBackgroundStorage;
  console.log('🔧 [Debug] DebugBackgroundStorage available at window.debugBackgroundStorage');
}
