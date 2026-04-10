import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, Wifi, WifiOff, Loader2, CheckCircle, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { documentMutationService, type SyncStatus } from '@/services/DocumentMutationService';
import { useCloudStore } from '@/stores/cloudStore';
import { useAuthStore } from '@/stores/authStore';
import { CloudRetryBadge } from './CloudRetryStatus';

interface SyncStatusIndicatorProps {
  compact?: boolean;
  showManualSync?: boolean;
}

export function SyncStatusIndicator({ compact = false, showManualSync = true }: SyncStatusIndicatorProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncTime: null,
    syncEnabled: false,
    pendingChanges: false,
    onlineMode: true,
    quotaExceeded: false,
    storageUsed: 0,
    storageLimit: 0,
    syncInProgress: false,
    queuedItems: 0,
    documentVersion: 1
  });
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  const { isOnline, offlineMode } = useCloudStore();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    const unsubscribe = documentMutationService.subscribe((status) => {
      setSyncStatus(status);
    });

    // Get initial status
    setSyncStatus(documentMutationService.getStatus());

    return unsubscribe;
  }, []);

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    try {
      await documentMutationService.syncNow();
    } catch (error) {
      console.error('[SyncStatusIndicator] Manual sync failed:', error);
    } finally {
      setIsManualSyncing(false);
    }
  };

  const getStatusIcon = () => {
    if (!isAuthenticated) {
      return <CloudOff className="w-4 h-4 text-gray-400" />;
    }

    if (syncStatus.syncInProgress || isManualSyncing) {
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    }

    if (!isOnline || offlineMode) {
      return <WifiOff className="w-4 h-4 text-orange-500" />;
    }

    if (syncStatus.quotaExceeded) {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    }

    if (syncStatus.pendingChanges || syncStatus.queuedItems > 0) {
      return <Clock className="w-4 h-4 text-yellow-500" />;
    }

    if (syncStatus.lastSyncTime) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }

    return <Cloud className="w-4 h-4 text-gray-400" />;
  };

  const getStatusColor = () => {
    if (!isAuthenticated) return 'text-gray-400';
    if (syncStatus.syncInProgress || isManualSyncing) return 'text-blue-500';
    if (!isOnline || offlineMode) return 'text-orange-500';
    if (syncStatus.quotaExceeded) return 'text-red-500';
    if (syncStatus.pendingChanges || syncStatus.queuedItems > 0) return 'text-yellow-500';
    if (syncStatus.lastSyncTime) return 'text-green-500';
    return 'text-gray-400';
  };

  const getStatusText = () => {
    if (!isAuthenticated) return 'Not signed in';
    if (syncStatus.syncInProgress || isManualSyncing) return 'Syncing...';
    if (!isOnline || offlineMode) return 'Offline';
    if (syncStatus.quotaExceeded) return 'Storage quota exceeded';
    if (syncStatus.pendingChanges || syncStatus.queuedItems > 0) {
      return syncStatus.queuedItems > 0 ? `${syncStatus.queuedItems} items queued` : 'Pending sync';
    }
    if (syncStatus.lastSyncTime) {
      const timeAgo = new Date().getTime() - new Date(syncStatus.lastSyncTime).getTime();
      const minutes = Math.floor(timeAgo / 60000);
      if (minutes < 1) return 'Just synced';
      if (minutes < 60) return `Synced ${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `Synced ${hours}h ago`;
      return `Synced ${Math.floor(hours / 24)}d ago`;
    }
    return 'Not synced';
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-1 cursor-pointer ${getStatusColor()}`}>
                {getStatusIcon()}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm space-y-1">
                <p>{getStatusText()}</p>
                {isAuthenticated && (
                  <>
                    <p>Storage: {formatBytes(syncStatus.storageUsed)} / {formatBytes(syncStatus.storageLimit)}</p>
                    {syncStatus.queuedItems > 0 && <p>Queued items: {syncStatus.queuedItems}</p>}
                  </>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {/* Show failed upload badge when compact */}
        {isAuthenticated && <CloudRetryBadge />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-2 bg-background border rounded-lg">
      {/* Status Icon and Text */}
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <div className="flex flex-col">
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
          {isAuthenticated && (
            <span className="text-xs text-muted-foreground">
              {isOnline ? 'Online' : 'Offline'} • 
              {' '}{formatBytes(syncStatus.storageUsed)} / {formatBytes(syncStatus.storageLimit)}
            </span>
          )}
        </div>
      </div>

      {/* Status Badges */}
      <div className="flex items-center gap-1">
        {syncStatus.queuedItems > 0 && (
          <Badge variant="secondary" className="text-xs">
            {syncStatus.queuedItems} queued
          </Badge>
        )}
        
        {syncStatus.quotaExceeded && (
          <Badge variant="destructive" className="text-xs">
            Quota exceeded
          </Badge>
        )}

        {!isOnline && (
          <Badge variant="outline" className="text-xs">
            Offline
          </Badge>
        )}

        {/* Failed upload indicator */}
        {isAuthenticated && <CloudRetryBadge />}
      </div>

      {/* Manual Sync Button */}
      {showManualSync && isAuthenticated && isOnline && !syncStatus.quotaExceeded && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleManualSync}
          disabled={syncStatus.syncInProgress || isManualSyncing}
          className="ml-auto"
        >
          {isManualSyncing ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3 mr-1" />
              Sync Now
            </>
          )}
        </Button>
      )}
    </div>
  );
}

// Compact version for use in headers
export function CompactSyncStatus() {
  return <SyncStatusIndicator compact />;
}

// Full version for use in settings or dedicated sync panels
export function FullSyncStatus() {
  return <SyncStatusIndicator compact={false} />;
}
