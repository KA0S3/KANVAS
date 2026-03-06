/**
 * Canonical Plan Configuration - Single Source of Truth
 * 
 * This file defines all plan types, quotas, and feature flags.
 * Used by client, server functions, and edge handlers.
 * 
 * Plan IDs: guest, free, pro, lifetime
 * - guest: Not signed in session
 * - free: Signed-in free tier
 * - pro: Paid subscription
 * - lifetime: One-time purchase
 */

export interface PlanConfig {
  id: string;
  label: string;
  description: string;
  quotaBytes: number;
  maxBooks: number; // -1 for unlimited
  adsEnabled: boolean;
  importExportEnabled: boolean;
  maxAssetSize: number; // bytes
  features: Record<string, any>;
  pricing?: {
    priceCents?: number;
    currency?: string;
    recurring?: boolean;
    skuId?: string;
    paystackProductKey?: string;
  };
}

export const PLANS_CONFIG: Record<string, PlanConfig> = {
  guest: {
    id: 'guest',
    label: 'Guest Session',
    description: 'Local-only session, not signed in',
    quotaBytes: 0, // No cloud storage
    maxBooks: 1,
    adsEnabled: true,
    importExportEnabled: false,
    maxAssetSize: 10 * 1024 * 1024, // 10MB
    features: {
      cloudSync: false,
      collaboration: false,
      advancedFeatures: false
    }
  },
  
  free: {
    id: 'free',
    label: 'Free',
    description: 'Free tier with basic features',
    quotaBytes: 100 * 1024 * 1024, // 100MB
    maxBooks: 1,
    adsEnabled: true,
    importExportEnabled: false,
    maxAssetSize: 50 * 1024 * 1024, // 50MB
    features: {
      cloudSync: true,
      collaboration: false,
      advancedFeatures: false
    }
  },
  
  pro: {
    id: 'pro',
    label: 'Pro',
    description: 'Professional subscription with premium features',
    quotaBytes: 10 * 1024 * 1024 * 1024, // 10GB
    maxBooks: -1, // Unlimited
    adsEnabled: false,
    importExportEnabled: true,
    maxAssetSize: 500 * 1024 * 1024, // 500MB
    features: {
      cloudSync: true,
      collaboration: true,
      advancedFeatures: true,
      prioritySupport: true
    },
    pricing: {
      priceCents: 2000, // $20 USD
      currency: 'USD',
      recurring: true,
      skuId: 'pro_monthly',
      paystackProductKey: 'PRO_SUBSCRIPTION'
    }
  },
  
  lifetime: {
    id: 'lifetime',
    label: 'Lifetime',
    description: 'One-time purchase for lifetime access',
    quotaBytes: 15 * 1024 * 1024 * 1024, // 15GB
    maxBooks: -1, // Unlimited
    adsEnabled: false,
    importExportEnabled: true,
    maxAssetSize: 500 * 1024 * 1024, // 500MB
    features: {
      cloudSync: true,
      collaboration: true,
      advancedFeatures: true,
      prioritySupport: true,
      lifetimeAccess: true
    },
    pricing: {
      priceCents: 8000, // $80 USD
      currency: 'USD',
      recurring: false,
      skuId: 'lifetime_once',
      paystackProductKey: 'LIFETIME'
    }
  }
};

// Storage add-ons (can be purchased separately)
export interface StorageAddonConfig {
  id: string;
  label: string;
  quotaBytes: number;
  priceCents: number;
  currency: string;
  skuId?: string;
  paystackProductKey?: string;
}

export const STORAGE_ADDONS: Record<string, StorageAddonConfig> = {
  addon_10gb: {
    id: 'addon_10gb',
    label: '10GB Storage',
    quotaBytes: 10 * 1024 * 1024 * 1024, // 10GB
    priceCents: 1000, // $10 USD
    currency: 'USD',
    skuId: 'storage_10gb',
    paystackProductKey: 'STORAGE_10GB'
  },
  
  addon_50gb: {
    id: 'addon_50gb',
    label: '50GB Storage',
    quotaBytes: 50 * 1024 * 1024 * 1024, // 50GB
    priceCents: 3000, // $30 USD
    currency: 'USD',
    skuId: 'storage_50gb',
    paystackProductKey: 'STORAGE_50GB'
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

export function getStorageAddon(addonId: string): StorageAddonConfig | null {
  const config = STORAGE_ADDONS[addonId];
  if (!config && import.meta.env.DEV) {
    console.warn(`[PLANS_CONFIG] Unknown storage addon ID: "${addonId}". Available addons:`, Object.keys(STORAGE_ADDONS));
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

// Re-export types for use in other files
