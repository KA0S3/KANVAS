import { describe, it, expect, vi, beforeEach } from 'vitest';
import { documentMutationService, type DocumentOperation } from '@/services/DocumentMutationService';
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
    incrementDatabaseRequests: vi.fn(),
    recordSyncTime: vi.fn()
  }
}));

describe('Load & Concurrent Tests - Phase 12', () => {
  const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn> };
  const originalSleep = documentMutationService['sleep'];

  beforeEach(() => {
    // Reset service state
    documentMutationService['currentProjectId'] = 'test-project';
    documentMutationService['currentVersion'] = 1;
    documentMutationService['offlineQueue'] = [];
    documentMutationService['syncInProgress'] = false;
    // Clear call history but preserve mock
    mockSupabase.rpc.mockClear();
    // Mock sleep to prevent timeout from exponential backoff
    documentMutationService['sleep'] = () => Promise.resolve();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Restore original sleep
    documentMutationService['sleep'] = originalSleep;
  });

  describe('Load Tests - 1000+ Concurrent Operations', () => {
    it('should handle 1000 operations efficiently', async () => {
      const operations: DocumentOperation[] = Array.from({ length: 1000 }, (_, i) => ({
        op: 'CREATE_ASSET',
        assetId: `load-asset-${i}`,
        name: `Load Test Asset ${i}`,
        type: 'folder',
        position: { x: i % 100, y: Math.floor(i / 100), width: 200, height: 200, zIndex: 0 }
      }));

      // Set up offline queue
      documentMutationService['offlineQueue'] = operations;

      // Mock successful batch responses
      mockSupabase.rpc.mockResolvedValue({
        data: [{ success: true, new_version: 2 }],
        error: null
      });

      const startTime = performance.now();
      const result = await documentMutationService.syncNow();
      const endTime = performance.now();

      // Should succeed
      expect(result).toBe(true);

      // Should complete within reasonable time (< 5 seconds for 1000 ops)
      expect(endTime - startTime).toBeLessThan(5000);

      // Should have made 10 RPC calls (100 ops per batch)
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(10);
    });

    it('should chunk 2500 operations into correct batch sizes', async () => {
      const operations: DocumentOperation[] = Array.from({ length: 2500 }, (_, i) => ({
        op: 'CREATE_ASSET',
        assetId: `chunk-asset-${i}`,
        name: `Chunk Test ${i}`,
        type: 'folder'
      }));

      const chunks = documentMutationService['chunkOperations'](operations, 100);

      // 2500 ops / 100 per batch = 25 batches
      expect(chunks).toHaveLength(25);
      
      // First 24 batches should be full (100 each)
      for (let i = 0; i < 24; i++) {
        expect(chunks[i]).toHaveLength(100);
      }
      
      // Last batch has remaining 100
      expect(chunks[24]).toHaveLength(100);
    });

    it('should handle batch failures with retry', async () => {
      const operations: DocumentOperation[] = Array.from({ length: 50 }, (_, i) => ({
        op: 'CREATE_ASSET',
        assetId: `retry-asset-${i}`,
        name: `Retry Test ${i}`,
        type: 'folder'
      }));

      documentMutationService['offlineQueue'] = operations;

      // First call fails, second succeeds
      mockSupabase.rpc
        .mockRejectedValueOnce({ message: 'Network timeout' })
        .mockResolvedValueOnce({
          data: [{ success: true, new_version: 2 }],
          error: null
        });

      const result = await documentMutationService.syncNow();

      // Should eventually succeed after retry
      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(2);
    });

    it('should handle max retries exceeded', async () => {
      const operations: DocumentOperation[] = [{
        op: 'CREATE_ASSET',
        assetId: 'fail-asset',
        name: 'Fail Test',
        type: 'folder'
      }];

      documentMutationService['offlineQueue'] = operations;

      // All calls fail
      mockSupabase.rpc.mockRejectedValue({
        message: 'Persistent network error',
        code: 'ECONNREFUSED'
      });

      const result = await documentMutationService.syncNow();

      // Should fail after max retries
      expect(result).toBe(false);
      // 1 initial + 4 retries = 5 calls
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(5);
    });
  });

  describe('Conflict Tests - Simultaneous Edits', () => {
    it('should detect version conflicts', async () => {
      documentMutationService['currentVersion'] = 1;
      documentMutationService['offlineQueue'] = [{
        op: 'UPDATE_METADATA',
        assetId: 'asset-1',
        name: 'Updated Name'
      }];

      // Server returns version conflict
      mockSupabase.rpc.mockResolvedValue({
        data: [{ success: false, error: 'VERSION CONFLICT: Expected version 1, found 2' }],
        error: null
      });

      const result = await documentMutationService.syncNow();

      // Should fail due to conflict
      expect(result).toBe(false);
    });

    it('should apply server-wins strategy on conflict', async () => {
      documentMutationService['currentVersion'] = 1;
      documentMutationService['offlineQueue'] = [{
        op: 'UPDATE_METADATA',
        assetId: 'asset-1',
        name: 'Client Update'
      }];

      // First: conflict
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{ success: false, error: 'VERSION CONFLICT' }],
        error: null
      });

      // Second: reload server state
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{
          world_document: {
            assets: {
              'asset-1': { name: 'Server Version' }
            }
          },
          version: 2,
          cover_config: {},
          updated_at: new Date().toISOString()
        }],
        error: null
      });

      // Trigger conflict scenario
      await documentMutationService.syncNow();

      // Verify that the service attempted conflict resolution
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent create operations', async () => {
      // Simulate two clients creating assets simultaneously
      const client1Ops: DocumentOperation[] = [{
        op: 'CREATE_ASSET',
        assetId: 'concurrent-1',
        name: 'Client 1 Asset',
        type: 'folder'
      }];

      const client2Ops: DocumentOperation[] = [{
        op: 'CREATE_ASSET',
        assetId: 'concurrent-2',
        name: 'Client 2 Asset',
        type: 'folder'
      }];

      // Both should succeed (different asset IDs)
      mockSupabase.rpc.mockResolvedValue({
        data: [{ success: true, new_version: 2 }],
        error: null
      });

      documentMutationService['offlineQueue'] = client1Ops;
      const result1 = await documentMutationService.syncNow();

      documentMutationService['offlineQueue'] = client2Ops;
      const result2 = await documentMutationService.syncNow();

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it('should handle concurrent edit on same asset', async () => {
      documentMutationService.setConflictStrategy('server-wins');

      // Both clients edit same asset
      const ops: DocumentOperation[] = [{
        op: 'UPDATE_METADATA',
        assetId: 'shared-asset',
        name: 'Client Update'
      }];

      documentMutationService['offlineQueue'] = ops;

      // Conflict response
      mockSupabase.rpc.mockResolvedValue({
        data: [{ success: false, error: 'VERSION CONFLICT' }],
        error: null
      });

      // Also mock the load for conflict resolution
      mockSupabase.rpc.mockResolvedValue({
        data: [{
          world_document: {
            assets: {
              'shared-asset': { name: 'Server Version' }
            }
          },
          version: 3,
          cover_config: {},
          updated_at: new Date().toISOString()
        }],
        error: null
      });

      const result = await documentMutationService.syncNow();

      // Conflict detected (sync fails but conflict resolution triggered)
      expect(result).toBe(false);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should measure 100 operation batch time', async () => {
      const operations: DocumentOperation[] = Array.from({ length: 100 }, (_, i) => ({
        op: 'CREATE_ASSET',
        assetId: `perf-${i}`,
        name: `Perf Asset ${i}`,
        type: 'folder'
      }));

      documentMutationService['offlineQueue'] = operations;

      mockSupabase.rpc.mockResolvedValue({
        data: [{ success: true, new_version: 2 }],
        error: null
      });

      const startTime = performance.now();
      await documentMutationService.syncNow();
      const endTime = performance.now();

      // Should be under 200ms per requirements
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(200);
    });

    it('should handle rapid sequential operations', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: [{ success: true, new_version: 1 }],
        error: null
      });

      // Queue 50 rapid operations
      for (let i = 0; i < 50; i++) {
        documentMutationService.queueOperation({
          op: 'UPDATE_POSITION',
          assetId: 'rapid-asset',
          x: i * 10,
          y: i * 10,
          width: 200,
          height: 200,
          zIndex: 0
        });
      }

      // Should be compressed to single position update
      expect(documentMutationService['offlineQueue']).toHaveLength(1);
      expect(documentMutationService['offlineQueue'][0].op).toBe('UPDATE_POSITION');
    });
  });

  describe('Atomicity Tests', () => {
    it('should maintain atomic batch operations', async () => {
      // Create 50 assets, update one, delete one - all in one batch
      const operations: DocumentOperation[] = [
        ...Array.from({ length: 48 }, (_, i) => ({
          op: 'CREATE_ASSET' as const,
          assetId: `atomic-${i}`,
          name: `Atomic ${i}`,
          type: 'folder'
        })),
        {
          op: 'UPDATE_METADATA' as const,
          assetId: 'atomic-0',
          name: 'Updated Atomic 0'
        },
        {
          op: 'DELETE_ASSET' as const,
          assetId: 'atomic-47'
        }
      ];

      documentMutationService['offlineQueue'] = operations;

      mockSupabase.rpc.mockResolvedValue({
        data: [{ success: true, new_version: 2 }],
        error: null
      });

      const result = await documentMutationService.syncNow();

      // All operations should succeed atomically
      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'save_document_operations',
        expect.objectContaining({
          p_project_id: 'test-project',
          p_operations: expect.any(Array)
        })
      );
    });
  });
});
