import { useHybridSync } from '@/hooks/useHybridSync';
import { Cloud, CloudOff, AlertTriangle, CheckCircle } from 'lucide-react';

export function SyncStatus() {
  const { 
    isOnline, 
    lastSyncTime, 
    quotaExceeded, 
    storageUsed, 
    storageLimit, 
    storagePercentage,
    triggerSync 
  } = useHybridSync();

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (date: Date | null) => {
    if (!date) return 'Never';
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
      Math.round((date.getTime() - Date.now()) / 1000 / 60),
      'minute'
    );
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-background border rounded-lg">
      {/* Sync Status Icon */}
      <div className="flex items-center gap-1">
        {quotaExceeded ? (
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
        ) : isOnline ? (
          <Cloud className="h-4 w-4 text-green-500" />
        ) : (
          <CloudOff className="h-4 w-4 text-gray-400" />
        )}
        
        <span className="text-xs text-muted-foreground">
          {quotaExceeded 
            ? 'Quota Exceeded' 
            : isOnline 
              ? 'Synced' 
              : 'Local Only'
          }
        </span>
      </div>

      {/* Storage Usage */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">
          {formatBytes(storageUsed)} / {formatBytes(storageLimit)}
        </span>
        
        {/* Progress bar */}
        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all ${
              quotaExceeded 
                ? 'bg-yellow-500' 
                : storagePercentage > 80 
                  ? 'bg-orange-500' 
                  : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(storagePercentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Last Sync Time */}
      <div className="text-xs text-muted-foreground">
        {formatTime(lastSyncTime)}
      </div>

      {/* Manual Sync Button */}
      {isOnline && !quotaExceeded && (
        <button
          onClick={() => triggerSync()}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          Sync Now
        </button>
      )}
    </div>
  );
}
