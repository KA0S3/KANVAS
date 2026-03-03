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
        import_export: true
      };

      const result = ownerKeyService.applyOwnerKeyOverrides('free', scopes);

      expect(result.effectivePlan).toBe('free');
      expect(result.adsEnabled).toBe(false);
      expect(result.maxStorageBytes).toBe(2147483648);
      expect(result.importExportEnabled).toBe(true);
    });

    it('should use default limits when no scopes provided', () => {
      const result = ownerKeyService.applyOwnerKeyOverrides('free', undefined);

      expect(result.effectivePlan).toBe('free');
      expect(result.adsEnabled).toBe(true);
      expect(result.maxStorageBytes).toBe(100 * 1024 * 1024); // 100MB
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
      
      expect(result.success).toBe(true);
      expect(store.ownerKeyInfo?.isValid).toBe(true);
      expect(store.effectiveLimits?.adsEnabled).toBe(false);
      expect(store.effectiveLimits?.maxStorageBytes).toBe(2147483648);
    });

    it('should clear owner key on sign out', () => {
      const store = useAuthStore.getState();
      
      // Set some owner key info
      store.setPlan('pro');
      store.updateEffectiveLimits();
      
      // Simulate sign out
      store.clearOwnerKey();
      
      expect(store.ownerKeyInfo).toBeNull();
    });
  });
});
