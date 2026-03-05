/**
 * Legacy Plan Detection and Migration Warnings
 * 
 * This module provides utilities to detect legacy plan references
 * and warn developers during development builds.
 */

import { getPlanConfig, migrateLegacyPlanId, isValidPlanId } from '@/lib/plans';

// Legacy plan patterns that should trigger warnings
const LEGACY_PLAN_PATTERNS = [
  'basic', 'premium', 'enterprise',
  'BASIC', 'PREMIUM', 'ENTERPRISE',
  'Basic', 'Premium', 'Enterprise'
];

// Legacy database field names
const LEGACY_FIELD_NAMES = [
  'plan', // should be 'plan_type'
  'storageQuotaMB', // should be 'quotaBytes'
  'maxProjects', // should be derived from plan config
  'maxAssetsPerProject' // should be derived from plan config
];

/**
 * Check if a string contains legacy plan references
 */
export function containsLegacyPlanReference(input: string): boolean {
  return LEGACY_PLAN_PATTERNS.some(pattern => input.includes(pattern));
}

/**
 * Check if code uses legacy field names
 */
export function containsLegacyFieldNames(input: string): boolean {
  return LEGACY_FIELD_NAMES.some(field => input.includes(field));
}

/**
 * Validate plan ID and warn if legacy
 */
export function validatePlanId(planId: string, context = 'unknown'): string {
  if (!isValidPlanId(planId)) {
    const migrated = migrateLegacyPlanId(planId);
    if (migrated !== planId) {
      console.warn(
        `[PLAN_MIGRATION] Legacy plan "${planId}" detected in ${context}. ` +
        `Migrated to "${migrated}". Please update your code to use canonical plan IDs.`
      );
      return migrated;
    } else {
      console.error(
        `[PLAN_MIGRATION] Unknown plan "${planId}" in ${context}. ` +
        `Valid plans: guest, free, pro, lifetime`
      );
    }
  }
  return planId;
}

/**
 * Development-time migration checker
 * Call this during app initialization to detect legacy patterns
 */
export async function checkForLegacyPatterns(): Promise<void> {
  if (!import.meta.env.DEV) return;

  console.log('[PLAN_MIGRATION] Checking for legacy plan patterns...');
  
  // Check current auth store plan
  try {
    const { useAuthStore } = await import('@/stores/authStore');
    const authStore = useAuthStore.getState();
    if (authStore.plan && !isValidPlanId(authStore.plan)) {
      validatePlanId(authStore.plan, 'authStore.plan');
    }
  } catch (error) {
    // Module might not be loaded yet
  }

  // Check localStorage for legacy plan data
  try {
    const authData = localStorage.getItem('kanvas-auth');
    if (authData) {
      const parsed = JSON.parse(authData);
      if (parsed.state?.plan && !isValidPlanId(parsed.state.plan)) {
        validatePlanId(parsed.state.plan, 'localStorage');
      }
    }
  } catch (error) {
    // localStorage might not be available
  }

  console.log('[PLAN_MIGRATION] Legacy pattern check complete');
}

/**
 * Wrap a function to automatically migrate plan IDs
 */
export function withPlanMigration<T extends (...args: any[]) => any>(
  fn: T,
  planArgIndex = 0
): T {
  return ((...args: any[]) => {
    if (args[planArgIndex] && typeof args[planArgIndex] === 'string') {
      args[planArgIndex] = validatePlanId(args[planArgIndex], fn.name || 'anonymous');
    }
    return fn(...args);
  }) as T;
}

/**
 * React hook for plan validation with migration warnings
 */
export function useValidatedPlan(planId: string): string {
  if (import.meta.env.DEV) {
    return validatePlanId(planId, 'React hook');
  }
  return planId;
}

/**
 * Build-time legacy reference detector
 * This would be used by a build plugin to scan for legacy patterns
 */
export function detectLegacyReferencesInCode(code: string): {
  planReferences: string[];
  fieldReferences: string[];
  suggestions: string[];
} {
  const planReferences: string[] = [];
  const fieldReferences: string[] = [];
  const suggestions: string[] = [];

  // Find legacy plan references
  LEGACY_PLAN_PATTERNS.forEach(pattern => {
    const regex = new RegExp(pattern, 'gi');
    if (regex.test(code)) {
      planReferences.push(pattern);
      const canonical = migrateLegacyPlanId(pattern.toLowerCase());
      if (canonical !== pattern.toLowerCase()) {
        suggestions.push(`Replace "${pattern}" with "${canonical}"`);
      }
    }
  });

  // Find legacy field references
  LEGACY_FIELD_NAMES.forEach(field => {
    const regex = new RegExp(field, 'gi');
    if (regex.test(code)) {
      fieldReferences.push(field);
      if (field === 'plan') {
        suggestions.push(`Replace "${field}" with "plan_type"`);
      } else if (field === 'storageQuotaMB') {
        suggestions.push(`Replace "${field}" with "quotaBytes" from plan config`);
      }
    }
  });

  return { planReferences, fieldReferences, suggestions };
}

/**
 * Console override to detect legacy patterns in console.log
 */
export function installLegacyDetectionConsole(): void {
  if (!import.meta.env.DEV) return;

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: any[]) => {
    const message = args.join(' ');
    if (containsLegacyPlanReference(message)) {
      console.warn('[PLAN_MIGRATION] Legacy plan reference detected in console.log:', message);
    }
    originalLog(...args);
  };

  console.warn = (...args: any[]) => {
    const message = args.join(' ');
    if (containsLegacyPlanReference(message)) {
      console.warn('[PLAN_MIGRATION] Legacy plan reference detected in console.warn:', message);
    }
    originalWarn(...args);
  };

  console.error = (...args: any[]) => {
    const message = args.join(' ');
    if (containsLegacyPlanReference(message)) {
      console.warn('[PLAN_MIGRATION] Legacy plan reference detected in console.error:', message);
    }
    originalError(...args);
  };
}

// Auto-install in development
if (import.meta.env.DEV) {
  // Check for legacy patterns on module load
  setTimeout(() => {
    checkForLegacyPatterns().catch(console.error);
  }, 1000);
  
  // Install console detection
  installLegacyDetectionConsole();
}
