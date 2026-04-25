import { useEffect } from 'react';
import { autosaveService } from '@/services/autosaveService';
import { useAuthStore } from '@/stores/authStore';
import { useBookStore } from '@/stores/bookStoreSimple';

export function useHybridAutosave() {
  const { user, isAuthenticated } = useAuthStore();
  const { currentBookId } = useBookStore();

  useEffect(() => {
    // Load existing data on mount
    if (isAuthenticated && user) {
      console.log('[useHybridAutosave] Loading data for user:', user.id);
      
      autosaveService.loadUserData(user.id, currentBookId).then((savedData) => {
        if (savedData) {
          console.log('[useHybridAutosave] Data loaded, restoring UI state');
          // TODO: Restore the saved data to your stores here if needed
          // This would need to be implemented based on your store structure
        }
      });
    }

    // NOTE: autosaveService automatically handles subscriptions and debouncing
    // It performs local save + cloud sync (hybrid) in a single service
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
