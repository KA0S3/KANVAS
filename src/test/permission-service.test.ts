import { describe, it, expect, vi, beforeEach } from 'vitest';
import { permissionService } from '../services/permissionService';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn()
    }
  }
}));

describe('PermissionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear cache
    (permissionService as any).permissions = null;
    (permissionService as any).lastFetch = 0;
  });

  it('should fetch permissions from server', async () => {
    const mockPermissions = {
      canExportZip: true,
      canExportJson: true,
      canImportZip: false,
      canImportJson: false,
      canCreateBook: true,
      canBulkExport: false,
      planType: 'pro'
    };

    const { supabase } = await import('@/lib/supabase');
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ 
      data: mockPermissions,
      error: null
    });

    const permissions = await permissionService.getPermissions();
    
    expect(permissions).toEqual(mockPermissions);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('user-permissions');
  });

  it('should cache permissions for 5 minutes', async () => {
    const mockPermissions = {
      canExportZip: true,
      canExportJson: true,
      canImportZip: false,
      canImportJson: false,
      canCreateBook: true,
      canBulkExport: false,
      planType: 'pro'
    };

    const { supabase } = await import('@/lib/supabase');
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ 
      data: mockPermissions,
      error: null
    });

    // First call
    await permissionService.getPermissions();
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);

    // Second call within cache period
    await permissionService.getPermissions();
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  });

  it('should return default permissions on error', async () => {
    const { supabase } = await import('@/lib/supabase');
    vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error('Network error'));

    const permissions = await permissionService.getPermissions();
    
    expect(permissions).toEqual({
      canExportZip: false,
      canExportJson: false,
      canImportZip: false,
      canImportJson: false,
      canCreateBook: true,
      canBulkExport: false,
      planType: 'guest'
    });
  });

  it('should check individual permissions correctly', async () => {
    const mockPermissions = {
      canExportZip: true,
      canExportJson: true,
      canImportZip: false,
      canImportJson: false,
      canCreateBook: true,
      canBulkExport: false,
      planType: 'pro'
    };

    const { supabase } = await import('@/lib/supabase');
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ 
      data: mockPermissions,
      error: null
    });

    const exportZipResult = await permissionService.canUserPerform('export_zip');
    const importZipResult = await permissionService.canUserPerform('import_zip');

    expect(exportZipResult.allowed).toBe(true);
    expect(importZipResult.allowed).toBe(false);
  });

  it('should clear cache when requested', async () => {
    const mockPermissions = {
      canExportZip: true,
      canExportJson: true,
      canImportZip: false,
      canImportJson: false,
      canCreateBook: true,
      canBulkExport: false,
      planType: 'pro'
    };

    const { supabase } = await import('@/lib/supabase');
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ 
      data: mockPermissions,
      error: null
    });

    // First call
    await permissionService.getPermissions();
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);

    // Clear cache
    permissionService.clearCache();

    // Second call after cache clear
    await permissionService.getPermissions();
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
  });

  it('should provide upgrade messages', () => {
    const exportMessage = permissionService.getUpgradeMessage('export_zip');
    const bulkExportMessage = permissionService.getUpgradeMessage('bulk_export');
    const unknownMessage = permissionService.getUpgradeMessage('unknown' as any);

    expect(exportMessage).toBe('Export is available to Pro, Lifetime users, or with storage addon');
    expect(bulkExportMessage).toBe('Bulk export requires Pro or Lifetime plan');
    expect(unknownMessage).toBe('This feature requires a premium plan');
  });
});
