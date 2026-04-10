import { describe, it, expect, vi, beforeEach } from 'vitest';
import { documentMutationService } from '@/services/DocumentMutationService';
import { supabase } from '@/lib/supabase';

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  }
}));

// Mock connectivity
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

describe('Large Book Tests - Phase 12', () => {
  const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    documentMutationService['currentProjectId'] = 'large-book-project';
    documentMutationService['currentVersion'] = 1;
    documentMutationService['syncInProgress'] = false;
    mockSupabase.rpc.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('10,000 Assets Scalability', () => {
    it('should handle document with 10,000 assets', async () => {
      // Generate 10,000 asset document structure
      const largeAssets: Record<string, any> = {};
      for (let i = 0; i < 10000; i++) {
        const parentId = i < 100 ? null : `asset-${Math.floor(i / 100)}`;
        largeAssets[`asset-${i}`] = {
          name: `Large Asset ${i}`,
          type: i % 10 === 0 ? 'folder' : 'scene',
          parentId,
          position: { x: i % 100, y: Math.floor(i / 100), width: 200, height: 200, zIndex: 0 },
          isExpanded: true
        };
      }

      mockSupabase.rpc.mockResolvedValue({
        data: [{
          world_document: { assets: largeAssets },
          version: 1,
          cover_config: {},
          updated_at: new Date().toISOString()
        }],
        error: null
      });

      const result = await documentMutationService.loadDocument('large-book-project');

      expect(result.success).toBe(true);
      expect(result.data).toBeTruthy();
      
      // Verify asset count
      const assetCount = Object.keys(result.data!.world_document.assets).length;
      expect(assetCount).toBe(10000);
    });

    it('should query paginated assets from large book', async () => {
      // Mock paginated response
      const mockAssets = Array.from({ length: 100 }, (_, i) => ({
        asset_id: `large-asset-${i}`,
        name: `Large Asset ${i}`,
        type: 'folder',
        parent_asset_id: null,
        x: i * 10,
        y: 0,
        width: 200,
        height: 200,
        z_index: 0,
        is_expanded: true,
        background_config: {},
        viewport_config: {},
        cloud_status: 'synced',
        cloud_path: null,
        next_cursor: i === 99 ? null : `cursor-${i + 1}`,
        has_more: i === 99 ? false : true
      }));

      mockSupabase.rpc.mockResolvedValue({
        data: mockAssets,
        error: null
      });

      const result = await documentMutationService.queryAssetsPaginated(null, null, 100);

      expect(result.assets).toHaveLength(100);
      expect(result.hasMore).toBe(false); // Last page
      expect(result.nextCursor).toBeNull();
    });

    it('should handle tree query for deeply nested structure', async () => {
      // Mock tree with depth up to 10 levels
      const mockTree = Array.from({ length: 1000 }, (_, i) => {
        const depth = Math.min(Math.floor(i / 100), 10);
        const parentIndex = i > 0 ? i - 1 : null;
        return {
          asset_id: `tree-${i}`,
          parent_asset_id: parentIndex !== null ? `tree-${parentIndex}` : null,
          name: `Tree Node ${i}`,
          type: 'folder',
          depth,
          path: `root${Array.from({ length: depth }, (_, d) => `.node-${d}`).join('')}`,
          has_children: i < 900
        };
      });

      mockSupabase.rpc.mockResolvedValue({
        data: mockTree,
        error: null
      });

      const result = await documentMutationService.queryAssetTree(null, 10);

      expect(result.success).toBe(true);
      expect(result.tree).toHaveLength(1000);
      
      // Verify depth levels
      const maxDepth = Math.max(...result.tree!.map(n => n.depth));
      expect(maxDepth).toBeGreaterThan(0);
    });

    it('should load document viewport for partial loading', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: [{
          world_document: {
            assets: {
              'visible-1': { name: 'Visible Asset 1' },
              'visible-2': { name: 'Visible Asset 2' }
            }
          },
          version: 1,
          cover_config: {},
          updated_at: new Date().toISOString(),
          partial_load: true,
          total_assets: 10000,
          loaded_assets: 100
        }],
        error: null
      });

      const result = await documentMutationService.loadDocumentViewport({
        x: 0,
        y: 0,
        width: 1920,
        height: 1080
      });

      expect(result.success).toBe(true);
      expect(result.partial).toBe(true);
      expect(result.totalAssets).toBe(10000);
      expect(result.loadedAssets).toBe(100);
    });

    it('should get document manifest for segmented loading', async () => {
      const mockManifest = Array.from({ length: 10 }, (_, i) => ({
        chunk_index: i,
        chunk_size: 1000,
        asset_ids: Array.from({ length: 1000 }, (_, j) => `asset-${i * 1000 + j}`),
        total_chunks: 10,
        total_assets: 10000,
        document_size_bytes: 4500000
      }));

      mockSupabase.rpc.mockResolvedValue({
        data: mockManifest,
        error: null
      });

      const result = await documentMutationService.getDocumentManifest(1000);

      expect(result.success).toBe(true);
      expect(result.manifest!.chunks).toHaveLength(10);
      expect(result.manifest!.totalAssets).toBe(10000);
    });

    it('should load asset chunks for on-demand loading', async () => {
      const assetIds = Array.from({ length: 100 }, (_, i) => `chunk-asset-${i}`);
      
      const mockChunk = assetIds.map(id => ({
        asset_id: id,
        asset_data: {
          name: `Chunk Asset ${id}`,
          type: 'scene',
          position: { x: 0, y: 0 }
        }
      }));

      mockSupabase.rpc.mockResolvedValue({
        data: mockChunk,
        error: null
      });

      const result = await documentMutationService.loadAssetChunk(assetIds);

      expect(result.success).toBe(true);
      expect(Object.keys(result.assets!)).toHaveLength(100);
    });
  });

  describe('5MB Document Boundary', () => {
    it('should handle documents near 5MB size limit', async () => {
      // Create large content to approach 5MB
      const largeContent = 'x'.repeat(4 * 1024 * 1024); // ~4MB of data
      
      const largeDocument = {
        assets: {
          'large-asset': {
            name: 'Large Content Asset',
            type: 'folder',
            largeContent // Make document large
          }
        }
      };

      // Calculate approximate size
      const docString = JSON.stringify(largeDocument);
      const sizeInBytes = new Blob([docString]).size;

      // Should be under 5MB
      expect(sizeInBytes).toBeLessThan(5 * 1024 * 1024);

      mockSupabase.rpc.mockResolvedValue({
        data: [{
          world_document: largeDocument,
          version: 1,
          cover_config: {},
          updated_at: new Date().toISOString()
        }],
        error: null
      });

      const result = await documentMutationService.loadDocument('large-book-project');

      expect(result.success).toBe(true);
    });

    it('should get large book metrics', async () => {
      const mockMetrics = [
        { metric_name: 'asset_count', metric_value: '10000', warning_level: 'ok' },
        { metric_name: 'document_size', metric_value: '4.8 MB', warning_level: 'warning' },
        { metric_name: 'index_row_count', metric_value: '10000', warning_level: 'ok' },
        { metric_name: 'avg_rpc_time', metric_value: '150ms', warning_level: 'ok' },
        { metric_name: 'largest_asset', metric_value: '2.1 MB', warning_level: 'critical' }
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: mockMetrics,
        error: null
      });

      const result = await documentMutationService.getLargeBookMetrics();

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(Object.keys(result.metrics!)).toContain('asset_count');
    });

    it('should recommend segmented load for large books', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: [
          { metric_name: 'asset_count', metric_value: '15000', warning_level: 'warning' },
          { metric_name: 'document_size', metric_value: '4.5 MB', warning_level: 'warning' },
          { metric_name: 'recommended_strategy', metric_value: 'segmented_load', warning_level: 'ok' }
        ],
        error: null
      });

      const result = await documentMutationService.getLargeBookMetrics();

      // Should recommend segmented loading for large books
      expect(result.recommendedStrategy).toBe('segmented_load');
    });

    it('should recommend full load for small books', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: [
          { metric_name: 'asset_count', metric_value: '500', warning_level: 'ok' },
          { metric_name: 'document_size', metric_value: '500 KB', warning_level: 'ok' },
          { metric_name: 'recommended_strategy', metric_value: 'full_load', warning_level: 'ok' }
        ],
        error: null
      });

      const result = await documentMutationService.getLargeBookMetrics();

      expect(result.recommendedStrategy).toBe('full_load');
    });
  });

  describe('Chunked Operations on Large Books', () => {
    it('should queue operations on server for large batch processing', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: 'queue-id-12345',
        error: null
      });

      const result = await documentMutationService.queueServerOperation(
        'BULK_CREATE_ASSETS',
        { count: 1000, type: 'folder' },
        8 // High priority
      );

      expect(result.success).toBe(true);
      expect(result.queueId).toBe('queue-id-12345');
    });

    it('should get queued operations status', async () => {
      const mockQueue = [
        {
          queue_id: 'queue-1',
          operation_type: 'BULK_CREATE',
          status: 'completed',
          priority: 5,
          created_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          retry_count: 0
        },
        {
          queue_id: 'queue-2',
          operation_type: 'REBUILD_INDEX',
          status: 'processing',
          priority: 8,
          created_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          retry_count: 1
        }
      ];

      mockSupabase.rpc.mockResolvedValue({
        data: mockQueue,
        error: null
      });

      const result = await documentMutationService.getQueuedOperations('large-book-project', 50);

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(2);
      expect(result.operations![0].status).toBe('completed');
    });
  });

  describe('Memory and Performance', () => {
    it('should not load all 10000 assets into memory at once', async () => {
      // Mock partial load response
      mockSupabase.rpc.mockResolvedValue({
        data: [{
          world_document: {
            assets: {
              // Only return 100 assets despite 10000 existing
              'partial-1': { name: 'Partial 1' }
            }
          },
          version: 1,
          cover_config: {},
          updated_at: new Date().toISOString(),
          partial_load: true,
          total_assets: 10000,
          loaded_assets: 100
        }],
        error: null
      });

      const result = await documentMutationService.loadDocumentViewport({
        x: 0, y: 0, width: 1000, height: 1000
      }, { rootOnly: true });

      // Should indicate partial load
      expect(result.partial).toBe(true);
      expect(result.totalAssets).toBeGreaterThan(result.loadedAssets!);
    });
  });
});
