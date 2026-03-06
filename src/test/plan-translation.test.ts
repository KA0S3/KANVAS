/**
 * Plan translation mapping tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { migrateLegacyPlanId, isValidPlanId, getPlanConfig } from '@/lib/plans';
import { validatePlanId, containsLegacyPlanReference, withPlanMigration } from '@/lib/legacyPlanDetection';

describe('Plan Translation Mapping', () => {
  describe('Legacy Plan Migration', () => {
    it('should migrate basic plan to free', () => {
      const result = migrateLegacyPlanId('basic');
      expect(result).toBe('free');
    });

    it('should migrate premium plan to pro', () => {
      const result = migrateLegacyPlanId('premium');
      expect(result).toBe('pro');
    });

    it('should migrate enterprise plan to lifetime', () => {
      const result = migrateLegacyPlanId('enterprise');
      expect(result).toBe('lifetime');
    });

    it('should handle case insensitive migration', () => {
      expect(migrateLegacyPlanId('BASIC')).toBe('free');
      expect(migrateLegacyPlanId('Premium')).toBe('pro');
      expect(migrateLegacyPlanId('ENTERPRISE')).toBe('lifetime');
    });

    it('should return canonical plans unchanged', () => {
      expect(migrateLegacyPlanId('guest')).toBe('guest');
      expect(migrateLegacyPlanId('free')).toBe('free');
      expect(migrateLegacyPlanId('pro')).toBe('pro');
      expect(migrateLegacyPlanId('lifetime')).toBe('lifetime');
    });

    it('should return unknown plans unchanged', () => {
      const unknown = 'unknown-plan';
      expect(migrateLegacyPlanId(unknown)).toBe(unknown);
    });

    it('should handle null and undefined inputs', () => {
      expect(migrateLegacyPlanId(null as any)).toBe(null);
      expect(migrateLegacyPlanId(undefined as any)).toBe(undefined);
    });
  });

  describe('Plan Validation', () => {
    it('should validate canonical plan IDs', () => {
      expect(isValidPlanId('guest')).toBe(true);
      expect(isValidPlanId('free')).toBe(true);
      expect(isValidPlanId('pro')).toBe(true);
      expect(isValidPlanId('lifetime')).toBe(true);
    });

    it('should reject legacy plan IDs', () => {
      expect(isValidPlanId('basic')).toBe(false);
      expect(isValidPlanId('premium')).toBe(false);
      expect(isValidPlanId('enterprise')).toBe(false);
    });

    it('should reject unknown plan IDs', () => {
      expect(isValidPlanId('unknown')).toBe(false);
      expect(isValidPlanId('')).toBe(false);
    });

    it('should reject null and undefined', () => {
      expect(isValidPlanId(null as any)).toBe(false);
      expect(isValidPlanId(undefined as any)).toBe(false);
    });
  });

  describe('Plan Configuration Consistency', () => {
    it('should have consistent configuration across plans', () => {
      const guestConfig = getPlanConfig('guest');
      const freeConfig = getPlanConfig('free');
      const proConfig = getPlanConfig('pro');
      const lifetimeConfig = getPlanConfig('lifetime');

      // Verify all plans have required fields
      [guestConfig, freeConfig, proConfig, lifetimeConfig].forEach(config => {
        expect(config).toHaveProperty('id');
        expect(config).toHaveProperty('label');
        expect(config).toHaveProperty('description');
        expect(config).toHaveProperty('quotaBytes');
        expect(config).toHaveProperty('maxBooks');
        expect(config).toHaveProperty('adsEnabled');
        expect(config).toHaveProperty('importExportEnabled');
        expect(config).toHaveProperty('maxAssetSize');
        expect(config).toHaveProperty('features');
      });

      // Verify plan hierarchy
      expect(guestConfig.quotaBytes).toBeLessThan(freeConfig.quotaBytes);
      expect(freeConfig.quotaBytes).toBeLessThan(proConfig.quotaBytes);
      expect(proConfig.quotaBytes).toBeLessThan(lifetimeConfig.quotaBytes);

      // Verify feature progression
      expect(guestConfig.adsEnabled).toBe(true);
      expect(freeConfig.adsEnabled).toBe(true);
      expect(proConfig.adsEnabled).toBe(false);
      expect(lifetimeConfig.adsEnabled).toBe(false);

      expect(guestConfig.importExportEnabled).toBe(false);
      expect(freeConfig.importExportEnabled).toBe(false);
      expect(proConfig.importExportEnabled).toBe(true);
      expect(lifetimeConfig.importExportEnabled).toBe(true);
    });

    it('should have valid quota progressions', () => {
      const guestConfig = getPlanConfig('guest');
      const freeConfig = getPlanConfig('free');
      const proConfig = getPlanConfig('pro');
      const lifetimeConfig = getPlanConfig('lifetime');

      // Guest should have 0 quota
      expect(guestConfig.quotaBytes).toBe(0);

      // Free should have reasonable quota (100MB)
      expect(freeConfig.quotaBytes).toBe(100 * 1024 * 1024);

      // Pro should have significantly more (10GB)
      expect(proConfig.quotaBytes).toBe(10 * 1024 * 1024 * 1024);

      // Lifetime should have the most (50GB)
      expect(lifetimeConfig.quotaBytes).toBe(50 * 1024 * 1024 * 1024);
    });

    it('should have valid maxBooks limits', () => {
      const guestConfig = getPlanConfig('guest');
      const freeConfig = getPlanConfig('free');
      const proConfig = getPlanConfig('pro');
      const lifetimeConfig = getPlanConfig('lifetime');

      expect(guestConfig.maxBooks).toBe(1);
      expect(freeConfig.maxBooks).toBe(1);
      expect(proConfig.maxBooks).toBe(50);
      expect(lifetimeConfig.maxBooks).toBe(-1); // unlimited
    });
  });

  describe('Legacy Detection Utilities', () => {
    it('should detect legacy plan references in strings', () => {
      expect(containsLegacyPlanReference('User has basic plan')).toBe(true);
      expect(containsLegacyPlanReference('Premium features available')).toBe(true);
      expect(containsLegacyPlanReference('Enterprise account')).toBe(true);
      expect(containsLegacyPlanReference('User has free plan')).toBe(false);
      expect(containsLegacyPlanReference('User has pro plan')).toBe(false);
    });

    it('should detect legacy field names in strings', () => {
      expect(containsLegacyPlanReference('storageQuotaMB field')).toBe(true);
      expect(containsLegacyPlanReference('maxProjects limit')).toBe(true);
      expect(containsLegacyPlanReference('quotaBytes field')).toBe(false);
      expect(containsLegacyPlanReference('maxBooks limit')).toBe(false);
    });
  });

  describe('Plan Validation with Migration', () => {
    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should warn and migrate legacy plan IDs', () => {
      const result = validatePlanId('basic', 'test-context');
      
      expect(result).toBe('free');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[PLAN_MIGRATION] Legacy plan "basic" detected in test-context')
      );
    });

    it('should error on unknown plan IDs', () => {
      const result = validatePlanId('unknown', 'test-context');
      
      expect(result).toBe('unknown');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[PLAN_MIGRATION] Unknown plan "unknown" in test-context')
      );
    });

    it('should return canonical plan IDs unchanged', () => {
      const result = validatePlanId('free', 'test-context');
      
      expect(result).toBe('free');
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe('Function Wrapping for Migration', () => {
    it('should automatically migrate plan IDs in wrapped functions', () => {
      const originalFn = vi.fn((planId: string) => `Processing ${planId}`);
      const wrappedFn = withPlanMigration(originalFn, 0);

      wrappedFn('basic');
      
      expect(originalFn).toHaveBeenCalledWith('free');
    });

    it('should handle non-string arguments gracefully', () => {
      const originalFn = vi.fn((arg: any) => `Processing ${arg}`);
      const wrappedFn = withPlanMigration(originalFn, 0);

      wrappedFn(123);
      wrappedFn(null);
      wrappedFn(undefined);
      
      expect(originalFn).toHaveBeenCalledWith(123);
      expect(originalFn).toHaveBeenCalledWith(null);
      expect(originalFn).toHaveBeenCalledWith(undefined);
    });

    it('should work with different argument positions', () => {
      const originalFn = vi.fn((a: string, b: string, planId: string) => `${a}-${b}-${planId}`);
      const wrappedFn = withPlanMigration(originalFn, 2);

      wrappedFn('user', 'action', 'premium');
      
      expect(originalFn).toHaveBeenCalledWith('user', 'action', 'pro');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty strings', () => {
      expect(migrateLegacyPlanId('')).toBe('');
      expect(isValidPlanId('')).toBe(false);
      expect(validatePlanId('', 'test')).toBe('');
    });

    it('should handle whitespace-only strings', () => {
      expect(migrateLegacyPlanId('   ')).toBe('   ');
      expect(isValidPlanId('   ')).toBe(false);
    });

    it('should handle special characters', () => {
      expect(migrateLegacyPlanId('basic-123')).toBe('basic-123');
      expect(isValidPlanId('basic-123')).toBe(false);
    });

    it('should maintain function context', () => {
      const obj = {
        name: 'test',
        process: withPlanMigration(function(planId: string) {
          return `${this.name}: ${planId}`;
        }, 0)
      };

      expect(obj.process('basic')).toBe('test: free');
    });
  });
});
