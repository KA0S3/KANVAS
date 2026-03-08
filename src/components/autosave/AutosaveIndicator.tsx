import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { autosaveService, type AutosaveStatus } from '@/services/autosaveService';
import { useAuthStore } from '@/stores/authStore';

interface AutosaveIndicatorProps {
  className?: string;
  compact?: boolean;
}

export function AutosaveIndicator({ className = '', compact = false }: AutosaveIndicatorProps) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) return;

    // Subscribe to autosave service
    const unsubscribe = autosaveService.subscribe((state) => {
      setStatus(state.status);
      setLastSavedTime(state.lastSavedTime);
      setErrorMessage(state.errorMessage);
    });

    // Check online status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isAuthenticated]);

  const handleManualSave = async () => {
    try {
      await autosaveService.triggerManualSave();
    } catch (error) {
      console.error('Manual save failed:', error);
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'saving':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'saved':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    if (!isAuthenticated) return 'Sign in to save';
    
    switch (status) {
      case 'saving':
        return 'Saving...';
      case 'saved':
        return 'Saved';
      case 'error':
        return errorMessage || 'Save failed';
      default:
        return isOnline ? 'Ready' : 'Offline';
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
        return isOnline ? 'text-gray-500' : 'text-gray-400';
    }
  };

  const formatLastSavedTime = () => {
    if (!lastSavedTime) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - lastSavedTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (!isAuthenticated) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <WifiOff className="w-4 h-4 text-gray-400" />
        {!compact && <span className="text-xs text-gray-400">Sign in to save</span>}
      </div>
    );
  }

  if (compact) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleManualSave}
        className={`p-1 h-auto ${className}`}
        title={getStatusText() + (lastSavedTime ? ` (${formatLastSavedTime()})` : '')}
      >
        {getStatusIcon()}
      </Button>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleManualSave}
        className={`flex items-center gap-2 h-auto py-1 px-2 ${getStatusColor()}`}
        disabled={status === 'saving'}
      >
        {getStatusIcon()}
        <span className="text-xs">{getStatusText()}</span>
      </Button>
      
      {lastSavedTime && (
        <span className="text-xs text-muted-foreground" title={`Last saved: ${lastSavedTime.toLocaleString()}`}>
          {formatLastSavedTime()}
        </span>
      )}
      
      {status === 'error' && errorMessage && (
        <div className="text-xs text-red-500 max-w-32 truncate" title={errorMessage}>
          {errorMessage}
        </div>
      )}
    </div>
  );
}
