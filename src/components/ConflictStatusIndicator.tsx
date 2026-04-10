import React from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useConflictResolution, type ConflictInfo } from '@/hooks/useConflictResolution';
import { connectivityService } from '@/services/connectivityService';

/**
 * ConflictStatusIndicator - Shows sync/conflict status in the UI
 * 
 * Displays:
 * - Online/offline status
 * - Number of conflicts encountered
 * - Option to manually trigger sync
 * - Last conflict details
 */
export function ConflictStatusIndicator() {
  const { 
    conflictCount, 
    lastConflict, 
    currentStrategy, 
    setStrategy, 
    strategies,
    syncNow,
    clearConflictHistory 
  } = useConflictResolution();

  const [isOnline, setIsOnline] = React.useState(connectivityService.isOnline());
  const [isSyncing, setIsSyncing] = React.useState(false);

  // Listen for connectivity changes
  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    await syncNow();
    setIsSyncing(false);
  };

  // Don't show anything if no conflicts and online
  if (conflictCount === 0 && isOnline && !lastConflict) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 px-3 py-2 bg-background border rounded-md shadow-sm">
        {/* Online/Offline Status */}
        {!isOnline && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-muted-foreground">
                <WifiOff className="h-4 w-4" />
                <span className="text-xs">Offline</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Changes will sync when connection is restored</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Conflict Count */}
        {conflictCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant={lastConflict?.discardedCount ? 'destructive' : 'default'}
                className="cursor-pointer"
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                {conflictCount} conflict{conflictCount === 1 ? '' : 's'}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-sm">
              <div className="space-y-2">
                <p className="font-medium">Conflict Resolution History</p>
                {lastConflict && (
                  <div className="text-xs space-y-1">
                    <p>Strategy: {lastConflict.strategy}</p>
                    <p>Applied: {lastConflict.appliedCount} | Discarded: {lastConflict.discardedCount}</p>
                    {lastConflict.conflicts.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {lastConflict.conflicts.slice(0, 5).map((c: ConflictInfo, i: number) => (
                          <li key={i} className="text-muted-foreground">
                            • {c.operation}: {c.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full mt-2"
                  onClick={clearConflictHistory}
                >
                  Clear History
                </Button>
              </div>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Last Conflict Success Indicator */}
        {lastConflict && lastConflict.conflictCount === 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Last sync successful - no conflicts</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Sync Now Button */}
        {isOnline && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={handleSyncNow}
            disabled={isSyncing}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync'}
          </Button>
        )}

        {/* Strategy Selector (simplified) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-xs cursor-help">
              {currentStrategy === 'server-wins' && 'Server Wins'}
              {currentStrategy === 'client-wins' && 'Client Wins'}
              {currentStrategy === 'merge' && 'Merge'}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="font-medium text-xs">Conflict Strategy</p>
              {strategies.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStrategy(s.value)}
                  className={`block w-full text-left text-xs px-2 py-1 rounded ${
                    currentStrategy === s.value 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-muted'
                  }`}
                >
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground block text-[10px]">
                    {s.description}
                  </span>
                </button>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

export default ConflictStatusIndicator;
