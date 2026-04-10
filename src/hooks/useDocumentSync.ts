import { useEffect, useState } from 'react';
import { documentMutationService, type SyncStatus } from '@/services/DocumentMutationService';
import { useAuthStore } from '@/stores/authStore';

export function useDocumentSync() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncTime: null,
    syncEnabled: false,
    pendingChanges: false,
    onlineMode: false,
    quotaExceeded: false,
    storageUsed: 0,
    storageLimit: 0,
    syncInProgress: false,
    queuedItems: 0,
    documentVersion: 1
  });
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    // Subscribe to sync status updates
    const unsubscribe = documentMutationService.subscribe((status) => {
      setSyncStatus(status);
    });

    // Initial status check
    setSyncStatus(documentMutationService.getStatus());

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated]);

  const triggerSync = async () => {
    return await documentMutationService.syncNow();
  };

  const loadFromCloud = async (projectId: string) => {
    const result = await documentMutationService.loadDocument(projectId);
    return result.success;
  };

  const queueOperation = (operation: Parameters<typeof documentMutationService.queueOperation>[0]) => {
    documentMutationService.queueOperation(operation);
  };

  return {
    syncStatus,
    triggerSync,
    loadFromCloud,
    queueOperation,
    isAuthenticated,
    isOnline: syncStatus.onlineMode,
    lastSyncTime: syncStatus.lastSyncTime,
    syncEnabled: syncStatus.syncEnabled,
    quotaExceeded: syncStatus.quotaExceeded,
    storageUsed: syncStatus.storageUsed,
    storageLimit: syncStatus.storageLimit,
    storagePercentage: syncStatus.storageLimit > 0 
      ? (syncStatus.storageUsed / syncStatus.storageLimit) * 100 
      : 0,
    documentVersion: syncStatus.documentVersion,
    pendingChanges: syncStatus.pendingChanges,
    syncInProgress: syncStatus.syncInProgress,
    queuedItems: syncStatus.queuedItems
  };
}
