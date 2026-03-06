/**
 * Canonical Plan Configuration - Single Source of Truth
 * 
 * This file defines all plan types, quotas, and feature flags.
 * Used by client, server functions, and edge handlers.
 * 
 * Plan IDs: guest, free, pro, lifetime
 */

export interface PlanConfig {
  id: string;
  label: string;
  quotaBytes: number;
  maxBooks: number; // Infinity for unlimited
  adsEnabled: boolean;
  importExportEnabled: boolean;
  canCreateMultipleGuestBooks: boolean;
  pricing: {
    currency: string;
    recurringCents?: number;
    oneTimeCents?: number;
  };
}

export const PLANS_CONFIG: Record<string, PlanConfig> = {
  guest: {
    id: 'guest',
    label: 'Guest Session',
    quotaBytes: 0, // local-only
    maxBooks: 1,
    adsEnabled: true,
    importExportEnabled: false,
    canCreateMultipleGuestBooks: false,
    pricing: {
      currency: 'USD'
    }
  },
  
  free: {
    id: 'free',
    label: 'Free',
    quotaBytes: 100 * 1024 * 1024, // 100MB
    maxBooks: 1,
    adsEnabled: true,
    importExportEnabled: true, // basic / limited
    canCreateMultipleGuestBooks: false,
    pricing: {
      currency: 'USD'
    }
  },
  
  pro: {
    id: 'pro',
    label: 'Pro',
    quotaBytes: 10 * 1024 * 1024 * 1024, // 10GB
    maxBooks: Infinity,
    adsEnabled: false,
    importExportEnabled: true,
    canCreateMultipleGuestBooks: false,
    pricing: {
      currency: 'USD',
      recurringCents: 2000 // $20/month
    }
  },
  
  lifetime: {
    id: 'lifetime',
    label: 'Lifetime',
    quotaBytes: 15 * 1024 * 1024 * 1024, // 15GB
    maxBooks: Infinity,
    adsEnabled: false,
    importExportEnabled: true,
    canCreateMultipleGuestBooks: false,
    pricing: {
      currency: 'USD',
      oneTimeCents: 8000 // $80 one-time
    }
  }
};

// Helper functions
export function getPlanConfig(planId: string): PlanConfig | null {
  const config = PLANS_CONFIG[planId];
  if (!config && import.meta.env.DEV) {
    console.warn(`[PLANS_CONFIG] Unknown plan ID: "${planId}". Available plans:`, Object.keys(PLANS_CONFIG));
  }
  return config || null;
}

export function isValidPlanId(planId: string): boolean {
  return planId in PLANS_CONFIG;
}

export function getAllPlans(): PlanConfig[] {
  return Object.values(PLANS_CONFIG);
}

export function getUpgradePath(currentPlanId: string): string[] {
  const upgradeOrder = ['guest', 'free', 'pro', 'lifetime'];
  const currentIndex = upgradeOrder.indexOf(currentPlanId);
  return currentIndex >= 0 ? upgradeOrder.slice(currentIndex + 1) : [];
}

// Legacy plan mapping for migration
export const LEGACY_PLAN_MAPPING: Record<string, string> = {
  'basic': 'free',
  'premium': 'pro', 
  'enterprise': 'lifetime'
};

export function migrateLegacyPlanId(legacyPlanId: string): string {
  const migrated = LEGACY_PLAN_MAPPING[legacyPlanId];
  if (migrated && import.meta.env.DEV) {
    console.warn(`[PLANS_CONFIG] Migrating legacy plan ID "${legacyPlanId}" to "${migrated}"`);
  } else if (!migrated && import.meta.env.DEV) {
    console.warn(`[PLANS_CONFIG] Unknown legacy plan ID: "${legacyPlanId}"`);
  }
  return migrated || legacyPlanId;
}

