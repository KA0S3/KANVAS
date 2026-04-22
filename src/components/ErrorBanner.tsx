/**
 * Error Banner Component - Phase 3 Frontend Integration
 * 
 * Displays save errors with retry functionality.
 * Subscribes to save errors via callback.
 */

import { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { setOnErrorCallback, manualSave } from '@/services/changeTrackingService';
import { Button } from '@/components/ui/button';

export function ErrorBanner() {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Subscribe to save errors
    setOnErrorCallback((err) => {
      setError(err);
    });

    // Cleanup: reset error callback on unmount
    return () => {
      setOnErrorCallback(null);
    };
  }, []);

  const handleRetry = async () => {
    try {
      await manualSave();
      setError(null);
    } catch (e) {
      // Error persists, banner stays visible
    }
  };

  const handleDismiss = () => {
    setError(null);
  };

  if (!error) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md">
      <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg shadow-lg flex items-start gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium mb-1">Changes couldn't be saved</p>
          <p className="text-xs text-destructive/80 mb-2">Check your connection and try again.</p>
          {error.message && (
            <p className="text-xs text-destructive/60 truncate">{error.message}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleRetry}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Retry
          </Button>
          <Button
            onClick={handleDismiss}
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
