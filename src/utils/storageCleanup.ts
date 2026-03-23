/**
 * Storage cleanup utilities to prevent localStorage quota exceeded errors
 */

export class StorageCleanup {
  private static readonly STORAGE_QUOTA_WARNING = 0.8; // 80% of quota
  private static readonly BACKGROUND_PREFIX = 'background:';
  private static readonly ASSET_PREFIX = 'kanvas-';

  /**
   * Check current storage usage and clean up if needed
   */
  static checkAndCleanup(): void {
    const usage = this.getStorageUsage();
    console.log(`[StorageCleanup] Current storage usage: ${(usage.percentage * 100).toFixed(1)}%`);

    if (usage.percentage > this.STORAGE_QUOTA_WARNING) {
      console.warn('[StorageCleanup] Storage usage high, cleaning up...');
      this.cleanupOldBackgrounds();
      this.cleanupExpiredData();
    }
  }

  /**
   * Get current localStorage usage statistics
   */
  static getStorageUsage(): { used: number; total: number; percentage: number } {
    let used = 0;
    
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        used += localStorage[key].length + key.length;
      }
    }

    // Estimate total quota (typically 5-10MB, we'll use 5MB as baseline)
    const total = 5 * 1024 * 1024; // 5MB in bytes
    
    return {
      used,
      total,
      percentage: used / total
    };
  }

  /**
   * Clean up old background images to free space
   */
  static cleanupOldBackgrounds(): void {
    const backgroundsToRemove: string[] = [];
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.BACKGROUND_PREFIX)) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          
          // Remove backgrounds that are old and not recently used
          if (data.lastSaved && (now - new Date(data.lastSaved).getTime()) > maxAge) {
            backgroundsToRemove.push(key);
          }
        } catch (error) {
          // Remove corrupted data
          backgroundsToRemove.push(key);
        }
      }
    }

    backgroundsToRemove.forEach(key => {
      console.log(`[StorageCleanup] Removing old background: ${key}`);
      localStorage.removeItem(key);
    });
  }

  /**
   * Clean up expired or corrupted data
   */
  static cleanupExpiredData(): void {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            JSON.parse(value); // Test if it's valid JSON
          }
        } catch (error) {
          // Remove corrupted data
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(key => {
      console.log(`[StorageCleanup] Removing corrupted data: ${key}`);
      localStorage.removeItem(key);
    });
  }

  /**
   * Optimize background storage by compressing image data
   */
  static optimizeBackgroundStorage(): void {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.BACKGROUND_PREFIX)) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          
          // Check if imageUrl is a large base64 string
          if (data.imageUrl && data.imageUrl.length > 100000) { // > 100KB
            console.log(`[StorageCleanup] Optimizing large background image: ${key}`);
            
            // Compress by reducing quality (simple approach)
            if (data.imageUrl.startsWith('data:image/')) {
              // This is a basic optimization - in production you'd want better compression
              const optimized = this.compressBase64Image(data.imageUrl);
              if (optimized && optimized.length < data.imageUrl.length) {
                data.imageUrl = optimized;
                localStorage.setItem(key, JSON.stringify(data));
              }
            }
          }
        } catch (error) {
          console.error(`[StorageCleanup] Error optimizing ${key}:`, error);
        }
      }
    }
  }

  /**
   * Simple base64 image compression (very basic)
   */
  private static compressBase64Image(base64: string): string | null {
    try {
      // Remove metadata and reduce quality indicators
      const matches = base64.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) return base64;

      const [, format, data] = matches;
      
      // For JPEG, reduce quality by removing some data (very basic approach)
      if (format === 'jpeg') {
        // This is a placeholder - real compression would require canvas processing
        return base64;
      }

      return base64;
    } catch (error) {
      return null;
    }
  }

  /**
   * Clear all Kanvas data (for debugging/reset)
   */
  static clearAllKanvasData(): void {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(this.BACKGROUND_PREFIX) || key.startsWith(this.ASSET_PREFIX))) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => {
      console.log(`[StorageCleanup] Clearing data: ${key}`);
      localStorage.removeItem(key);
    });

    console.log(`[StorageCleanup] Cleared ${keysToRemove.length} Kanvas storage items`);
  }
}
