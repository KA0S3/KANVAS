import { useState, useEffect } from 'react';
import { Activity, Database, Cloud, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBackgroundStoreOptimized } from '@/stores/backgroundStoreOptimized';

export function PerformanceMonitor() {
  const { getPendingUpdates, flushToCloud, lastCloudSync } = useBackgroundStoreOptimized();
  const [stats, setStats] = useState({
    pendingCount: 0,
    lastSync: 0,
    memoryUsage: 0,
    batchProcessorActive: false
  });

  useEffect(() => {
    const updateStats = () => {
      const pending = getPendingUpdates();
      setStats({
        pendingCount: pending.length,
        lastSync: lastCloudSync,
        memoryUsage: (performance as any).memory?.usedJSHeapSize || 0,
        batchProcessorActive: pending.length > 0
      });
    };

    updateStats();
    const interval = setInterval(updateStats, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, [getPendingUpdates, lastCloudSync]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)}KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  const formatTime = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  return (
    <div className="fixed bottom-4 left-4 bg-glass/90 border border-glass-border/40 rounded-lg p-3 space-y-2 text-xs max-w-xs">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <Activity className="w-4 h-4" />
        Performance Monitor
      </div>
      
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Pending Updates:</span>
          <span className={stats.pendingCount > 0 ? "text-orange-500" : "text-green-500"}>
            {stats.pendingCount}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last Sync:</span>
          <span>{formatTime(stats.lastSync)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-muted-foreground">Memory:</span>
          <span>{formatBytes(stats.memoryUsage)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-muted-foreground">Batch Status:</span>
          <span className={stats.batchProcessorActive ? "text-blue-500" : "text-muted-foreground"}>
            {stats.batchProcessorActive ? "Active" : "Idle"}
          </span>
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-glass-border/20">
        <Button
          size="sm"
          variant="outline"
          onClick={() => flushToCloud()}
          disabled={stats.pendingCount === 0}
          className="flex-1 gap-1"
        >
          <Cloud className="w-3 h-3" />
          Sync Now
        </Button>
        
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.location.reload()}
          className="flex-1 gap-1"
        >
          <Zap className="w-3 h-3" />
          Reset
        </Button>
      </div>
    </div>
  );
}
