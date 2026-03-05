/**
 * Simple Plan Configuration - Production Ready
 * No dev warnings, no complex canonical naming
 * Just clean, simple plan configuration
 */

export interface PlanConfig {
  id: string;
  name: string;
  storageMB: number;
  maxBooks: number;
  canExport: boolean;
  hasAds: boolean;
}

export const PLANS: Record<string, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Free Plan',
    storageMB: 100,
    maxBooks: 2,
    canExport: false,
    hasAds: true
  },
  pro: {
    id: 'pro',
    name: 'Pro Plan',
    storageMB: 10240, // 10GB
    maxBooks: -1, // unlimited
    canExport: true,
    hasAds: false
  },
  lifetime: {
    id: 'lifetime',
    name: 'Lifetime Plan',
    storageMB: 15360, // 15GB
    maxBooks: -1, // unlimited
    canExport: true,
    hasAds: false
  }
};

export function getPlan(planId: string): PlanConfig | null {
  return PLANS[planId] || null;
}

export function getStorageMB(planId: string): number {
  const plan = getPlan(planId);
  return plan ? plan.storageMB : 100; // fallback to free plan
}

export function getMaxBooks(planId: string): number {
  const plan = getPlan(planId);
  return plan ? plan.maxBooks : 2; // fallback to free plan
}

export function canExport(planId: string): boolean {
  const plan = getPlan(planId);
  return plan ? plan.canExport : false; // fallback to restricted
}
