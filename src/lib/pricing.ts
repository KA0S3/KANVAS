// Legacy pricing file - DEPRECATED
// Use src/config/plans.ts instead for all plan configuration
// This file is kept for backward compatibility only

import { PLANS_CONFIG, getPlanConfig } from '@/lib/plans';

export const PLANS = {
  FREE: getPlanConfig('free')!,
  PRO: getPlanConfig('pro')!,
  LIFETIME: getPlanConfig('lifetime')!
} as const;

export const STORAGE_ADDONS_LEGACY = {}; // DEPRECATED - storage addons removed from canonical config

export const LIFETIME_LAUNCH_PRICE_CENTS = 8000; // $80 USD in cents

// Helper functions - DEPRECATED, use config/plans.ts instead
export const getPlanById = (planId: string) => {
  console.warn('[pricing.ts] DEPRECATED: Use getPlanConfig from config/plans.ts instead');
  return getPlanConfig(planId);
};

export const getStorageAddonById = (addonId: string) => {
  console.warn('[pricing.ts] DEPRECATED: Storage addons removed from canonical config');
  return null;
};

export const formatBytes = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

export const formatPrice = (cents: number, currency = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(cents / 100);
};
