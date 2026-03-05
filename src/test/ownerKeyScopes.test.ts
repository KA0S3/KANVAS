import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ownerKeyService, type OwnerKeyScopes } from '@/services/ownerKeyService';
import { standardizeScopes } from '@/lib/jwt';

describe('Owner Key Scope Standardization', () => {
  it('should standardize camelCase to snake_case with warnings', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const camelCaseScopes = {
      maxStorageBytes: 2147483648,
      maxBooks: 10,
      importExport: true,
      ads: false
    };

    const standardized = standardizeScopes(camelCaseScopes);

    expect(consoleSpy).toHaveBeenCalledWith('[JWT] Deprecated scope key \'maxStorageBytes\' detected. Please use \'max_storage_bytes\' instead.');
    expect(consoleSpy).toHaveBeenCalledWith('[JWT] Deprecated scope key \'maxBooks\' detected. Please use \'max_books\' instead.');
    expect(consoleSpy).toHaveBeenCalledWith('[JWT] Deprecated scope key \'importExport\' detected. Please use \'import_export\' instead.');

    expect(standardized).toEqual({
      max_storage_bytes: 2147483648,
      max_books: 10,
      import_export: true,
      ads: false
    });

    consoleSpy.mockRestore();
  });

  it('should preserve snake_case keys without warnings', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const snakeCaseScopes = {
      max_storage_bytes: 2147483648,
      max_books: 10,
      import_export: true,
      ads: false
    };

    const standardized = standardizeScopes(snakeCaseScopes);

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(standardized).toEqual(snakeCaseScopes);

    consoleSpy.mockRestore();
  });

  it('should handle mixed format scopes', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const mixedScopes = {
      max_storage_bytes: 1073741824, // snake_case - should be preserved
      maxBooks: 5, // camelCase - should be converted with warning
      ads: true, // already snake_case
      customFeature: true // camelCase - not in deprecated mappings, preserved as-is
    };

    const standardized = standardizeScopes(mixedScopes);

    // Only maxBooks should trigger a warning (customFeature is not in deprecated mappings)
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[JWT] Deprecated scope key \'maxBooks\' detected. Please use \'max_books\' instead.'
    );

    expect(standardized).toEqual({
      max_storage_bytes: 1073741824,
      max_books: 5,
      ads: true,
      customFeature: true // Preserved as-is since not in deprecated mappings
    });

    consoleSpy.mockRestore();
  });
});

