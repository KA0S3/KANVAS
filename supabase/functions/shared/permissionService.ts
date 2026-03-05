/**
 * Centralized Permission Service
 * 
 * This service provides a single source of truth for all permission checks
 * across the application, eliminating duplicated permission logic.
 */

import { authenticateAndTranslatePlan, type AuthenticatedUser } from './authMiddleware.ts';
import { getPlanConfig } from './plans.ts';

export type Action = 'export_zip' | 'export_json' | 'import_zip' | 'import_json' | 'create_book' | 'bulk_export';

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  details?: any;
}

export interface PermissionContext {
  userId: string;
  resourceId?: string;
  resourceType?: string;
}

/**
 * Centralized permission service
 */
class PermissionService {
  /**
   * Check if a user can perform a specific action
   */
  async canUserPerform(
    supabase: any,
    authHeader: string | null,
    action: Action,
    context?: PermissionContext
  ): Promise<PermissionResult> {
    try {
      // Authenticate user and get effective limits
      const userInfo = await authenticateAndTranslatePlan(supabase, authHeader, `permission:${action}`);
      
      if (!userInfo) {
        return {
          allowed: false,
          reason: 'Authentication failed',
          details: { action }
        };
      }

      // Check permissions based on action
      switch (action) {
        case 'export_zip':
        case 'export_json':
          return this.checkExportPermission(userInfo);
          
        case 'import_zip':
        case 'import_json':
          return this.checkImportPermission(userInfo);
          
        case 'create_book':
          return this.checkCreateBookPermission(userInfo, context);
          
        case 'bulk_export':
          return this.checkBulkExportPermission(userInfo);
          
        default:
          return {
            allowed: false,
            reason: `Unknown action: ${action}`,
            details: { action }
          };
      }
    } catch (error) {
      console.error(`[PermissionService] Error checking permission for ${action}:`, error);
      return {
        allowed: false,
        reason: 'Internal permission check error',
        details: { action, error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Check export permissions (ZIP and JSON)
   */
  private checkExportPermission(userInfo: AuthenticatedUser): PermissionResult {
    const { canonical_plan_id, effective_limits } = userInfo;
    
    if (!effective_limits.importExportEnabled) {
      return {
        allowed: false,
        reason: 'Export not available on your plan',
        details: {
          plan_type: canonical_plan_id,
          can_export: false,
          message: 'Export is available to Pro, Lifetime users, or with storage addon'
        }
      };
    }

    return {
      allowed: true,
      details: {
        plan_type: canonical_plan_id,
        can_export: true
      }
    };
  }

  /**
   * Check import permissions (ZIP and JSON)
   */
  private checkImportPermission(userInfo: AuthenticatedUser): PermissionResult {
    const { canonical_plan_id, effective_limits } = userInfo;
    
    if (!effective_limits.importExportEnabled) {
      return {
        allowed: false,
        reason: 'Import not available on your plan',
        details: {
          plan_type: canonical_plan_id,
          can_import: false,
          message: 'Import is available to Pro, Lifetime users, or with storage addon'
        }
      };
    }

    return {
      allowed: true,
      details: {
        plan_type: canonical_plan_id,
        can_import: true
      }
    };
  }

  /**
   * Check book creation permissions
   */
  private checkCreateBookPermission(userInfo: AuthenticatedUser, context?: PermissionContext): PermissionResult {
    const { canonical_plan_id, effective_limits } = userInfo;
    
    // For now, all plans can create books within their limits
    // The actual book count limit should be enforced at the business logic layer
    return {
      allowed: true,
      details: {
        plan_type: canonical_plan_id,
        max_books: effective_limits.maxBooks
      }
    };
  }

  /**
   * Check bulk export permissions
   */
  private checkBulkExportPermission(userInfo: AuthenticatedUser): PermissionResult {
    const { canonical_plan_id, effective_limits } = userInfo;
    
    // First check if they have basic export permissions
    const exportPermission = this.checkExportPermission(userInfo);
    if (!exportPermission.allowed) {
      return exportPermission;
    }

    // Bulk export requires Pro or Lifetime plan
    if (canonical_plan_id === 'free') {
      return {
        allowed: false,
        reason: 'Bulk export not available on free plan',
        details: {
          plan_type: canonical_plan_id,
          message: 'Bulk export requires Pro or Lifetime plan'
        }
      };
    }

    return {
      allowed: true,
      details: {
        plan_type: canonical_plan_id,
        can_bulk_export: true
      }
    };
  }

  /**
   * Get user permissions for UI display purposes
   */
  async getUserPermissions(
    supabase: any,
    authHeader: string | null
  ): Promise<{
    canExportZip: boolean;
    canExportJson: boolean;
    canImportZip: boolean;
    canImportJson: boolean;
    canCreateBook: boolean;
    canBulkExport: boolean;
    planType: string;
  }> {
    const actions: Action[] = ['export_zip', 'export_json', 'import_zip', 'import_json', 'create_book', 'bulk_export'];
    const results = await Promise.all(
      actions.map(action => this.canUserPerform(supabase, authHeader, action))
    );

    // Get plan info
    const userInfo = await authenticateAndTranslatePlan(supabase, authHeader, 'ui_permissions');
    const planType = userInfo?.canonical_plan_id || 'guest';

    return {
      canExportZip: results[0].allowed,
      canExportJson: results[1].allowed,
      canImportZip: results[2].allowed,
      canImportJson: results[3].allowed,
      canCreateBook: results[4].allowed,
      canBulkExport: results[5].allowed,
      planType
    };
  }
}

// Export singleton instance
export const permissionService = new PermissionService();

/**
 * Helper function to wrap existing functions with permission checks
 */
export function withPermissionCheck<T extends any[], R>(
  permissionService: PermissionService,
  supabase: any,
  action: Action,
  contextFn?: (...args: T) => PermissionContext | undefined
) {
  return function(
    originalFunction: (...args: T) => Promise<R>,
    authHeader: string | null
  ): ((...args: T) => Promise<R>) {
    return async (...args: T): Promise<R> => {
      const context = contextFn ? contextFn(...args) : undefined;
      const permission = await permissionService.canUserPerform(supabase, authHeader, action, context);
      
      if (!permission.allowed) {
        const error = new Error(permission.reason || 'Permission denied');
        (error as any).status = 403;
        (error as any).details = permission.details;
        throw error;
      }
      
      return originalFunction(...args);
    };
  };
}
