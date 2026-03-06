/**
 * Effective limits calculation tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchEffectiveLimits, getEffectiveLimitsWithFallback } from '@/services/effectiveLimitsService';
import { 
  setupMocks, 
  mockAuthUser, 
  mockEffectiveLimitsResponse, 
  cleanupMocks,
  mockFetch
} from './utils/mockServices';
import { 
  TEST_USERS, 
  setupTestUser, 
  setupOwnerKeyOverride, 
  setupLicenseOverride 
} from './utils/testFixtures';

describe('Effective Limits Calculation', () => {
  beforeEach(() => {
    setupMocks();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupMocks();
  });

  describe('Basic Plan Calculations', () => {
    it('should calculate correct limits for guest user', async () => {
      mockAuthUser('guest');
      mockEffectiveLimitsResponse('guest');

      const result = await fetchEffectiveLimits();

      expect(result.data).toEqual({
        quotaBytes: 0,
        maxBooks: 1,
        adsEnabled: true,
        importExportEnabled: false,
        source: { plan: 'guest' },
      });
      expect(result.error).toBeUndefined();
    });

    it('should calculate correct limits for free user', async () => {
      mockAuthUser('free');
      mockEffectiveLimitsResponse('free');

      const result = await fetchEffectiveLimits();

      expect(result.data).toEqual({
        quotaBytes: 100 * 1024 * 1024, // 100MB
        maxBooks: 1,
        adsEnabled: true,
        importExportEnabled: false,
        source: { plan: 'free' },
      });
      expect(result.error).toBeUndefined();
    });

    it('should calculate correct limits for pro user', async () => {
      mockAuthUser('pro');
      mockEffectiveLimitsResponse('pro');

      const result = await fetchEffectiveLimits();

      expect(result.data).toEqual({
        quotaBytes: 10 * 1024 * 1024 * 1024, // 10GB
        maxBooks: 50,
        adsEnabled: false,
        importExportEnabled: true,
        source: { plan: 'pro' },
      });
      expect(result.error).toBeUndefined();
    });

    it('should calculate correct limits for lifetime user', async () => {
      mockAuthUser('lifetime');
      mockEffectiveLimitsResponse('lifetime');

      const result = await fetchEffectiveLimits();

      expect(result.data).toEqual({
        quotaBytes: 50 * 1024 * 1024 * 1024, // 50GB
        maxBooks: -1, // unlimited
        adsEnabled: false,
        importExportEnabled: true,
        source: { plan: 'lifetime' },
      });
      expect(result.error).toBeUndefined();
    });
  });

  describe('Owner Key Overrides', () => {
    it('should apply owner key overrides to free plan', async () => {
      const { user, effectiveLimits } = setupTestUser('free');
      const { ownerKey, effectiveLimits: overrideLimits } = setupOwnerKeyOverride('freeWithOverrides', user);

      mockAuthUser('free');
      
      // Mock the effective limits response to include owner key overrides
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(overrideLimits),
        status: 200,
        statusText: 'OK',
      });

      const result = await fetchEffectiveLimits();

      expect(result.data).toEqual(overrideLimits);
      expect(result.data?.quotaBytes).toBe(2 * 1024 * 1024 * 1024); // 2GB override
      expect(result.data?.maxBooks).toBe(25); // Override from owner key
      expect(result.data?.adsEnabled).toBe(false); // Override from owner key
      expect(result.data?.importExportEnabled).toBe(true); // Override from owner key
      expect(result.data?.source.ownerKeyId).toBe(ownerKey.token);
    });

    it('should apply owner key overrides to pro plan', async () => {
      const { user, effectiveLimits } = setupTestUser('pro');
      const { ownerKey, effectiveLimits: overrideLimits } = setupOwnerKeyOverride('proWithExtraStorage', user);

      mockAuthUser('pro');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(overrideLimits),
        status: 200,
        statusText: 'OK',
      });

      const result = await fetchEffectiveLimits();

      expect(result.data?.quotaBytes).toBe(20 * 1024 * 1024 * 1024); // 20GB override
      expect(result.data?.source.ownerKeyId).toBe(ownerKey.token);
    });

    it('should handle expired owner keys', async () => {
      mockAuthUser('free');
      
      // Mock response indicating expired owner key
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          quotaBytes: 100 * 1024 * 1024,
          maxBooks: 1,
          adsEnabled: true,
          importExportEnabled: false,
          source: { plan: 'free' }, // No owner key in source
        }),
        status: 200,
        statusText: 'OK',
      });

      const result = await fetchEffectiveLimits();

      expect(result.data?.source.ownerKeyId).toBeUndefined();
      expect(result.data?.source.plan).toBe('free');
    });
  });

  describe('License Feature Overrides', () => {
    it('should apply license feature overrides to free plan', async () => {
      const { user, effectiveLimits } = setupTestUser('free');
      const { license, effectiveLimits: licenseLimits } = setupLicenseOverride('freeWithStorageAddon', user);

      mockAuthUser('free');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(licenseLimits),
        status: 200,
        statusText: 'OK',
      });

      const result = await fetchEffectiveLimits();

      expect(result.data?.quotaBytes).toBe(100 * 1024 * 1024 + 5 * 1024 * 1024 * 1024); // 100MB + 5GB
      expect(result.data?.maxBooks).toBe(10); // Override from license
      expect(result.data?.adsEnabled).toBe(false); // Override from license
      expect(result.data?.source.licenseId).toBe(license.id);
    });

    it('should apply license feature overrides to pro plan', async () => {
      const { user, effectiveLimits } = setupTestUser('pro');
      const { license, effectiveLimits: licenseLimits } = setupLicenseOverride('proWithFeatures', user);

      mockAuthUser('pro');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(licenseLimits),
        status: 200,
        statusText: 'OK',
      });

      const result = await fetchEffectiveLimits();

      expect(result.data?.quotaBytes).toBe(10 * 1024 * 1024 * 1024 + 10 * 1024 * 1024 * 1024); // 10GB + 10GB
      expect(result.data?.source.licenseId).toBe(license.id);
    });
  });

  describe('Complex Combinations', () => {
    it('should handle owner key + license combinations', async () => {
      const { user } = setupTestUser('free');
      const { ownerKey } = setupOwnerKeyOverride('freeWithOverrides', user);
      const { license } = setupLicenseOverride('freeWithStorageAddon', user);

      mockAuthUser('free');
      
      // Mock combined overrides
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          quotaBytes: 7 * 1024 * 1024 * 1024, // Combined calculation
          maxBooks: 25, // Owner key takes precedence
          adsEnabled: false, // Owner key takes precedence
          importExportEnabled: true, // Owner key enables
          source: {
            plan: 'free',
            ownerKeyId: ownerKey.token,
            licenseId: license.id,
          },
        }),
        status: 200,
        statusText: 'OK',
      });

      const result = await fetchEffectiveLimits();

      expect(result.data?.source).toEqual({
        plan: 'free',
        ownerKeyId: ownerKey.token,
        licenseId: license.id,
      });
    });

    it('should handle lifetime plan with overrides', async () => {
      const { user } = setupTestUser('lifetime');
      const { ownerKey } = setupOwnerKeyOverride('proWithExtraStorage', user);

      mockAuthUser('lifetime');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          quotaBytes: 70 * 1024 * 1024 * 1024, // 50GB + 20GB override
          maxBooks: -1, // Still unlimited
          adsEnabled: false, // Lifetime default
          importExportEnabled: true, // Lifetime default
          source: {
            plan: 'lifetime',
            ownerKeyId: ownerKey.token,
          },
        }),
        status: 200,
        statusText: 'OK',
      });

      const result = await fetchEffectiveLimits();

      expect(result.data?.quotaBytes).toBe(70 * 1024 * 1024 * 1024);
      expect(result.data?.maxBooks).toBe(-1);
      expect(result.data?.source.plan).toBe('lifetime');
    });
  });

  describe('Expiration Handling', () => {
    it('should handle time-limited overrides', async () => {
      mockAuthUser('free');
      
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Yesterday
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          quotaBytes: 100 * 1024 * 1024, // Back to base plan
          maxBooks: 1,
          adsEnabled: true,
          importExportEnabled: false,
          source: { plan: 'free' },
          expiresAt: pastDate, // Expired
        }),
        status: 200,
        statusText: 'OK',
      });

      const result = await fetchEffectiveLimits();

      expect(result.data?.expiresAt).toBe(pastDate);
      expect(result.data?.quotaBytes).toBe(100 * 1024 * 1024); // Base free plan
    });

    it('should handle future expiration dates', async () => {
      mockAuthUser('free');
      
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days from now
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          quotaBytes: 2 * 1024 * 1024 * 1024, // Enhanced limits
          maxBooks: 25,
          adsEnabled: false,
          importExportEnabled: true,
          source: { 
            plan: 'free',
            ownerKeyId: 'test-key',
          },
          expiresAt: futureDate,
        }),
        status: 200,
        statusText: 'OK',
      });

      const result = await fetchEffectiveLimits();

      expect(result.data?.expiresAt).toBe(futureDate);
      expect(result.data?.quotaBytes).toBe(2 * 1024 * 1024 * 1024); // Enhanced limits
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should handle network errors gracefully', async () => {
      mockAuthUser('free');
      
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchEffectiveLimits();

      expect(result.data).toBeUndefined();
      expect(result.error).toBe('Network error occurred');
    });

    it('should handle HTTP errors', async () => {
      mockAuthUser('free');
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      const result = await fetchEffectiveLimits();

      expect(result.data).toBeUndefined();
      expect(result.error).toBe('Server error');
    });

    it('should handle malformed responses', async () => {
      mockAuthUser('free');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
        status: 200,
        statusText: 'OK',
      });

      const result = await fetchEffectiveLimits();

      expect(result.data).toBeUndefined();
      expect(result.error).toBe('Network error occurred');
    });

    it('should use fallback when server unavailable', async () => {
      mockAuthUser('free');
      
      mockFetch.mockRejectedValueOnce(new Error('Server unavailable'));

      const result = await getEffectiveLimitsWithFallback();

      expect(result.quotaBytes).toBe(100 * 1024 * 1024); // Free plan fallback
      expect(result.maxBooks).toBe(1);
      expect(result.adsEnabled).toBe(true);
      expect(result.importExportEnabled).toBe(false);
      expect(result.source.plan).toBe('free');
    });

    it('should use guest fallback for unauthenticated users', async () => {
      // Mock no session
      const { mockSupabase } = await import('./utils/mockServices');
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      mockFetch.mockRejectedValueOnce(new Error('Server unavailable'));

      const result = await getEffectiveLimitsWithFallback();

      expect(result.quotaBytes).toBe(0); // Guest fallback
      expect(result.maxBooks).toBe(1);
      expect(result.adsEnabled).toBe(true);
      expect(result.importExportEnabled).toBe(false);
      expect(result.source.plan).toBe('guest');
    });
  });

  describe('Performance and Caching', () => {
    it('should handle concurrent requests efficiently', async () => {
      mockAuthUser('free');
      mockEffectiveLimitsResponse('free');

      // Make multiple concurrent requests
      const promises = Array(10).fill(null).map(() => fetchEffectiveLimits());
      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.data).toBeDefined();
        expect(result.error).toBeUndefined();
      });

      // Should have made 10 fetch calls (no client-side caching in this service)
      expect(mockFetch).toHaveBeenCalledTimes(10);
    });

    it('should handle large quota values correctly', async () => {
      mockAuthUser('lifetime');
      
      const largeQuota = Number.MAX_SAFE_INTEGER;
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          quotaBytes: largeQuota,
          maxBooks: -1,
          adsEnabled: false,
          importExportEnabled: true,
          source: { plan: 'lifetime' },
        }),
        status: 200,
        statusText: 'OK',
      });

      const result = await fetchEffectiveLimits();

      expect(result.data?.quotaBytes).toBe(largeQuota);
      expect(typeof result.data?.quotaBytes).toBe('number');
    });
  });

  describe('Data Integrity', () => {
    it('should maintain data type consistency', async () => {
      mockAuthUser('pro');
      mockEffectiveLimitsResponse('pro');

      const result = await fetchEffectiveLimits();

      expect(typeof result.data?.quotaBytes).toBe('number');
      expect(typeof result.data?.maxBooks).toBe('number');
      expect(typeof result.data?.adsEnabled).toBe('boolean');
      expect(typeof result.data?.importExportEnabled).toBe('boolean');
      expect(typeof result.data?.source.plan).toBe('string');
    });

    it('should validate required fields', async () => {
      mockAuthUser('free');
      
      // Mock response missing required fields
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          quotaBytes: 100 * 1024 * 1024,
          // Missing other required fields
        }),
        status: 200,
        statusText: 'OK',
      });

      const result = await fetchEffectiveLimits();

      // Should still return the partial data (validation happens on server)
      expect(result.data?.quotaBytes).toBe(100 * 1024 * 1024);
    });
  });
});