describe('Owner Key Service - Scope Application', () => {
  it('should apply owner key overrides correctly', () => {
    const basePlan = 'free';
    const scopes: OwnerKeyScopes = {
      ads: false,
      max_storage_bytes: 2147483648,
      max_books: 10,
      import_export: true
    };

    const result = ownerKeyService.applyOwnerKeyOverrides(basePlan, scopes);

    expect(result).toEqual({
      effectivePlan: 'free',
      maxStorageBytes: 2147483648,
      quotaBytes: 2147483648,
      maxBooks: 10,
      adsEnabled: false,
      importExportEnabled: true,
      features: scopes
    });
  });

  it('should use base plan defaults when scopes are undefined', () => {
    const basePlan = 'free';
    const scopes: OwnerKeyScopes = {
      ads: true,
      import_export: false
      // max_storage_bytes and max_books are undefined
    };

    const result = ownerKeyService.applyOwnerKeyOverrides(basePlan, scopes);

    expect(result.maxStorageBytes).toBe(100 * 1024 * 1024); // Free plan default
    expect(result.quotaBytes).toBe(100 * 1024 * 1024); // Free plan default
    expect(result.maxBooks).toBe(2); // Free plan default
    expect(result.adsEnabled).toBe(true); // From scope
    expect(result.importExportEnabled).toBe(false); // From scope
  });

  it('should handle pro plan with owner key overrides', () => {
    const basePlan = 'pro';
    const scopes: OwnerKeyScopes = {
      ads: true, // Override pro default (false)
      max_storage_bytes: 5 * 1024 * 1024 * 1024, // Override pro default (10GB)
      max_books: 100, // Override pro default (-1)
      import_export: false // Override pro default (true)
    };

    const result = ownerKeyService.applyOwnerKeyOverrides(basePlan, scopes);

    expect(result).toEqual({
      effectivePlan: 'pro',
      maxStorageBytes: 5 * 1024 * 1024 * 1024,
      quotaBytes: 5 * 1024 * 1024 * 1024,
      maxBooks: 100,
      adsEnabled: true,
      importExportEnabled: false,
      features: scopes
    });
  });

  it('should handle lifetime plan with owner key overrides', () => {
    const basePlan = 'lifetime';
    const scopes: OwnerKeyScopes = {
      ads: false, // Already lifetime default
      max_storage_bytes: 20 * 1024 * 1024 * 1024, // Override lifetime default (15GB)
      max_books: 50, // Override lifetime default (-1)
      import_export: true // Already lifetime default
    };

    const result = ownerKeyService.applyOwnerKeyOverrides(basePlan, scopes);

    expect(result).toEqual({
      effectivePlan: 'lifetime',
      maxStorageBytes: 20 * 1024 * 1024 * 1024,
      quotaBytes: 20 * 1024 * 1024 * 1024,
      maxBooks: 50,
      adsEnabled: false,
      importExportEnabled: true,
      features: scopes
    });
  });

  it('should handle unknown plan gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const basePlan = 'unknown' as any;
    const scopes: OwnerKeyScopes = {
      ads: false,
      max_storage_bytes: 1000000,
      max_books: 5,
      import_export: true
    };

    const result = ownerKeyService.applyOwnerKeyOverrides(basePlan, scopes);

    // Check for warning
    expect(consoleSpy).toHaveBeenCalledWith(
      '[PLANS_CONFIG] Unknown plan ID: "unknown". Available plans:',
      ['guest', 'free', 'pro', 'lifetime']
    );
    
    expect(result.effectivePlan).toBe('free'); // Fallback to free
    expect(result.maxStorageBytes).toBe(104857600); // Free plan default (100MB) since scopes don't override unknown plan
    expect(result.quotaBytes).toBe(104857600); // Free plan default
    expect(result.maxBooks).toBe(2); // Free plan default
    expect(result.adsEnabled).toBe(true); // Free plan default
    expect(result.importExportEnabled).toBe(true); // From scope (import_export: true)
    
    consoleSpy.mockRestore();
  });

  it('should return base plan when no scopes provided', () => {
    const basePlan = 'pro';

    const result = ownerKeyService.applyOwnerKeyOverrides(basePlan, undefined);

    expect(result).toEqual({
      effectivePlan: 'pro',
      maxStorageBytes: 10 * 1024 * 1024 * 1024, // Pro default
      quotaBytes: 10 * 1024 * 1024 * 1024, // Pro default
      maxBooks: Infinity, // Pro default (unlimited)
      adsEnabled: false, // Pro default
      importExportEnabled: true, // Pro default
      features: {}
    });
  });
});

describe('Owner Key - Integration Tests', () => {
  it('should handle complete owner key workflow', () => {
    // Test the complete flow from camelCase input to final limits
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    // 1. Start with camelCase scopes (legacy format)
    const legacyScopes = {
      maxStorageBytes: 2147483648,
      maxBooks: 10,
      importExport: true,
      ads: false
    };

    // 2. Standardize to snake_case (happens in JWT verification)
    const standardizedScopes = standardizeScopes(legacyScopes);

    // 3. Apply to base plan
    const result = ownerKeyService.applyOwnerKeyOverrides('free', standardizedScopes as OwnerKeyScopes);

    // Verify the complete transformation
    expect(consoleSpy).toHaveBeenCalledTimes(3); // Three deprecated keys
    expect(result.effectivePlan).toBe('free');
    expect(result.maxStorageBytes).toBe(2147483648);
    expect(result.quotaBytes).toBe(2147483648);
    expect(result.maxBooks).toBe(10);
    expect(result.adsEnabled).toBe(false);
    expect(result.importExportEnabled).toBe(true);

    consoleSpy.mockRestore();
  });

  it('should preserve custom scope keys', () => {
    const scopes: OwnerKeyScopes = {
      ads: false,
      max_storage_bytes: 1073741824,
      max_books: 5,
      import_export: true,
      custom_feature_alpha: true,
      betaAccess: true,
      experimentalMode: false
    };

    const result = ownerKeyService.applyOwnerKeyOverrides('free', scopes);

    expect(result.features).toEqual(scopes);
    expect(result.features.custom_feature_alpha).toBe(true);
    expect(result.features.betaAccess).toBe(true);
    expect(result.features.experimentalMode).toBe(false);
  });
});
