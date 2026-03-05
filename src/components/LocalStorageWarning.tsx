import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, Shield } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { Button } from '@/components/ui/button';

interface LocalStorageWarningProps {
  onOpenAccountModal: () => void;
}

export function LocalStorageWarning({ onOpenAccountModal }: LocalStorageWarningProps) {
  const { isAuthenticated } = useAuthStore();
  const { syncEnabled } = useCloudStore();
  const [dismissed, setDismissed] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Load dismissal state from localStorage
  useEffect(() => {
    const savedDismissal = localStorage.getItem('kanvas-localstorage-warning-dismissed');
    if (savedDismissal === 'true') {
      setDismissed(true);
    }
  }, []);

  // Save dismissal state to localStorage
  const handleDismiss = () => {
    if (dontShowAgain) {
      localStorage.setItem('kanvas-localstorage-warning-dismissed', 'true');
    }
    setDismissed(true);
  };

  // Don't show if:
  // 1. Already dismissed
  // 2. User is authenticated AND sync is enabled (cloud backed)
  // 3. Auth is still loading
  if (dismissed || (isAuthenticated && syncEnabled)) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-20 bg-slate-100/70 dark:bg-slate-800/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/40 rounded-lg px-4 py-2.5 shadow-lg max-w-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <AlertTriangle className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Your projects are stored locally only
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Sign in to backup your work to the cloud
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            onClick={onOpenAccountModal}
            className="bg-slate-600/80 hover:bg-slate-700/80 text-white text-xs h-7 px-3 shadow-sm"
          >
            <Shield className="w-3 h-3 mr-1.5" />
            Sign In
          </Button>
          
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-slate-200/50 dark:hover:bg-slate-700/30 rounded transition-colors"
            title="Dismiss warning"
          >
            <X className="w-3 h-3 text-slate-500 dark:text-slate-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
