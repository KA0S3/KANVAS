import { useEffect, useState } from 'react';
import { RotateCw, Check, AlertCircle } from 'lucide-react';
import { localAutosaveService, type LocalAutosaveStatus } from '@/services/localAutosaveService';

export function AutosaveIndicator() {
  const [status, setStatus] = useState<LocalAutosaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveCount, setSaveCount] = useState(0);

  useEffect(() => {
    const unsubscribe = localAutosaveService.subscribe((state) => {
      setStatus(state.status);
      setLastSaved(state.lastSavedTime);
      setSaveCount(state.saveCount);
    });

    return unsubscribe;
  }, []);

  const getStatusIcon = () => {
    switch (status) {
      case 'saving':
        return <RotateCw className="w-4 h-4 animate-spin" />;
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
      case 'saving':
        return 'Saving...';
      case 'saved':
        return 'Saved';
      case 'error':
        return 'Save failed';
      default:
        return 'Idle';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'saving':
        return 'text-blue-500';
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
      {lastSaved && (
        <span className="text-xs opacity-70">
          {saveCount > 0 && `#${saveCount} • `}
          {lastSaved.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
