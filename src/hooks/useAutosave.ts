import { useEffect, useState } from 'react';
import { autosaveService, type AutosaveStatus } from '@/services/autosaveService';
import { useAuthStore } from '@/stores/authStore';

export function useAutosave() {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [lastLocalSave, setLastLocalSave] = useState<Date | null>(null);
  const [lastCloudSync, setLastCloudSync] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState(false);
  const [pendingCloudSyncs, setPendingCloudSyncs] = useState(0);
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      // Reset state when not authenticated
      setStatus('idle');
      setLastSavedTime(null);
      setLastLocalSave(null);
      setLastCloudSync(null);
      setErrorMessage(null);
      setPendingChanges(false);
      setPendingCloudSyncs(0);
      return;
    }

    // Subscribe to autosave service
    const unsubscribe = autosaveService.subscribe((state) => {
      setStatus(state.status);
      setLastSavedTime(state.lastSavedTime);
      setLastLocalSave(state.lastLocalSave);
      setLastCloudSync(state.lastCloudSync);
      setErrorMessage(state.errorMessage);
      setPendingChanges(state.pendingChanges);
      setPendingCloudSyncs(state.pendingCloudSyncs);
    });

    // NOTE: autosaveService.startAutosave() is now a no-op
    // Periodic autosave starts automatically when there are pending changes

    return () => {
      unsubscribe();
      // Don't stop autosave here as other components might still need it
    };
  }, [isAuthenticated]);

  const triggerManualSave = async () => {
    return await autosaveService.triggerManualSave();
  };

  const isOnline = autosaveService.isOnline();
  const hasPendingChanges = autosaveService.hasUnsavedChanges();

  return {
    status,
    lastSavedTime,
    lastLocalSave,
    lastCloudSync,
    errorMessage,
    pendingChanges,
    pendingCloudSyncs,
    isAuthenticated,
    isOnline,
    hasPendingChanges,
    triggerManualSave,
  };
}
