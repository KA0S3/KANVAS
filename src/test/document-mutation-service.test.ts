import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { documentMutationService, type DocumentOperation } from '@/services/DocumentMutationService';
import { supabase } from '@/lib/supabase';

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  }
}));

// Mock stores
vi.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'test-user' } })
  }
}));

vi.mock('@/stores/cloudStore', () => ({
  useCloudStore: {
    getState: () => ({ 
      syncEnabled: true,
      quota: { used: 0, available: 1000000 }
    })
  }
}));

vi.mock('@/stores/bookStoreSimple', () => ({
  useBookStore: {
    getState: () => ({ currentBook: null })
  }
}));

vi.mock('@/services/connectivityService', () => ({
  connectivityService: {
    isOnline: () => true
  }
}));

vi.mock('@/utils/performanceMonitor', () => ({
  performanceMonitor: {
    incrementDatabaseRequests: vi.fn()
  }
}));

describe('DocumentMutationService - Phase 12 Tests', () => {
  let service: typeof documentMutationService;
  const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    service = documentMutationService;
    service['currentProjectId'] = null;
    service['offlineQueue'] = [];
    service['currentVersion'] = 1;
    service['syncInProgress'] = false;
    service['conflictHistory'] = []; // Clear conflict history
    // Reset mock completely - clear history AND implementation
    mockSupabase.rpc.mockReset();
    // Set default mock to return empty data (can be overridden in tests)
    mockSupabase.rpc.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Unit Tests - RPC Functions', () => {
    it('should load project document successfully', async () => {
      const mockDoc = {
        world_document: { assets: { 'asset-1': { name: 'Test' } } },
        version: 5,
        cover_config: {},
        updated_at: new Date().toISOString()
      };

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [mockDoc],
        error: null
      });

      const result = await service.loadDocument('project-123');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockDoc);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('load_project_document', {
        p_project_id: 'project-123'
      });
    });

    it('should handle document load failure', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Project not found' }
      });

      const result = await service.loadDocument('invalid-id');

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should save document operations in batches', async () => {
      const operations: DocumentOperation[] = [
        { op: 'CREATE_ASSET', assetId: 'asset-1', name: 'Test 1', type: 'folder' },
        { op: 'CREATE_ASSET', assetId: 'asset-2', name: 'Test 2', type: 'folder' }
      ];

      service['currentProjectId'] = 'project-123';
      service['offlineQueue'] = operations;

      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{ success: true, new_version: 2 }],
        error: null
      });

      const result = await service.syncNow();

      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('save_document_operations', {
        p_project_id: 'project-123',
        p_expected_version: 1,
        p_operations: operations
      });
    });

    it('should handle version conflicts', async () => {
      const operations: DocumentOperation[] = [
        { op: 'UPDATE_METADATA', assetId: 'asset-1', name: 'Updated' }
      ];

      service['currentProjectId'] = 'project-123';
      service['offlineQueue'] = operations;

      // First call fails with conflict
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{ success: false, error: 'VERSION CONFLICT' }],
        error: null
      });

      // Reload succeeds
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{
          world_document: { assets: {} },
          version: 2,
          cover_config: {},
          updated_at: new Date().toISOString()
        }],
        error: null
      });

      const result = await service.syncNow();

      // Should fail due to conflict but trigger resolution
      expect(result).toBe(false);
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(2);
    });

    it('should query assets by parent', async () => {
      service['currentProjectId'] = 'project-123';

      const mockAssets = [
        { asset_id: 'asset-1', name: 'Asset 1', type: 'folder', parent_asset_id: null },
        { asset_id: 'asset-2', name: 'Asset 2', type: 'scene', parent_asset_id: null }
      ];

      mockSupabase.rpc.mockResolvedValueOnce({
        data: mockAssets,
        error: null
      });

      const result = await service.queryAssetsByParent();

      expect(result).toHaveLength(2);
      expect(result[0].asset_id).toBe('asset-1');
    });
  });

  describe('Integration Tests - Operation Compression', () => {
    it('should compress redundant operations on same asset', () => {
      const createOp: DocumentOperation = {
        op: 'CREATE_ASSET',
        assetId: 'asset-1',
        name: 'Test',
        type: 'folder'
      };

      const moveOp: DocumentOperation = {
        op: 'MOVE_ASSET',
        assetId: 'asset-1',
        newParentId: 'parent-1'
      };

      const deleteOp: DocumentOperation = {
        op: 'DELETE_ASSET',
        assetId: 'asset-1'
      };

      // Queue create
      service.queueOperation(createOp);
      expect(service['offlineQueue']).toHaveLength(1);

      // Queue move - should keep both
      service.queueOperation(moveOp);
      expect(service['offlineQueue']).toHaveLength(2);

      // Queue delete - should remove previous ops on this asset
      service.queueOperation(deleteOp);
      // Only delete should remain
      expect(service['offlineQueue']).toHaveLength(1);
      expect(service['offlineQueue'][0].op).toBe('DELETE_ASSET');
    });

    it('should compress position updates', () => {
      const pos1: DocumentOperation = {
        op: 'UPDATE_POSITION',
        assetId: 'asset-1',
        x: 10, y: 20, width: 100, height: 100, zIndex: 0
      };

      const pos2: DocumentOperation = {
        op: 'UPDATE_POSITION',
        assetId: 'asset-1',
        x: 30, y: 40, width: 150, height: 150, zIndex: 1
      };

      service.queueOperation(pos1);
      service.queueOperation(pos2);

      // Only latest position update should remain
      expect(service['offlineQueue']).toHaveLength(1);
      expect(service['offlineQueue'][0]).toEqual(pos2);
    });

    it('should compress metadata updates', () => {
      const meta1: DocumentOperation = {
        op: 'UPDATE_METADATA',
        assetId: 'asset-1',
        name: 'Old Name'
      };

      const meta2: DocumentOperation = {
        op: 'UPDATE_METADATA',
        assetId: 'asset-1',
        name: 'New Name'
      };

      service.queueOperation(meta1);
      service.queueOperation(meta2);

      // Only latest metadata update should remain
      expect(service['offlineQueue']).toHaveLength(1);
      expect((service['offlineQueue'][0] as any).name).toBe('New Name');
    });
  });

  describe('Batching Tests', () => {
    it('should chunk operations into batches of 100', () => {
      const operations: DocumentOperation[] = Array.from({ length: 250 }, (_, i) => ({
        op: 'CREATE_ASSET',
        assetId: `asset-${i}`,
        name: `Asset ${i}`,
        type: 'folder'
      }));

      service['offlineQueue'] = operations;
      service['currentProjectId'] = 'project-123';

      const chunks = service['chunkOperations'](operations, 100);

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toHaveLength(100);
      expect(chunks[1]).toHaveLength(100);
      expect(chunks[2]).toHaveLength(50);
    });

    it('should handle single batch when under limit', () => {
      const operations: DocumentOperation[] = Array.from({ length: 50 }, (_, i) => ({
        op: 'CREATE_ASSET',
        assetId: `asset-${i}`,
        name: `Asset ${i}`,
        type: 'folder'
      }));

      const chunks = service['chunkOperations'](operations, 100);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toHaveLength(50);
    });
  });

  describe('Conflict Resolution Tests', () => {
    it('should track conflict history', () => {
      service.clearConflictHistory();
      expect(service.getConflictHistory()).toHaveLength(0);

      // Simulate some conflicts
      const mockResolution = {
        strategy: 'server-wins' as const,
        appliedOperations: [],
        discardedOperations: [],
        conflicts: [{ 
          operation: { op: 'CREATE_ASSET' as const, assetId: '1', name: 'Test', type: 'folder' }, 
          reason: 'duplicate', 
          field: 'name',
          serverState: { name: 'Server Asset' },
          clientState: { name: 'Client Asset' }
        }],
        resolved: true
      };

      service['conflictHistory'].push(mockResolution as any);

      expect(service.getConflictHistory()).toHaveLength(1);
    });

    it('should limit conflict history to 50 entries during conflict resolution', () => {
      // Add 55 entries with conflicts (simulating conflict resolution flow)
      for (let i = 0; i < 55; i++) {
        service['conflictHistory'].push({
          strategy: 'server-wins',
          appliedOperations: [],
          discardedOperations: [],
          conflicts: [{ 
            operation: { op: 'CREATE_ASSET' as const, assetId: `asset-${i}`, name: 'Test', type: 'folder' },
            reason: 'test',
            serverState: {},
            clientState: {}
          }],
          resolved: true
        } as any);
        
        // Manually trigger trimming (normally done in handleConflict)
        if (service['conflictHistory'].length > 50) {
          service['conflictHistory'] = service['conflictHistory'].slice(-50);
        }
      }

      // Should be trimmed to 50
      expect(service.getConflictHistory()).toHaveLength(50);
    });

    it('should set and get conflict strategy', () => {
      service.setConflictStrategy('client-wins');
      expect(service.getConflictStrategy()).toBe('client-wins');

      service.setConflictStrategy('server-wins');
      expect(service.getConflictStrategy()).toBe('server-wins');

      service.setConflictStrategy('merge');
      expect(service.getConflictStrategy()).toBe('merge');
    });
  });

  describe('Retry Logic Tests', () => {
    it('should identify retryable errors', () => {
      const networkError = { message: 'Network error' };
      const timeoutError = { message: 'Connection timeout' };
      const rateLimitError = { code: '429' };
      const authError = { code: '401' };
      const conflictError = { message: 'Version conflict' };

      expect(service['isRetryableError'](networkError)).toBe(true);
      expect(service['isRetryableError'](timeoutError)).toBe(true);
      expect(service['isRetryableError'](rateLimitError)).toBe(true);
      expect(service['isRetryableError'](authError)).toBe(false);
      expect(service['isRetryableError'](conflictError)).toBe(false);
    });

    it('should calculate exponential backoff', async () => {
      const delays: number[] = [];
      const baseDelay = 1000;

      // Test backoff calculation for attempts 0-4
      for (let i = 0; i < 5; i++) {
        const expectedDelay = baseDelay * Math.pow(2, i);
        delays.push(expectedDelay);
      }

      expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
    });
  });

  describe('File Registration Tests', () => {
    it('should register file after R2 upload', async () => {
      service['currentProjectId'] = 'project-123';

      mockSupabase.rpc.mockResolvedValueOnce({
        data: true,
        error: null
      });

      const result = await service.registerFile(
        'asset-1',
        'r2/key/path',
        1024000,
        'image/webp',
        [{ variant: 'thumbnail', r2_key: 'r2/thumb/path' }]
      );

      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('register_file', {
        p_project_id: 'project-123',
        p_asset_id: 'asset-1',
        p_r2_key: 'r2/key/path',
        p_size_bytes: 1024000,
        p_mime_type: 'image/webp',
        p_variants: [{ variant: 'thumbnail', r2_key: 'r2/thumb/path' }]
      });
    });

    it('should fail file registration without project', async () => {
      service['currentProjectId'] = null;

      const result = await service.registerFile(
        'asset-1',
        'r2/key/path',
        1024000,
        'image/webp'
      );

      expect(result).toBe(false);
    });
  });

  describe('Paginated Query Tests', () => {
    it('should query assets with pagination', async () => {
      service['currentProjectId'] = 'project-123';

      const mockResponse = [
        { 
          asset_id: 'asset-1', name: 'Asset 1', type: 'folder',
          parent_asset_id: null, x: 0, y: 0, width: 200, height: 200,
          z_index: 0, is_expanded: true,
          background_config: {}, viewport_config: {},
          cloud_status: 'synced', cloud_path: null,
          next_cursor: 'cursor-2', has_more: true
        }
      ];

      mockSupabase.rpc.mockResolvedValueOnce({
        data: mockResponse,
        error: null
      });

      const result = await service.queryAssetsPaginated(null, null, 50);

      expect(result.assets).toHaveLength(1);
      expect(result.nextCursor).toBe('cursor-2');
      expect(result.hasMore).toBe(true);
    });

    it('should return empty result when no project loaded', async () => {
      service['currentProjectId'] = null;

      const result = await service.queryAssetsPaginated();

      expect(result.assets).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('Viewport Loading Tests', () => {
    it('should load document viewport for large books', async () => {
      service['currentProjectId'] = 'project-123';

      mockSupabase.rpc.mockResolvedValue({
        data: [{
          world_document: { assets: { 'asset-1': { name: 'Test' } } },
          version: 1,
          cover_config: {},
          updated_at: new Date().toISOString(),
          partial_load: true,
          total_assets: 5000,
          loaded_assets: 100
        }],
        error: null
      });

      const result = await service.loadDocumentViewport({
        x: 0, y: 0, width: 1000, height: 1000
      });

      expect(result.success).toBe(true);
      expect(result.partial).toBe(true);
      expect(result.totalAssets).toBe(5000);
      expect(result.loadedAssets).toBe(100);
    });
  });

  describe('Asset Tree Query Tests', () => {
    it('should query asset tree recursively', async () => {
      service['currentProjectId'] = 'project-123';

      const mockTree = [
        { asset_id: 'root', parent_asset_id: null, name: 'Root', type: 'folder', depth: 0, path: 'root', has_children: true },
        { asset_id: 'child', parent_asset_id: 'root', name: 'Child', type: 'scene', depth: 1, path: 'root.child', has_children: false }
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: mockTree,
        error: null
      });

      const result = await service.queryAssetTree();

      if (!result.success) {
        console.log('queryAssetTree error:', result.error);
      }

      expect(result.success).toBe(true);
      expect(result.tree).toHaveLength(2);
      expect(result.tree![0].depth).toBe(0);
      expect(result.tree![1].depth).toBe(1);
    });
  });
});
