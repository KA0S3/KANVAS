import { useEffect, useState } from 'react';
import { hybridSyncService, type SyncStatus } from '@/services/hybridSyncService';
import { useAuthStore } from '@/stores/authStore';

export function useHybridSync() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncTime: null,
    syncEnabled: false,
    pendingChanges: false,
    onlineMode: false,
    quotaExceeded: false,
    storageUsed: 0,
    storageLimit: 0,
  });
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    // Subscribe to sync status updates
    const unsubscribe = hybridSyncService.subscribe((status) => {
      setSyncStatus(status);
    });

    // Initial status check
    setSyncStatus(hybridSyncService.getSyncStatus());

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated]);

  const triggerSync = async () => {
    return await hybridSyncService.syncToCloud();
  };

  const loadFromCloud = async (bookId: string) => {
    return await hybridSyncService.loadFromCloud(bookId);
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
