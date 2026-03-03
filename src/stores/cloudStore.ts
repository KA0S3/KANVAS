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
        
        // If sync is disabled, no cloud features active
        if (!syncEnabled) {
          return false;
        }
        
        // Check if upload would exceed quota
        return (quota.used + bytes) <= quota.available;
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

// Helper function to update quota based on current plan from authStore
export const updateQuotaBasedOnPlan = () => {
  const plan = useAuthStore.getState().plan;
  const limit = getQuotaLimitForPlan(plan);
  const currentUsed = useCloudStore.getState().quota.used;
  
  useCloudStore.getState().setQuota(currentUsed, limit);
};
