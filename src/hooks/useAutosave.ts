import { useEffect, useState } from 'react';
import { autosaveService, type AutosaveStatus } from '@/services/autosaveService';
import { useAuthStore } from '@/stores/authStore';

export function useAutosave() {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState(false);
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      // Reset state when not authenticated
      setStatus('idle');
      setLastSavedTime(null);
      setErrorMessage(null);
      setPendingChanges(false);
      return;
    }

    // Subscribe to autosave service
    const unsubscribe = autosaveService.subscribe((state) => {
      setStatus(state.status);
      setLastSavedTime(state.lastSavedTime);
      setErrorMessage(state.errorMessage);
      setPendingChanges(state.pendingChanges);
    });

    // Start autosave when authenticated
    autosaveService.startAutosave();

    return () => {
      unsubscribe();
      // Don't stop autosave here as other components might still need it
    };
  }, [isAuthenticated]);

  const triggerManualSave = async () => {
    return await autosaveService.triggerManualSave();
  };

  const isOnline = autosaveService.isOnline();
  const hasPendingChanges = autosaveService.hasPendingChanges();

  return {
    status,
    lastSavedTime,
    errorMessage,
    pendingChanges,
    isAuthenticated,
    isOnline,
    hasPendingChanges,
    triggerManualSave,
  };
}
