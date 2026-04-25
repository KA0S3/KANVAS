import { useEffect } from 'react';
import { autosaveService } from '@/services/autosaveService';
import { useAuthStore } from '@/stores/authStore';
import { useBookStore } from '@/stores/bookStoreSimple';

export function useLocalAutosave() {
  const { user, isAuthenticated } = useAuthStore();
  const { currentBookId } = useBookStore();

  useEffect(() => {
    // Load existing data on mount
    if (isAuthenticated && user) {
      console.log('[useLocalAutosave] Loading data for user:', user.id);
      
      autosaveService.loadUserData(user.id, currentBookId).then((savedData) => {
        if (savedData) {
          console.log('[useLocalAutosave] Loaded saved data from:', savedData.lastLocalSave);
          // Restore the saved data to your stores here if needed
          // This would need to be implemented based on your store structure
        }
      });
    }

    // NOTE: autosaveService automatically handles subscriptions and debouncing
    // No need to start/stop - it runs on-demand when there are pending changes
  }, [isAuthenticated, user, currentBookId]);

  const triggerManualSave = () => {
    return autosaveService.triggerManualSave();
  };

  const getStatus = () => {
    return autosaveService.getState().status;
  };

  return {
    triggerManualSave,
    getStatus,
  };
}
