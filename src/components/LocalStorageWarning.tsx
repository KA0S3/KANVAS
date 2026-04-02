import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface LocalStorageWarningProps {
  onOpenAccountModal: () => void;
}

export function LocalStorageWarning({ onOpenAccountModal }: LocalStorageWarningProps) {
  const { isAuthenticated } = useAuthStore();

  // Don't show if user is authenticated
  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
      <AlertTriangle className="w-3 h-3 text-slate-500 dark:text-slate-400 flex-shrink-0" />
      <div className="flex flex-col">
        <span className="hidden sm:inline">
          Your projects are stored locally only
        </span>
        <span className="hidden sm:inline">
          Sign in to backup your work to the cloud
        </span>
        <span className="sm:hidden">
          Local storage only. Sign in to backup
        </span>
      </div>
    </div>
  );
}
