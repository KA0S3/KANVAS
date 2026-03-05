import React from 'react';
import { AlertTriangle, X, Cloud } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';

interface QuotaWarningBarProps {
  onClose?: () => void;
}

export function QuotaWarningBar({ onClose }: QuotaWarningBarProps) {
  const { effectiveLimits } = useAuthStore();
  const { quota } = useCloudStore();

  if (!effectiveLimits?.quotaBytes || !quota) {
    return null;
  }

  const usagePercentage = (quota.used / effectiveLimits.quotaBytes) * 100;
  
  // Only show at 80% or above
  if (usagePercentage < 80) {
    return null;
  }

  const isOverQuota = usagePercentage >= 100;
  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getWarningMessage = () => {
    if (isOverQuota) {
      return "You've exceeded your storage quota—upgrade to continue uploading.";
    }
    return "You're at 80% of your backup quota—consider upgrading.";
  };

  const getProgressColor = () => {
    if (isOverQuota) return 'bg-destructive';
    if (usagePercentage >= 90) return 'bg-orange-500';
    return 'bg-amber-500';
  };

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 ${
      isOverQuota ? 'bg-destructive/10 border-destructive/20' : 'bg-amber-50 border-amber-200'
    } border-b p-3`}>
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <div className={`p-1.5 rounded-full ${
          isOverQuota ? 'bg-destructive/20 text-destructive' : 'bg-amber-200 text-amber-700'
        }`}>
          {isOverQuota ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <Cloud className="w-4 h-4" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${
            isOverQuota ? 'text-destructive' : 'text-amber-800'
          }`}>
            {getWarningMessage()}
          </p>
          
          {/* Progress bar */}
          <div className="mt-2 w-full bg-background rounded-full h-1.5">
            <div 
              className={`h-1.5 rounded-full transition-all duration-300 ${getProgressColor()}`}
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
            />
          </div>
          
          <p className="text-xs text-muted-foreground mt-1">
            {formatBytes(quota.used)} / {formatBytes(effectiveLimits.quotaBytes)} used
          </p>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-black/5 rounded transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}
