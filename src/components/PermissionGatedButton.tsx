import React from 'react';
import { permissionService, type Action } from '@/services/permissionService';

interface PermissionGatedButtonProps {
  action: Action;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  fallback?: React.ReactNode;
  showUpgradeMessage?: boolean;
}

/**
 * A button component that is automatically gated by user permissions
 */
export function PermissionGatedButton({
  action,
  children,
  className = '',
  disabled = false,
  onClick,
  fallback,
  showUpgradeMessage = true
}: PermissionGatedButtonProps) {
  const [allowed, setAllowed] = React.useState<boolean | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [reason, setReason] = React.useState<string>('');

  React.useEffect(() => {
    const checkPermission = async () => {
      try {
        setLoading(true);
        const result = await permissionService.canUserPerform(action);
        setAllowed(result.allowed);
        setReason(result.reason || '');
      } catch (error) {
        console.error('Permission check failed:', error);
        setAllowed(false);
        setReason('Permission check failed');
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [action]);

  if (loading) {
    return (
      <button className={`${className} opacity-50 cursor-not-allowed`} disabled>
        Checking permissions...
      </button>
    );
  }

  if (!allowed) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="relative">
        <button
          className={`${className} opacity-50 cursor-not-allowed`}
          disabled
          title={showUpgradeMessage ? reason : undefined}
        >
          {children}
        </button>
        {showUpgradeMessage && reason && (
          <div className="absolute top-full mt-1 text-xs text-muted-foreground whitespace-nowrap">
            {reason}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface PermissionGatedFeatureProps {
  action: Action;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * A wrapper component that conditionally renders children based on permissions
 */
export function PermissionGatedFeature({
  action,
  children,
  fallback
}: PermissionGatedFeatureProps) {
  const [allowed, setAllowed] = React.useState<boolean | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const checkPermission = async () => {
      try {
        setLoading(true);
        const result = await permissionService.canUserPerform(action);
        setAllowed(result.allowed);
      } catch (error) {
        console.error('Permission check failed:', error);
        setAllowed(false);
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [action]);

  if (loading) {
    return <div className="animate-pulse">Loading...</div>;
  }

  if (!allowed) {
    return <>{fallback || null}</>;
  }

  return <>{children}</>;
}
