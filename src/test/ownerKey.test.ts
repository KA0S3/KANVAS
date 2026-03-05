import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ownerKeyService } from '@/services/ownerKeyService';
import { useAuthStore } from '@/stores/authStore';

// Mock environment variables
const mockJWK = {
  kty: 'RSA',
  n: 'test-key',
  e: 'AQAB'
};

describe('Owner Key System', () => {
  beforeEach(() => {
    // Reset environment
    vi.stubEnv('VITE_OWNER_KEY_JWK', JSON.stringify(mockJWK));
    ownerKeyService.clearCache();
  });

  describe('Owner Key Service', () => {
    it('should apply owner key overrides correctly', () => {
      const scopes = {
        ads: false,
        max_storage_bytes: 2147483648, // 2GB
        max_books: 50,
        import_export: true
      };

      const result = ownerKeyService.applyOwnerKeyOverrides('free', scopes);

      expect(result.effectivePlan).toBe('free');
      expect(result.adsEnabled).toBe(false);
      expect(result.maxStorageBytes).toBe(2147483648);
      expect(result.quotaBytes).toBe(2147483648);
      expect(result.maxBooks).toBe(50);
      expect(result.importExportEnabled).toBe(true);
    });

    it('should use default limits when no scopes provided', () => {
      const result = ownerKeyService.applyOwnerKeyOverrides('free', undefined);

      expect(result.effectivePlan).toBe('free');
      expect(result.adsEnabled).toBe(true);
      expect(result.maxStorageBytes).toBe(100 * 1024 * 1024); // 100MB
      expect(result.quotaBytes).toBe(100 * 1024 * 1024); // 100MB
      expect(result.maxBooks).toBe(10); // Default max books for free plan
      expect(result.importExportEnabled).toBe(false);
    });

    it('should handle pro plan with overrides', () => {
      const scopes = {
        ads: true, // Override pro default
        max_storage_bytes: 10737418240, // 10GB (same as pro)
        import_export: true
      };

      const result = ownerKeyService.applyOwnerKeyOverrides('pro', scopes);

      expect(result.effectivePlan).toBe('pro');
      expect(result.adsEnabled).toBe(true); // Override applied
      expect(result.maxStorageBytes).toBe(10737418240);
      expect(result.importExportEnabled).toBe(true);
    });

    it('should apply license overrides with extra quota bytes', () => {
      const baseLimits = {
        effectivePlan: 'free' as const,
        maxStorageBytes: 100 * 1024 * 1024, // 100MB
        quotaBytes: 100 * 1024 * 1024, // 100MB
        maxBooks: 10,
        adsEnabled: true,
        importExportEnabled: false,
        features: {}
      };

      const licenseFeatures = {
        extra_quota_bytes: 50 * 1024 * 1024, // Extra 50MB
        max_books: 25,
        ads: false
      };

      const result = ownerKeyService.applyLicenseOverrides(baseLimits, licenseFeatures);

      expect(result.effectivePlan).toBe('free');
      expect(result.maxStorageBytes).toBe(150 * 1024 * 1024); // 100MB + 50MB
      expect(result.quotaBytes).toBe(150 * 1024 * 1024); // 100MB + 50MB
      expect(result.maxBooks).toBe(25); // Override from license
      expect(result.adsEnabled).toBe(false); // Override from license
      expect(result.importExportEnabled).toBe(false); // Unchanged
    });
  });

  describe('Auth Store Integration', () => {
    it('should initialize with null owner key info', () => {
      const store = useAuthStore.getState();
      
      expect(store.ownerKeyInfo).toBeNull();
      expect(store.effectiveLimits).toBeNull();
    });

    it('should update effective limits when owner key is validated', async () => {
      const store = useAuthStore.getState();
      
      // Mock successful validation
      vi.spyOn(ownerKeyService, 'validateOwnerKey').mockResolvedValue({
        isValid: true,
        scopes: {
          ads: false,
          max_storage_bytes: 2147483648,
          import_export: true
        },
        userId: 'test-user-id'
      });

      const result = await store.validateOwnerKey('mock-token');
      
      // Wait for state to update by getting fresh state
      const updatedStore = useAuthStore.getState();
      
      expect(result.success).toBe(true);
      expect(updatedStore.ownerKeyInfo?.isValid).toBe(true);
      expect(updatedStore.effectiveLimits?.adsEnabled).toBe(false);
      expect(updatedStore.effectiveLimits?.maxStorageBytes).toBe(2147483648);
      expect(updatedStore.effectiveLimits?.quotaBytes).toBe(2147483648);
      expect(updatedStore.effectiveLimits?.maxBooks).toBe(10); // Default free plan maxBooks
    });

    it('should clear owner key on sign out', async () => {
      const store = useAuthStore.getState();
      
      // Set some owner key info first
      vi.spyOn(ownerKeyService, 'validateOwnerKey').mockResolvedValue({
        isValid: true,
        scopes: {
          ads: false,
          max_storage_bytes: 2147483648,
          import_export: true
        },
        userId: 'test-user-id'
      });
      
      await store.validateOwnerKey('mock-token');
      
      // Verify owner key is set
      let updatedStore = useAuthStore.getState();
      expect(updatedStore.ownerKeyInfo?.isValid).toBe(true);
      
      // Simulate sign out
      await store.clearOwnerKey();
      
      // Get fresh state after clearing
      updatedStore = useAuthStore.getState();
      expect(updatedStore.ownerKeyInfo).toBeNull();
    });
  });
});
