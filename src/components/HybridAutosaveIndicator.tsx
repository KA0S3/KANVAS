import { useEffect, useState } from 'react';
import { RotateCw, Check, AlertCircle, Cloud, HardDrive } from 'lucide-react';
import { hybridAutosaveService, type HybridAutosaveStatus } from '@/services/hybridAutosaveService';

export function HybridAutosaveIndicator() {
  const [status, setStatus] = useState<HybridAutosaveStatus>('idle');
  const [lastLocalSave, setLastLocalSave] = useState<Date | null>(null);
  const [lastCloudSync, setLastCloudSync] = useState<Date | null>(null);
  const [pendingSyncs, setPendingSyncs] = useState(0);

  useEffect(() => {
    const unsubscribe = hybridAutosaveService.subscribe((state) => {
      setStatus(state.status);
      setLastLocalSave(state.lastLocalSave);
      setLastCloudSync(state.lastCloudSync);
      setPendingSyncs(state.pendingCloudSyncs);
    });

    return unsubscribe;
  }, []);

  const getStatusIcon = () => {
    switch (status) {
      case 'local-saving':
        return <HardDrive className="w-4 h-4 animate-spin text-blue-500" />;
      case 'cloud-syncing':
        return <Cloud className="w-4 h-4 animate-spin text-green-500" />;
      case 'saved':
        return <Check className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <RotateCw className="w-4 h-4 opacity-50" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'local-saving':
        return 'Saving locally...';
      case 'cloud-syncing':
        return pendingSyncs > 0 ? `Syncing ${pendingSyncs} files...` : 'Syncing to cloud...';
      case 'saved':
        return 'All saved';
      case 'error':
        return 'Sync failed';
      default:
        return 'Ready';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'local-saving':
        return 'text-blue-500';
      case 'cloud-syncing':
        return 'text-green-500';
      case 'saved':
        return 'text-green-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full bg-glass/50 border border-glass-border/30 ${getStatusColor()}`}>
      {getStatusIcon()}
      <span className="text-sm font-medium">{getStatusText()}</span>
      
      <div className="flex items-center gap-1 text-xs opacity-70">
        {lastLocalSave && (
          <span title="Last local save">
            💾 {lastLocalSave.toLocaleTimeString()}
          </span>
        )}
        {lastCloudSync && (
          <span title="Last cloud sync">
            ☁️ {lastCloudSync.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
