/**
 * Complete localStorage cleanup utility to fix quota exceeded issues
 */

export class LocalStorageCleanup {
  /**
   * Analyze localStorage usage and identify problems
   */
  static analyzeStorage(): {
    totalSize: number;
    quotaEstimate: number;
    problematicKeys: string[];
    backgroundEntries: string[];
  } {
    let totalSize = 0;
    const problematicKeys: string[] = [];
    const backgroundEntries: string[] = [];

    // Analyze all localStorage entries
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) {
          const size = key.length + value.length;
          totalSize += size;

          // Identify problematic entries
          if (size > 1000000) { // > 1MB
            problematicKeys.push(key);
          }

          // Identify background entries
          if (key.startsWith('background:')) {
            backgroundEntries.push(key);
            
            try {
              const config = JSON.parse(value);
              if (config.imageUrl && config.imageUrl.length > 500000) { // > 500KB base64
                problematicKeys.push(`${key} (large image: ${(config.imageUrl.length / 1024).toFixed(1)}KB)`);
              }
            } catch (error) {
              problematicKeys.push(`${key} (corrupted)`);
            }
          }
        }
      }
    }

    return {
      totalSize,
      quotaEstimate: 5 * 1024 * 1024, // 5MB typical quota
      problematicKeys,
      backgroundEntries
    };
  }

  /**
   * Complete cleanup of localStorage
   */
  static completeCleanup(): void {
    console.log('🧹 [LocalStorageCleanup] Starting complete cleanup...');
    
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        keysToRemove.push(key);
      }
    }

    // Remove everything
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error(`Failed to remove ${key}:`, error);
      }
    });

    console.log(`✅ [LocalStorageCleanup] Removed ${keysToRemove.length} items`);
    console.log('🧹 [LocalStorageCleanup] Cleanup complete!');
  }

  /**
   * Selective cleanup - only problematic entries
   */
  static selectiveCleanup(): void {
    console.log('🧹 [LocalStorageCleanup] Starting selective cleanup...');
    
    const analysis = this.analyzeStorage();
    let removedCount = 0;

    analysis.problematicKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
        removedCount++;
        console.log(`✅ Removed: ${key}`);
      } catch (error) {
        console.error(`Failed to remove ${key}:`, error);
      }
    });

    console.log(`✅ [LocalStorageCleanup] Selective cleanup complete! Removed ${removedCount} items`);
  }

  /**
   * Backup important data before cleanup
   */
  static backupImportantData(): { success: boolean; data: any } {
    const importantData: any = {};

    try {
      // Backup user preferences, auth tokens, etc.
      const importantKeys = [
        'kanvas-user-preferences',
        'kanvas-auth-state',
        'kanvas-theme',
        'supabase.auth.token',
        'sb-access-token',
        'sb-refresh-token'
      ];

      importantKeys.forEach(key => {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            importantData[key] = JSON.parse(value);
          } catch {
            importantData[key] = value;
          }
        }
      });

      return { success: true, data: importantData };
    } catch (error) {
      console.error('Failed to backup important data:', error);
      return { success: false, data: null };
    }
  }

  /**
   * Restore important data after cleanup
   */
  static restoreImportantData(data: any): void {
    try {
      Object.keys(data).forEach(key => {
        const value = typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key];
        localStorage.setItem(key, value);
      });
      console.log('✅ Restored important data');
    } catch (error) {
      console.error('Failed to restore important data:', error);
    }
  }

  /**
   * Emergency reset - complete wipe and restart
   */
  static emergencyReset(): void {
    console.log('🚨 [LocalStorageCleanup] EMERGENCY RESET ACTIVATED');
    
    // Backup important data
    const backup = this.backupImportantData();
    
    // Complete cleanup
    this.completeCleanup();
    
    // Restore important data
    if (backup.success) {
      this.restoreImportantData(backup.data);
    }
    
    // Force page reload after a short delay
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }

  /**
   * Show current storage status in console
   */
  static showStorageStatus(): void {
    const analysis = this.analyzeStorage();
    
    console.group('📊 localStorage Status Report');
    console.log('Total Size:', `${(analysis.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('Quota Estimate:', `${(analysis.quotaEstimate / 1024 / 1024).toFixed(2)} MB`);
    console.log('Usage:', `${((analysis.totalSize / analysis.quotaEstimate) * 100).toFixed(1)}%`);
    
    if (analysis.problematicKeys.length > 0) {
      console.log('⚠️ Problematic Entries:', analysis.problematicKeys);
    }
    
    if (analysis.backgroundEntries.length > 0) {
      console.log('🖼️ Background Entries:', analysis.backgroundEntries);
      
      // Analyze background entries
      analysis.backgroundEntries.forEach(key => {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            const config = JSON.parse(value);
            if (config.imageUrl) {
              console.log(`  ${key}: Image size: ${(config.imageUrl.length / 1024).toFixed(1)}KB`);
            }
          }
        } catch (error) {
          console.log(`  ${key}: ERROR - corrupted data`);
        }
      });
    }
    
    console.groupEnd();
  }
}

// Make available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).localStorageCleanup = LocalStorageCleanup;
  console.log('🧹 LocalStorageCleanup available at window.localStorageCleanup');
  console.log('Commands: localStorageCleanup.showStorageStatus(), localStorageCleanup.selectiveCleanup(), localStorageCleanup.emergencyReset()');
}
