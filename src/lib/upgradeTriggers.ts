import { toast } from 'sonner';

export type UpgradePromptType = 'max-books' | 'upload-blocked' | 'zip-export' | 'ads-removed';

export interface UpgradePromptData {
  title: string;
  message: string;
  action: string;
  type: 'guest' | 'plan_limit';
}

export interface UpgradeTriggerOptions {
  onUpgrade?: (promptData: UpgradePromptData) => void;
  showToast?: boolean;
  customMessage?: string;
}

/**
 * Get upgrade prompt data for different limit types
 */
function getUpgradePromptData(
  limitType: UpgradePromptType, 
  customMessage?: string
): UpgradePromptData {
  const promptConfigs: Record<UpgradePromptType, UpgradePromptData> = {
    'max-books': {
      title: 'World Limit Reached',
      message: customMessage || 'You\'ve reached your limit of books. Upgrade to create unlimited worlds and access premium features.',
      action: 'Upgrade Now',
      type: 'plan_limit'
    },
    'upload-blocked': {
      title: 'Storage Quota Exceeded',
      message: customMessage || 'You need more storage to upload this file. Upgrade your plan to get 10GB of cloud storage with automatic backups.',
      action: 'Buy Storage',
      type: 'plan_limit'
    },
    'zip-export': {
      title: 'Export Restricted',
      message: customMessage || 'Full ZIP export is a premium feature. Upgrade your plan to access complete project exports with all images and assets.',
      action: 'Upgrade to Pro',
      type: 'plan_limit'
    },
    'ads-removed': {
      title: 'Remove Ads',
      message: customMessage || 'Enjoy an uninterrupted creative experience with no ads. Upgrade to Premium for an ad-free experience.',
      action: 'Upgrade Now',
      type: 'plan_limit'
    }
  };
  
  return promptConfigs[limitType];
}

/**
 * Triggers upgrade prompt when user hits a limit
 */
export function triggerUpgradePrompt(
  limitType: UpgradePromptType, 
  options: UpgradeTriggerOptions = {}
) {
  const { onUpgrade, showToast = true, customMessage } = options;
  
  const promptData = getUpgradePromptData(limitType, customMessage);
  
  if (showToast) {
    toast.error(promptData.message, {
      action: onUpgrade ? {
        label: promptData.action,
        onClick: () => onUpgrade(promptData)
      } : undefined
    });
  }
  
  onUpgrade?.(promptData);
}

/**
 * Hook for checking limits and triggering upgrade prompt
 */
export function useUpgradeTrigger(onUpgrade: (promptData: UpgradePromptData) => void) {
  const checkBookLimit = (currentBooks: number, maxBooks: number, customMessage?: string) => {
    if (currentBooks >= maxBooks) {
      triggerUpgradePrompt('max-books', { onUpgrade, customMessage });
      return false;
    }
    return true;
  };
  
  const checkStorageLimit = (currentUsage: number, quotaLimit: number, requiredBytes: number, customMessage?: string) => {
    if (currentUsage + requiredBytes > quotaLimit) {
      triggerUpgradePrompt('upload-blocked', { onUpgrade, customMessage });
      return false;
    }
    return true;
  };
  
  const checkZipExport = (isPremium: boolean, customMessage?: string) => {
    if (!isPremium) {
      triggerUpgradePrompt('zip-export', { onUpgrade, customMessage });
      return false;
    }
    return true;
  };
  
  const checkAdsRemoved = (isPremium: boolean, customMessage?: string) => {
    if (!isPremium) {
      triggerUpgradePrompt('ads-removed', { onUpgrade, customMessage, showToast: false });
      return false;
    }
    return true;
  };
  
  return {
    checkBookLimit,
    checkStorageLimit,
    checkZipExport,
    checkAdsRemoved,
    triggerUpgrade: triggerUpgradePrompt
  };
}

/**
 * Higher-order component for wrapping functions with upgrade checks
 */
export function withUpgradeCheck<T extends any[], R>(
  fn: (...args: T) => R,
  checkFn: () => boolean,
  onFail: () => void
) {
  return (...args: T): R | void => {
    if (!checkFn()) {
      onFail();
      return;
    }
    return fn(...args);
  };
}
