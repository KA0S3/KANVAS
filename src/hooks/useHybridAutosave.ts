import { useEffect } from 'react';
import { hybridAutosaveService } from '@/services/hybridAutosaveService';
import { useAuthStore } from '@/stores/authStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useAssetStore } from '@/stores/assetStore';

export function useHybridAutosave() {
  const { user, isAuthenticated } = useAuthStore();
  const { currentBookId } = useBookStore();
  const { assets } = useAssetStore();

  useEffect(() => {
    // Start autosave when user is authenticated
    if (isAuthenticated && user) {
      console.log('[useHybridAutosave] Starting hybrid autosave for user:', user.id);
      
      // Load existing data first (local + cloud)
      hybridAutosaveService.loadUserData(user.id, currentBookId).then((savedData) => {
        if (savedData) {
          console.log('[useHybridAutosave] Data loaded, restoring UI state');
          // TODO: Restore the saved data to your stores here
          // This would need to be implemented based on your store structure
        }
      });

      // Start the hybrid autosave cycles
      hybridAutosaveService.startAutosave();
    }

    // Stop autosave when user logs out
    return () => {
      hybridAutosaveService.stopAutosave();
    };
  }, [isAuthenticated, user, currentBookId]);

  const triggerManualSave = () => {
    return hybridAutosaveService.triggerManualSave();
  };

  const getStatus = () => {
    return hybridAutosaveService.getStatus();
  };

  return {
    triggerManualSave,
    getStatus,
  };
}
