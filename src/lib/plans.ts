/**
 * Canonical Plan Configuration - Client Side
 *
 * This file mirrors the server-side plans configuration from supabase/functions/shared/plans.ts
 * Currency: ZAR (South African Rand) - native Paystack support for SA businesses
 * Transaction fee: 2.9% + R1.00
 *
 * Plan IDs: guest, free, pro, lifetime, owner
 */

import { getDisplayPrice } from '@/utils/currency';

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
    priceCents?: number; // Price in smallest currency unit (cents for ZAR)
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
      priceCents: 10000, // R100 ZAR
      currency: 'ZAR',
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
      priceCents: 150000, // R1500 ZAR
      currency: 'ZAR',
      recurring: false,
      skuId: 'lifetime_once',
      paystackProductKey: 'LIFETIME'
    }
  },

  owner: {
    id: 'owner',
    label: 'Owner',
    description: 'Unrestricted access with premium features',
    quotaBytes: -1, // Unlimited storage
    maxBooks: -1, // Unlimited books
    adsEnabled: false,
    importExportEnabled: true,
    maxAssetSize: -1, // Unlimited file size
    features: {
      cloudSync: true,
      collaboration: true,
      advancedFeatures: true,
      prioritySupport: true,
      unrestricted: true
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
    priceCents: 10000, // R100 ZAR
    currency: 'ZAR',
    skuId: 'storage_10gb',
    paystackProductKey: 'STORAGE_10GB'
  },

  addon_50gb: {
    id: 'addon_50gb',
    label: '50GB Storage',
    quotaBytes: 50 * 1024 * 1024 * 1024, // 50GB
    priceCents: 25000, // R250 ZAR
    currency: 'ZAR',
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

/**
 * Get display price for a plan with currency conversion
 * Returns both base ZAR price and converted local currency price
 */
export async function getPlanDisplayPrice(planId: string): Promise<{
  basePrice: string;
  convertedPrice?: string;
  currency: string;
}> {
  const plan = getPlanConfig(planId);
  if (!plan || !plan.pricing) {
    return { basePrice: 'N/A', currency: 'ZAR' };
  }

  const amountZAR = plan.pricing.priceCents / 100; // Convert cents to Rands
  return getDisplayPrice(amountZAR);
}

/**
 * Get display price for a storage addon with currency conversion
 */
export async function getStorageAddonDisplayPrice(addonId: string): Promise<{
  basePrice: string;
  convertedPrice?: string;
  currency: string;
}> {
  const addon = getStorageAddon(addonId);
  if (!addon) {
    return { basePrice: 'N/A', currency: 'ZAR' };
  }

  const amountZAR = addon.priceCents / 100; // Convert cents to Rands
  return getDisplayPrice(amountZAR);
}

