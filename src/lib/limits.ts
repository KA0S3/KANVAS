import { useAuthStore } from '@/stores/authStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { triggerUpgradePrompt, type UpgradePromptData } from './upgradeTriggers';
import { getPlanConfig } from '@/lib/plans';

export interface BookLimitResult {
  canCreate: boolean;
  reason?: string;
  upgradePrompt?: {
    title: string;
    message: string;
    action: string;
  };
}

/**
 * Determines if a user can create a new book based on their subscription tier
 * 
 * Rules:
 * - Guest (not signed in): Max 1 book
 * - Free tier: Max 2 books  
 * - Pro/Lifetime: Unlimited books
 */
export function canCreateBook(): BookLimitResult {
  const { isAuthenticated, plan, effectiveLimits } = useAuthStore.getState();
  const { getAllBooks } = useBookStore.getState();
  
  const existingBooks = getAllBooks();
  const currentCount = existingBooks.length;
  
  // Guest users - max 1 book
  if (!isAuthenticated) {
    const guestConfig = getPlanConfig('guest')!;
    if (currentCount >= guestConfig.maxBooks) {
      return {
        canCreate: false,
        reason: 'guest_limit',
        upgradePrompt: {
          title: 'Guest Session Limit',
          message: "You're on a guest session — only 1 book saved locally. Sign in to back up and get 2+ books.",
          action: 'Sign In'
        }
      };
    }
    return { canCreate: true };
  }
  
  // Check effective limits first (owner keys, licenses, etc.)
  if (effectiveLimits?.maxBooks !== undefined) {
    if (effectiveLimits.maxBooks === -1 || effectiveLimits.maxBooks === Infinity) {
      // Unlimited books
      return { canCreate: true };
    }
    
    if (currentCount >= effectiveLimits.maxBooks) {
      return {
        canCreate: false,
        reason: 'plan_limit',
        upgradePrompt: {
          title: 'Book Limit Reached',
          message: `You've reached your limit of ${effectiveLimits.maxBooks} books. Upgrade to Pro or Buy storage/add-on to create more.`,
          action: 'Upgrade to Pro'
        }
      };
    }
    return { canCreate: true };
  }
  
  // Fallback to plan-based limits using canonical config
  const planConfig = getPlanConfig(plan);
  if (!planConfig) {
    console.warn(`[limits.ts] Unknown plan: ${plan}, falling back to free`);
    const freeConfig = getPlanConfig('free')!;
    if (currentCount >= freeConfig.maxBooks) {
      return {
        canCreate: false,
        reason: 'plan_limit',
        upgradePrompt: {
          title: 'Book Limit Reached',
          message: `You've reached your limit of ${freeConfig.maxBooks} books. Upgrade to Pro or Buy storage/add-on to create more.`,
          action: 'Upgrade to Pro'
        }
      };
    }
    return { canCreate: true };
  }
  
  if (planConfig.maxBooks === -1 || planConfig.maxBooks === Infinity) {
    // Unlimited books for pro/lifetime
    return { canCreate: true };
  }
  
  if (currentCount >= planConfig.maxBooks) {
    return {
      canCreate: false,
      reason: 'plan_limit',
      upgradePrompt: {
        title: 'Book Limit Reached',
        message: `You've reached your limit of ${planConfig.maxBooks} books. Upgrade to Pro or Buy storage/add-on to create more.`,
        action: 'Upgrade to Pro'
      }
    };
  }
  
  return { canCreate: true };
}

/**
 * Hook version of canCreateBook for React components
 */
export function useCanCreateBook() {
  const { isAuthenticated, plan, effectiveLimits } = useAuthStore();
  const { getAllBooks } = useBookStore();
  
  const existingBooks = getAllBooks();
  const currentCount = existingBooks.length;
  
  // Guest users - max 1 book
  if (!isAuthenticated) {
    const guestConfig = getPlanConfig('guest')!;
    if (currentCount >= guestConfig.maxBooks) {
      return {
        canCreate: false,
        reason: 'guest_limit',
        upgradePrompt: {
          title: 'Guest Session Limit',
          message: "You're on a guest session — only 1 book saved locally. Sign in to back up and get 2+ books.",
          action: 'Sign In'
        }
      };
    }
    return { canCreate: true };
  }
  
  // Check effective limits first (owner keys, licenses, etc.)
  if (effectiveLimits?.maxBooks !== undefined) {
    if (effectiveLimits.maxBooks === -1 || effectiveLimits.maxBooks === Infinity) {
      // Unlimited books
      return { canCreate: true };
    }
    
    if (currentCount >= effectiveLimits.maxBooks) {
      return {
        canCreate: false,
        reason: 'plan_limit',
        upgradePrompt: {
          title: 'Book Limit Reached',
          message: `You've reached your limit of ${effectiveLimits.maxBooks} books. Upgrade to Pro or Buy storage/add-on to create more.`,
          action: 'Upgrade to Pro'
        }
      };
    }
    return { canCreate: true };
  }
  
  // Fallback to plan-based limits using canonical config
  const planConfig = getPlanConfig(plan);
  if (!planConfig) {
    console.warn(`[limits.ts] Unknown plan: ${plan}, falling back to free`);
    const freeConfig = getPlanConfig('free')!;
    if (currentCount >= freeConfig.maxBooks) {
      return {
        canCreate: false,
        reason: 'plan_limit',
        upgradePrompt: {
          title: 'Book Limit Reached',
          message: `You've reached your limit of ${freeConfig.maxBooks} books. Upgrade to Pro or Buy storage/add-on to create more.`,
          action: 'Upgrade to Pro'
        }
      };
    }
    return { canCreate: true };
  }
  
  if (planConfig.maxBooks === -1 || planConfig.maxBooks === Infinity) {
    // Unlimited books for pro/lifetime
    return { canCreate: true };
  }
  
  if (currentCount >= planConfig.maxBooks) {
    return {
      canCreate: false,
      reason: 'plan_limit',
      upgradePrompt: {
        title: 'Book Limit Reached',
        message: `You've reached your limit of ${planConfig.maxBooks} books. Upgrade to Pro or Buy storage/add-on to create more.`,
        action: 'Upgrade to Pro'
      }
    };
  }
  
  return { canCreate: true };
}
