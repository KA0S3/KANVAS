import { useEffect, useState } from 'react';
import { optimizedSyncService, type OptimizedSyncStatus } from '@/services/optimizedSyncService';
import { useAuthStore } from '@/stores/authStore';

export function useHybridSync() {
  const [syncStatus, setSyncStatus] = useState<OptimizedSyncStatus>({
    lastSyncTime: null,
    syncEnabled: false,
    pendingChanges: false,
    onlineMode: false,
    quotaExceeded: false,
    storageUsed: 0,
    storageLimit: 0,
    payloadSize: 0,
    syncInProgress: false,
    queuedItems: 0
  });
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    // Subscribe to sync status updates
    const unsubscribe = optimizedSyncService.subscribe((status) => {
      setSyncStatus(status);
    });

    // Initial status check
    setSyncStatus(optimizedSyncService.getSyncStatus());

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated]);

  const triggerSync = async () => {
    return await optimizedSyncService.syncToCloud();
  };

  const loadFromCloud = async (bookId: string) => {
    // OptimizedSyncService doesn't have loadFromCloud, but syncToCloud handles both directions
    return await optimizedSyncService.syncToCloud();
  };

  return {
    syncStatus,
    triggerSync,
    loadFromCloud,
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
  };
}
