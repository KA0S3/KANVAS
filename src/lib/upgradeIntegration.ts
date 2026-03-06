import { useAuthStore } from '@/stores/authStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { triggerUpgradePrompt } from './upgradeTriggers';
import type { UpgradePromptData } from './upgradeTriggers';

/**
 * Enhanced limit checking with upgrade flow integration
 * This extends the existing limits.ts functionality
 */
export function checkLimitsAndTriggerUpgrade(
  onUpgrade: (promptData: UpgradePromptData) => void
) {
  const { isAuthenticated, plan, effectiveLimits } = useAuthStore.getState();
  const { getAllBooks } = useBookStore.getState();
  
  const existingBooks = getAllBooks();
  const currentCount = existingBooks.length;
  
  // Guest users - max 1 book
  if (!isAuthenticated) {
    if (currentCount >= 1) {
      triggerUpgradePrompt('max-books', { 
        onUpgrade,
        customMessage: "You're on a guest session — only 1 book saved locally. Sign in to back up and get 2+ books."
      });
      return false;
    }
    return true;
  }
  
  // Check effective limits first
  if (effectiveLimits?.maxBooks !== undefined) {
    if (effectiveLimits.maxBooks === -1) {
      return true; // Unlimited
    }
    
    if (currentCount >= effectiveLimits.maxBooks) {
      triggerUpgradePrompt('max-books', { 
        onUpgrade,
        customMessage: `You've reached your limit of ${effectiveLimits.maxBooks} books. Upgrade to create more.`
      });
      return false;
    }
    return true;
  }
  
  // Fallback to plan-based limits
  const maxBooksByPlan = {
    free: 1,
    pro: -1, // Unlimited
    lifetime: -1 // Unlimited
  };
  
  const maxBooks = maxBooksByPlan[plan] || 1;
  
  if (maxBooks === -1) {
    return true; // Unlimited for pro/lifetime
  }
  
  if (currentCount >= maxBooks) {
    triggerUpgradePrompt('max-books', { 
      onUpgrade,
      customMessage: `You've reached your limit of ${maxBooks} books. Upgrade to create more.`
    });
    return false;
  }
  
  return true;
}

/**
 * Hook for React components to check limits and trigger upgrades
 */
export function useUpgradeIntegration() {
  const { plan, isAuthenticated } = useAuthStore();
  
  const triggerBookLimitUpgrade = (onUpgrade: (promptData: UpgradePromptData) => void) => {
    return checkLimitsAndTriggerUpgrade(onUpgrade);
  };
  
  const triggerStorageUpgrade = (
    currentUsage: number, 
    quotaLimit: number, 
    requiredBytes: number,
    onUpgrade: (promptData: UpgradePromptData) => void
  ) => {
    if (currentUsage + requiredBytes > quotaLimit) {
      triggerUpgradePrompt('upload-blocked', { 
        onUpgrade,
        customMessage: `Storage quota exceeded. Need ${formatBytes(requiredBytes)} more space.`
      });
      return false;
    }
    return true;
  };
  
  const triggerZipExportUpgrade = (onUpgrade: (promptData: UpgradePromptData) => void) => {
    if (!isAuthenticated || plan === 'free') {
      triggerUpgradePrompt('zip-export', { onUpgrade });
      return false;
    }
    return true;
  };
  
  const isPremium = isAuthenticated && plan !== 'free';
  
  return {
    triggerBookLimitUpgrade,
    triggerStorageUpgrade,
    triggerZipExportUpgrade,
    isPremium,
    canShowTeaserCards: isAuthenticated && plan === 'free'
  };
}

// Helper function for formatting bytes
function formatBytes(bytes: number) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}
