import { useEffect } from 'react';
import { localAutosaveService } from '@/services/localAutosaveService';
import { useAuthStore } from '@/stores/authStore';
import { useBookStore } from '@/stores/bookStoreSimple';

export function useLocalAutosave() {
  const { user, isAuthenticated } = useAuthStore();
  const { currentBookId } = useBookStore();

  useEffect(() => {
    // Start autosave when user is authenticated
    if (isAuthenticated && user) {
      console.log('[useLocalAutosave] Starting local autosave for user:', user.id);
      
      // Load existing data first
      localAutosaveService.loadUserData(user.id, currentBookId).then((savedData) => {
        if (savedData) {
          console.log('[useLocalAutosave] Loaded saved data from:', savedData.lastSaved);
          // Restore the saved data to your stores here
          // This would need to be implemented based on your store structure
        }
      });

      // Start the autosave cycles
      localAutosaveService.startAutosave();
    }

    // Stop autosave when user logs out
    return () => {
      localAutosaveService.stopAutosave();
    };
  }, [isAuthenticated, user, currentBookId]);

  const triggerManualSave = () => {
    return localAutosaveService.triggerManualSave();
  };

  const getStatus = () => {
    return localAutosaveService.getStatus();
  };

  return {
    triggerManualSave,
    getStatus,
  };
}
