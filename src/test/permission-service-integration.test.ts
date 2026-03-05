/**
 * Extended permission service integration tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { permissionService } from '@/services/permissionService';
import { 
  setupMocks, 
  mockAuthUser, 
  mockPermissionsResponse, 
  cleanupMocks,
  createRaceConditionTest
} from './utils/mockServices';
import { 
  TEST_USERS, 
  setupTestUser, 
  setupOwnerKeyOverride, 
  setupLicenseOverride 
} from './utils/testFixtures';

describe('PermissionService Integration', () => {
  beforeEach(() => {
    setupMocks();
    vi.clearAllMocks();
    // Clear cache
    (permissionService as any).permissions = null;
    (permissionService as any).lastFetch = 0;
  });

  afterEach(() => {
    cleanupMocks();
  });

  describe('Export/Import Permissions by Plan Type', () => {
    it('should grant export permissions to pro users', async () => {
      mockAuthUser('pro');
      mockPermissionsResponse('pro');

      const exportZipResult = await permissionService.canUserPerform('export_zip');
      const exportJsonResult = await permissionService.canUserPerform('export_json');

      expect(exportZipResult.allowed).toBe(true);
      expect(exportJsonResult.allowed).toBe(true);
      expect(exportZipResult.details.planType).toBe('pro');
      expect(exportJsonResult.details.planType).toBe('pro');
    });

    it('should deny export permissions to free users', async () => {
      mockAuthUser('free');
      mockPermissionsResponse('free');

      const exportZipResult = await permissionService.canUserPerform('export_zip');
      const exportJsonResult = await permissionService.canUserPerform('export_json');

      expect(exportZipResult.allowed).toBe(false);
      expect(exportJsonResult.allowed).toBe(false);
      expect(exportZipResult.details.planType).toBe('free');
      expect(exportJsonResult.details.planType).toBe('free');
    });

    it('should grant import permissions to lifetime users', async () => {
      mockAuthUser('lifetime');
      mockPermissionsResponse('lifetime');

      const importZipResult = await permissionService.canUserPerform('import_zip');
      const importJsonResult = await permissionService.canUserPerform('import_json');

      expect(importZipResult.allowed).toBe(true);
      expect(importJsonResult.allowed).toBe(true);
      expect(importZipResult.details.planType).toBe('lifetime');
      expect(importJsonResult.details.planType).toBe('lifetime');
    });

    it('should deny import permissions to guest users', async () => {
      mockAuthUser('guest');
      mockPermissionsResponse('guest');

      const importZipResult = await permissionService.canUserPerform('import_zip');
      const importJsonResult = await permissionService.canUserPerform('import_json');

      expect(importZipResult.allowed).toBe(false);
      expect(importJsonResult.allowed).toBe(false);
      expect(importZipResult.details.planType).toBe('guest');
      expect(importJsonResult.details.planType).toBe('guest');
    });

    it('should grant bulk export only to pro and lifetime users', async () => {
      // Test pro user
      mockAuthUser('pro');
      mockPermissionsResponse('pro');
      const proBulkExport = await permissionService.canUserPerform('bulk_export');
      expect(proBulkExport.allowed).toBe(true);

      // Reset cache
      permissionService.clearCache();

      // Test lifetime user
      mockAuthUser('lifetime');
      mockPermissionsResponse('lifetime');
      const lifetimeBulkExport = await permissionService.canUserPerform('bulk_export');
      expect(lifetimeBulkExport.allowed).toBe(true);

      // Reset cache
      permissionService.clearCache();

      // Test free user
      mockAuthUser('free');
      mockPermissionsResponse('free');
      const freeBulkExport = await permissionService.canUserPerform('bulk_export');
      expect(freeBulkExport.allowed).toBe(false);
    });
  });

  describe('Permission Caching and Invalidation', () => {
    it('should cache permissions and invalidate on clear', async () => {
      mockAuthUser('free');
      const { supabase } = await import('@/lib/supabase');
      
      mockPermissionsResponse('free');

      // First call should fetch from server
      await permissionService.getPermissions();
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);

      // Subsequent calls should use cache
      await permissionService.getPermissions();
      await permissionService.getPermissions();
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);

      // Clear cache should trigger new fetch
      permissionService.clearCache();
      await permissionService.getPermissions();
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
    });

    it('should handle cache expiration', async () => {
      mockAuthUser('pro');
      const { supabase } = await import('@/lib/supabase');
      
      mockPermissionsResponse('pro');

      // First call
      await permissionService.getPermissions();
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);

      // Mock time passage beyond cache duration (5 minutes)
      const originalDateNow = Date.now;
      const mockTime = Date.now() + 6 * 60 * 1000; // 6 minutes later
      Date.now = vi.fn(() => mockTime);

      // Next call should fetch from server due to cache expiration
      await permissionService.getPermissions();
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);

      // Restore original Date.now
      Date.now = originalDateNow;
    });

    it('should handle concurrent permission requests', async () => {
      mockAuthUser('lifetime');
      const { supabase } = await import('@/lib/supabase');
      
      mockPermissionsResponse('lifetime');

      // Make concurrent requests
      const promises = Array(10).fill(null).map(() => 
        permissionService.getPermissions()
      );

      const results = await Promise.all(promises);

      // Should only make one server call due to promise deduplication
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);

      // All results should be identical
      results.forEach(result => {
        expect(result.planType).toBe('lifetime');
        expect(result.canExportZip).toBe(true);
        expect(result.canImportZip).toBe(true);
        expect(result.canBulkExport).toBe(true);
      });
    });
  });

  describe('Permission Service with Owner Key Overrides', () => {
    it('should apply owner key overrides to permissions', async () => {
      const { user } = setupTestUser('free');
      const { ownerKey } = setupOwnerKeyOverride('freeWithOverrides', user);

      mockAuthUser('free');
      
      // Mock enhanced permissions from owner key
      const { supabase } = await import('@/lib/supabase');
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: {
          canExportZip: true, // Enabled by owner key
          canExportJson: true, // Enabled by owner key
          canImportZip: true, // Enabled by owner key
          canImportJson: true, // Enabled by owner key
          canCreateBook: true,
          canBulkExport: false, // Still requires pro/lifetime
          planType: 'free',
        },
        error: null,
      });

      const exportResult = await permissionService.canUserPerform('export_zip');
      const importResult = await permissionService.canUserPerform('import_zip');
      const bulkExportResult = await permissionService.canUserPerform('bulk_export');

      expect(exportResult.allowed).toBe(true);
      expect(importResult.allowed).toBe(true);
      expect(bulkExportResult.allowed).toBe(false); // Still denied
      expect(exportResult.details.planType).toBe('free');
    });

    it('should handle owner key expiration', async () => {
      const { user } = setupTestUser('pro');
      const { ownerKey } = setupOwnerKeyOverride('proWithExtraStorage', user);

      mockAuthUser('pro');
      
      // Mock permissions before owner key expiration
      const { supabase } = await import('@/lib/supabase');
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          canExportZip: true,
          canExportJson: true,
          canImportZip: true,
          canImportJson: true,
          canCreateBook: true,
          canBulkExport: true,
          planType: 'pro',
        },
        error: null,
      });

      const beforeExpiration = await permissionService.canUserPerform('export_zip');
      expect(beforeExpiration.allowed).toBe(true);

      // Clear cache and mock expired permissions
      permissionService.clearCache();
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          canExportZip: false, // Expired owner key
          canExportJson: false,
          canImportZip: false,
          canImportJson: false,
          canCreateBook: true,
          canBulkExport: false,
          planType: 'pro',
        },
        error: null,
      });

      const afterExpiration = await permissionService.canUserPerform('export_zip');
      expect(afterExpiration.allowed).toBe(false);
    });
  });

  describe('Permission Service with License Overrides', () => {
    it('should apply license feature overrides', async () => {
      const { user } = setupTestUser('free');
      const { license } = setupLicenseOverride('freeWithStorageAddon', user);

      mockAuthUser('free');
      
      // Mock permissions with license overrides
      const { supabase } = await import('@/lib/supabase');
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: {
          canExportZip: true, // Enabled by license
          canExportJson: true, // Enabled by license
          canImportZip: false, // Still requires pro/lifetime
          canImportJson: false,
          canCreateBook: true,
          canBulkExport: false,
          planType: 'free',
        },
        error: null,
      });

      const exportResult = await permissionService.canUserPerform('export_zip');
      const importResult = await permissionService.canUserPerform('import_zip');

      expect(exportResult.allowed).toBe(true);
      expect(importResult.allowed).toBe(false);
      expect(exportResult.details.planType).toBe('free');
    });

    it('should handle license expiration gracefully', async () => {
      const { user } = setupTestUser('pro');
      const { license } = setupLicenseOverride('proWithFeatures', user);

      mockAuthUser('pro');
      
      // Mock permissions with active license
      const { supabase } = await import('@/lib/supabase');
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          canExportZip: true,
          canExportJson: true,
          canImportZip: true,
          canImportJson: true,
          canCreateBook: true,
          canBulkExport: true,
          planType: 'pro',
        },
        error: null,
      });

      const withLicense = await permissionService.canUserPerform('bulk_export');
      expect(withLicense.allowed).toBe(true);

      // Clear cache and mock expired license
      permissionService.clearCache();
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          canExportZip: true,
          canExportJson: true,
          canImportZip: true,
          canImportJson: true,
          canCreateBook: true,
          canBulkExport: false, // License expired, back to pro defaults
          planType: 'pro',
        },
        error: null,
      });

      const expiredLicense = await permissionService.canUserPerform('bulk_export');
      expect(expiredLicense.allowed).toBe(false);
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should handle network errors gracefully', async () => {
      mockAuthUser('free');
      
      const { supabase } = await import('@/lib/supabase');
      vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error('Network error'));

      const permissions = await permissionService.getPermissions();
      
      // Should return default safe permissions
      expect(permissions).toEqual({
        canExportZip: false,
        canExportJson: false,
        canImportZip: false,
        canImportJson: false,
        canCreateBook: true,
        canBulkExport: false,
        planType: 'guest'
      });
    });

    it('should handle malformed server responses', async () => {
      mockAuthUser('pro');
      
      const { supabase } = await import('@/lib/supabase');
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: null, // Null response
        error: null,
      });

      const permissions = await permissionService.getPermissions();
      
      // Should return default safe permissions
      expect(permissions.planType).toBe('guest');
      expect(permissions.canCreateBook).toBe(true);
    });

    it('should handle server errors with specific error messages', async () => {
      mockAuthUser('lifetime');
      
      const { supabase } = await import('@/lib/supabase');
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: null,
        error: { message: 'Service temporarily unavailable' },
      });

      const permissions = await permissionService.getPermissions();
      
      expect(permissions.planType).toBe('guest');
    });

    it('should provide fallback for synchronous permission checks', async () => {
      // Test without cached permissions
      const syncResult = permissionService.canUserPerformSync('export_zip');
      expect(syncResult).toBe(false);

      // Test with cached permissions
      mockAuthUser('pro');
      mockPermissionsResponse('pro');
      
      await permissionService.getPermissions(); // Cache permissions
      
      const cachedSyncResult = permissionService.canUserPerformSync('export_zip');
      expect(cachedSyncResult).toBe(true);
    });
  });

  describe('Complex Permission Scenarios', () => {
    it('should handle owner key + license combinations', async () => {
      const { user } = setupTestUser('free');
      const { ownerKey } = setupOwnerKeyOverride('freeWithOverrides', user);
      const { license } = setupLicenseOverride('freeWithStorageAddon', user);

      mockAuthUser('free');
      
      // Mock combined permissions
      const { supabase } = await import('@/lib/supabase');
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: {
          canExportZip: true, // From owner key
          canExportJson: true, // From owner key
          canImportZip: true, // From owner key
          canImportJson: true, // From owner key
          canCreateBook: true,
          canBulkExport: false, // Still requires pro/lifetime base plan
          planType: 'free',
        },
        error: null,
      });

      const exportResult = await permissionService.canUserPerform('export_zip');
      const bulkExportResult = await permissionService.canUserPerform('bulk_export');

      expect(exportResult.allowed).toBe(true);
      expect(bulkExportResult.allowed).toBe(false);
    });

    it('should handle permission changes during active session', async () => {
      mockAuthUser('free');
      
      // Initial permissions (free plan)
      const { supabase } = await import('@/lib/supabase');
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          canExportZip: false,
          canExportJson: false,
          canImportZip: false,
          canImportJson: false,
          canCreateBook: true,
          canBulkExport: false,
          planType: 'free',
        },
        error: null,
      });

      const initialResult = await permissionService.canUserPerform('export_zip');
      expect(initialResult.allowed).toBe(false);

      // Simulate plan upgrade
      permissionService.clearCache();
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          canExportZip: true,
          canExportJson: true,
          canImportZip: true,
          canImportJson: true,
          canCreateBook: true,
          canBulkExport: true,
          planType: 'pro',
        },
        error: null,
      });

      const upgradedResult = await permissionService.canUserPerform('export_zip');
      expect(upgradedResult.allowed).toBe(true);
      expect(upgradedResult.details.planType).toBe('pro');
    });

    it('should handle concurrent permission checks during cache updates', async () => {
      mockAuthUser('lifetime');
      
      let callCount = 0;
      const { supabase } = await import('@/lib/supabase');
      vi.mocked(supabase.functions.invoke).mockImplementation(async () => {
        callCount++;
        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          data: {
            canExportZip: true,
            canExportJson: true,
            canImportZip: true,
            canImportJson: true,
            canCreateBook: true,
            canBulkExport: true,
            planType: 'lifetime',
          },
          error: null,
        };
      });

      // Create concurrent permission checks
      const operations = Array(20).fill(null).map((_, index) => 
        async () => {
          const action = ['export_zip', 'import_zip', 'bulk_export', 'create_book'][index % 4] as any;
          return await permissionService.canUserPerform(action);
        }
      );

      const results = await createRaceConditionTest(operations, 5);

      // Should only make one server call due to deduplication
      expect(callCount).toBe(1);

      // All should succeed
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          expect(result.value.allowed).toBe(true);
        }
      });
    });
  });

  describe('Performance and Optimization', () => {
    it('should maintain performance with high-frequency permission checks', async () => {
      mockAuthUser('pro');
      mockPermissionsResponse('pro');

      const permissionCheck = async () => {
        return await permissionService.canUserPerform('export_zip');
      };

      const startTime = performance.now();
      
      // Make 100 permission checks
      const promises = Array(100).fill(null).map(() => permissionCheck());
      await Promise.all(promises);
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / 100;

      // Should be very fast due to caching
      expect(averageTime).toBeLessThan(10); // < 10ms average
      expect(totalTime).toBeLessThan(1000); // < 1 second total
    });

    it('should handle memory efficiently with cache management', async () => {
      mockAuthUser('free');
      mockPermissionsResponse('free');

      // Get initial permissions
      await permissionService.getPermissions();
      
      // Check memory usage before and after cache operations
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // Perform many cache clear and fetch cycles
      for (let i = 0; i < 100; i++) {
        permissionService.clearCache();
        await permissionService.getPermissions();
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // Memory growth should be minimal
      if (initialMemory > 0 && finalMemory > 0) {
        const memoryGrowth = finalMemory - initialMemory;
        expect(memoryGrowth).toBeLessThan(1024 * 1024); // < 1MB growth
      }
    });
  });
});
