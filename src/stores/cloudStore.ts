import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './authStore';

interface Quota {
  used: number;
  available: number;
}

interface CloudStore {
  syncEnabled: boolean;
  quota: Quota;
  pendingUploads: number;
  
  // Methods
  toggleSync: () => void;
  setQuota: (used: number, available: number) => void;
  canUpload: (bytes: number) => boolean;
}

// Default quota limits based on plan
const QUOTA_LIMITS = {
  free: 100 * 1024 * 1024,    // 100MB
  pro: 10 * 1024 * 1024 * 1024,  // 10GB
  lifetime: 15 * 1024 * 1024 * 1024, // 15GB
} as const;

export const useCloudStore = create<CloudStore>()(
  persist(
    (set, get) => ({
      // Initial state
      syncEnabled: false,
      quota: {
        used: 0,
        available: QUOTA_LIMITS.free,
      },
      pendingUploads: 0,

      // Toggle sync functionality
      toggleSync: () => {
        set((state) => ({
          syncEnabled: !state.syncEnabled,
        }));
      },

      // Set quota values
      setQuota: (used: number, available: number) => {
        set({
          quota: {
            used,
            available,
          },
        });
      },

      // Check if upload is possible within quota
      canUpload: (bytes: number): boolean => {
        const { syncEnabled, quota } = get();
        const effectiveLimits = useAuthStore.getState().effectiveLimits;
        
        // If sync is disabled, no cloud features active
        if (!syncEnabled) {
          return false;
        }
        
        // Use effectiveLimits.quotaBytes if available, otherwise fallback to quota.available
        const quotaLimit = effectiveLimits?.quotaBytes || quota.available;
        
        // Check if upload would exceed quota
        return (quota.used + bytes) <= quotaLimit;
      },
    }),
    {
      name: 'kanvas-cloud',
      // Only persist cloud settings, not dynamic state like pendingUploads
      partialize: (state) => ({
        syncEnabled: state.syncEnabled,
        quota: state.quota,
      }),
    }
  )
);

// Helper function to get quota limit based on current plan
export const getQuotaLimitForPlan = (plan: 'free' | 'pro' | 'lifetime'): number => {
  return QUOTA_LIMITS[plan];
};

// Helper function to update quota based on effective limits from authStore
export const updateQuotaBasedOnPlan = () => {
  const effectiveLimits = useAuthStore.getState().effectiveLimits;
  const currentUsed = useCloudStore.getState().quota.used;
  
  if (effectiveLimits) {
    // Use effectiveLimits.quotaBytes which includes base plan + all overrides
    const limit = effectiveLimits.quotaBytes;
    useCloudStore.getState().setQuota(currentUsed, limit);
  } else {
    // Fallback to free plan limits if effectiveLimits not available
    const limit = QUOTA_LIMITS.free;
    useCloudStore.getState().setQuota(currentUsed, limit);
  }
};
