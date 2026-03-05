/**
 * Client-side Permission Service
 * 
 * This service provides a client-side interface to check user permissions
 * and gate UI elements accordingly.
 */

import React from 'react';
import { supabase } from '@/lib/supabase';

export type Action = 'export_zip' | 'export_json' | 'import_zip' | 'import_json' | 'create_book' | 'bulk_export';

export interface UserPermissions {
  canExportZip: boolean;
  canExportJson: boolean;
  canImportZip: boolean;
  canImportJson: boolean;
  canCreateBook: boolean;
  canBulkExport: boolean;
  planType: string;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  details?: any;
}

class ClientPermissionService {
  private permissions: UserPermissions | null = null;
  private permissionsPromise: Promise<UserPermissions> | null = null;
  private lastFetch = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get current user permissions from cache or fetch from server
   */
  async getPermissions(): Promise<UserPermissions> {
    const now = Date.now();
    
    // Return cached permissions if still valid
    if (this.permissions && (now - this.lastFetch) < this.CACHE_DURATION) {
      return this.permissions;
    }

    // Return existing promise if fetch is in progress
    if (this.permissionsPromise) {
      return this.permissionsPromise;
    }

    // Fetch permissions from server
    this.permissionsPromise = this.fetchPermissions();
    
    try {
      this.permissions = await this.permissionsPromise;
      this.lastFetch = now;
      return this.permissions;
    } finally {
      this.permissionsPromise = null;
    }
  }

  /**
   * Fetch permissions from the server
   */
  private async fetchPermissions(): Promise<UserPermissions> {
    try {
      const { data, error } = await supabase.functions.invoke('user-permissions');
      
      if (error) {
        console.error('Failed to fetch permissions:', error);
        throw error;
      }

      return data as UserPermissions;
    } catch (error) {
      console.error('Error fetching permissions:', error);
      // Return default permissions for safety
      return {
        canExportZip: false,
        canExportJson: false,
        canImportZip: false,
        canImportJson: false,
        canCreateBook: true,
        canBulkExport: false,
        planType: 'guest'
      };
    }
  }

  /**
   * Check if user can perform a specific action
   */
  async canUserPerform(action: Action): Promise<PermissionResult> {
    const permissions = await this.getPermissions();
    
    switch (action) {
      case 'export_zip':
        return {
          allowed: permissions.canExportZip,
          details: { planType: permissions.planType }
        };
        
      case 'export_json':
        return {
          allowed: permissions.canExportJson,
          details: { planType: permissions.planType }
        };
        
      case 'import_zip':
        return {
          allowed: permissions.canImportZip,
          details: { planType: permissions.planType }
        };
        
      case 'import_json':
        return {
          allowed: permissions.canImportJson,
          details: { planType: permissions.planType }
        };
        
      case 'create_book':
        return {
          allowed: permissions.canCreateBook,
          details: { planType: permissions.planType }
        };
        
      case 'bulk_export':
        return {
          allowed: permissions.canBulkExport,
          details: { planType: permissions.planType }
        };
        
      default:
        return {
          allowed: false,
          reason: `Unknown action: ${action}`
        };
    }
  }

  /**
   * Get synchronous permission check (uses cached permissions)
   * Returns false if permissions not cached yet
   */
  canUserPerformSync(action: Action): boolean {
    if (!this.permissions) {
      return false;
    }
    
    switch (action) {
      case 'export_zip':
        return this.permissions.canExportZip;
      case 'export_json':
        return this.permissions.canExportJson;
      case 'import_zip':
        return this.permissions.canImportZip;
      case 'import_json':
        return this.permissions.canImportJson;
      case 'create_book':
        return this.permissions.canCreateBook;
      case 'bulk_export':
        return this.permissions.canBulkExport;
      default:
        return false;
    }
  }

  /**
   * Clear permission cache (useful after plan changes)
   */
  clearCache(): void {
    this.permissions = null;
    this.lastFetch = 0;
  }

  /**
   * Get current plan type
   */
  async getPlanType(): Promise<string> {
    const permissions = await this.getPermissions();
    return permissions.planType;
  }

  /**
   * Check if user is on free plan
   */
  async isFreePlan(): Promise<boolean> {
    const planType = await this.getPlanType();
    return planType === 'free' || planType === 'guest';
  }

  /**
   * Check if user has premium features (pro or lifetime)
   */
  async hasPremiumFeatures(): Promise<boolean> {
    const planType = await this.getPlanType();
    return planType === 'pro' || planType === 'lifetime';
  }

  /**
   * Get upgrade message for specific action
   */
  getUpgradeMessage(action: Action): string {
    switch (action) {
      case 'export_zip':
      case 'export_json':
        return 'Export is available to Pro, Lifetime users, or with storage addon';
      case 'import_zip':
      case 'import_json':
        return 'Import is available to Pro, Lifetime users, or with storage addon';
      case 'bulk_export':
        return 'Bulk export requires Pro or Lifetime plan';
      default:
        return 'This feature requires a premium plan';
    }
  }
}

// Export singleton instance
export const permissionService = new ClientPermissionService();

/**
 * React hook for permissions
 */
export function usePermissions() {
  const [permissions, setPermissions] = React.useState<UserPermissions | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const perms = await permissionService.getPermissions();
      setPermissions(perms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadPermissions();
  }, []);

  const canPerform = (action: Action): boolean => {
    if (!permissions) return false;
    
    switch (action) {
      case 'export_zip':
        return permissions.canExportZip;
      case 'export_json':
        return permissions.canExportJson;
      case 'import_zip':
        return permissions.canImportZip;
      case 'import_json':
        return permissions.canImportJson;
      case 'create_book':
        return permissions.canCreateBook;
      case 'bulk_export':
        return permissions.canBulkExport;
      default:
        return false;
    }
  };

  const refetch = () => {
    permissionService.clearCache();
    return loadPermissions();
  };

  return {
    permissions,
    loading,
    error,
    canPerform,
    refetch,
    isFreePlan: permissions?.planType === 'free' || permissions?.planType === 'guest',
    hasPremiumFeatures: permissions?.planType === 'pro' || permissions?.planType === 'lifetime'
  };
}
