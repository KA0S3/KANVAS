import { useState, useEffect } from 'react';
import { Activity, Database, Cloud, Zap, Book, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { performanceMonitor } from '@/utils/performanceMonitor';

export function PerformanceMonitor() {
  const [stats, setStats] = useState({
    pendingCount: 0,
    lastSync: 0,
    memoryUsage: 0,
    batchProcessorActive: false,
    databaseRequests: 0,
    authRequests: 0,
    syncOperations: 0,
    bookCreations: 0
  });

  useEffect(() => {
    const updateStats = () => {
      const metrics = performanceMonitor.getMetrics();
      setStats(prev => ({
        ...prev,
        databaseRequests: metrics.databaseRequests,
        authRequests: metrics.authRequests,
        syncOperations: metrics.syncOperations,
        bookCreations: metrics.bookCreations,
        memoryUsage: (performance as any).memory?.usedJSHeapSize || 0
      }));
    };

    updateStats();
    // NOTE: Polling removed to prevent idle CPU usage
    // Stats will update when user clicks "Reset Metrics" or component re-renders
    // const interval = setInterval(updateStats, 2000); // Update every 2 seconds

    // return () => clearInterval(interval);
  }, []);

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
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground flex items-center gap-1">
            <Database className="w-3 h-3" />
            DB Requests:
          </span>
          <span className={stats.databaseRequests > 20 ? "text-orange-500" : "text-green-500"}>
            {stats.databaseRequests}
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground flex items-center gap-1">
            <User className="w-3 h-3" />
            Auth Requests:
          </span>
          <span className={stats.authRequests > 10 ? "text-orange-500" : "text-green-500"}>
            {stats.authRequests}
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground flex items-center gap-1">
            <Cloud className="w-3 h-3" />
            Sync Operations:
          </span>
          <span className={stats.syncOperations > 5 ? "text-orange-500" : "text-green-500"}>
            {stats.syncOperations}
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground flex items-center gap-1">
            <Book className="w-3 h-3" />
            Book Creations:
          </span>
          <span className={stats.bookCreations > 5 ? "text-orange-500" : "text-green-500"}>
            {stats.bookCreations}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-muted-foreground">Memory:</span>
          <span>{formatBytes(stats.memoryUsage)}</span>
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-glass-border/20">
        <Button
          size="sm"
          variant="outline"
          onClick={() => performanceMonitor.reset()}
          className="flex-1 gap-1"
        >
          <Zap className="w-3 h-3" />
          Reset Metrics
        </Button>
      </div>
    </div>
  );
}
