import { documentMutationService } from './DocumentMutationService';
import { performanceMonitor } from '@/utils/performanceMonitor';

/**
 * Large Book Loader - Phase 9 Implementation
 * 
 * Handles efficient loading of books with 10,000+ assets through:
 * - Progressive/chunked loading
 * - Viewport-based partial loading
 * - Virtual scrolling support
 * - LRU cache for loaded chunks
 */

export interface ChunkInfo {
  index: number;
  size: number;
  assetIds: string[];
  loaded: boolean;
  loading: boolean;
  lastAccessed: number;
}

export interface LoadingProgress {
  totalAssets: number;
  loadedAssets: number;
  totalChunks: number;
  loadedChunks: number;
  percentComplete: number;
}

export type LoadingStrategy = 'full' | 'viewport' | 'segmented' | 'auto';

class LargeBookLoader {
  private static instance: LargeBookLoader;
  private chunkCache: Map<number, Record<string, any>> = new Map();
  private chunkMetadata: Map<number, ChunkInfo> = new Map();
  private loadedAssetIds: Set<string> = new Set();
  private currentStrategy: LoadingStrategy = 'auto';
  private maxCacheSize = 10; // Max chunks in memory
  private isLoading = false;
  private progressCallback?: (progress: LoadingProgress) => void;
  private abortController?: AbortController;

  static getInstance(): LargeBookLoader {
    if (!LargeBookLoader.instance) {
      LargeBookLoader.instance = new LargeBookLoader();
    }
    return LargeBookLoader.instance;
  }

  /**
   * Initialize loader and determine optimal loading strategy
   */
  async initialize(strategy: LoadingStrategy = 'auto'): Promise<{
    strategy: LoadingStrategy;
    totalAssets: number;
    totalChunks: number;
    estimatedLoadTime: number; // seconds
  }> {
    this.currentStrategy = strategy;
    this.chunkCache.clear();
    this.chunkMetadata.clear();
    this.loadedAssetIds.clear();

    // Get metrics to determine strategy
    if (strategy === 'auto') {
      const optimal = await documentMutationService.getOptimalLoadingStrategy();
      this.currentStrategy = optimal.strategy;
    }

    // Get document manifest for segmented loading
    if (this.currentStrategy === 'segmented') {
      const manifest = await documentMutationService.getDocumentManifest(1000);
      if (manifest.success && manifest.manifest) {
        // Initialize chunk metadata
        manifest.manifest.chunks.forEach(chunk => {
          this.chunkMetadata.set(chunk.index, {
            index: chunk.index,
            size: chunk.size,
            assetIds: chunk.assetIds,
            loaded: false,
            loading: false,
            lastAccessed: 0
          });
        });

        const estimatedTime = Math.ceil(manifest.manifest.totalChunks * 0.5); // ~500ms per chunk

        return {
          strategy: this.currentStrategy,
          totalAssets: manifest.manifest.totalAssets,
          totalChunks: manifest.manifest.totalChunks,
          estimatedLoadTime: estimatedTime
        };
      }
    }

    // For viewport or full loading
    const metrics = await documentMutationService.getLargeBookMetrics();
    const totalAssets = parseInt(metrics.metrics?.asset_count?.value || '0');

    return {
      strategy: this.currentStrategy,
      totalAssets,
      totalChunks: 1,
      estimatedLoadTime: this.currentStrategy === 'full' 
        ? Math.ceil(totalAssets / 500) // ~2 assets per ms
        : 1 // Viewport is fast
    };
  }

  /**
   * Load initial viewport data (for viewport strategy)
   */
  async loadViewport(viewport: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<{
    success: boolean;
    assets: Record<string, any>;
    totalAssets: number;
    loadedAssets: number;
    error?: string;
  }> {
    const result = await documentMutationService.loadDocumentViewport(viewport);

    if (!result.success || !result.data) {
      return {
        success: false,
        assets: {},
        totalAssets: 0,
        loadedAssets: 0,
        error: result.error
      };
    }

    const assets = result.data.world_document?.assets || {};
    
    // Track loaded assets
    Object.keys(assets).forEach(id => this.loadedAssetIds.add(id));

    return {
      success: true,
      assets,
      totalAssets: result.totalAssets || 0,
      loadedAssets: result.loadedAssets || 0
    };
  }

  /**
   * Load root-level assets only (fast initial load)
   */
  async loadRootOnly(): Promise<{
    success: boolean;
    assets: Record<string, any>;
    totalAssets: number;
    error?: string;
  }> {
    const result = await documentMutationService.loadDocumentViewport(undefined, { rootOnly: true });

    if (!result.success || !result.data) {
      return {
        success: false,
        assets: {},
        totalAssets: 0,
        error: result.error
      };
    }

    const assets = result.data.world_document?.assets || {};
    Object.keys(assets).forEach(id => this.loadedAssetIds.add(id));

    return {
      success: true,
      assets,
      totalAssets: result.totalAssets || 0
    };
  }

  /**
   * Load specific chunks by index (for segmented strategy)
   */
  async loadChunks(chunkIndices: number[]): Promise<{
    success: boolean;
    loadedCount: number;
    assets: Record<string, any>;
    error?: string;
  }> {
    const allAssets: Record<string, any> = {};
    let loadedCount = 0;

    // Filter out already loaded chunks
    const chunksToLoad = chunkIndices.filter(idx => {
      const meta = this.chunkMetadata.get(idx);
      return meta && !meta.loaded && !meta.loading;
    });

    if (chunksToLoad.length === 0) {
      // Return cached assets for already loaded chunks
      chunkIndices.forEach(idx => {
        const cached = this.chunkCache.get(idx);
        if (cached) {
          Object.assign(allAssets, cached);
          loadedCount += Object.keys(cached).length;
        }
      });
      return { success: true, loadedCount, assets: allAssets };
    }

    // Mark chunks as loading
    chunksToLoad.forEach(idx => {
      const meta = this.chunkMetadata.get(idx);
      if (meta) meta.loading = true;
    });

    try {
      // Load chunks in parallel (max 3 at a time)
      const batchSize = 3;
      for (let i = 0; i < chunksToLoad.length; i += batchSize) {
        const batch = chunksToLoad.slice(i, i + batchSize);
        
        const batchResults = await Promise.all(
          batch.map(async idx => {
            const meta = this.chunkMetadata.get(idx);
            if (!meta) return null;

            const result = await documentMutationService.loadAssetChunk(meta.assetIds);
            
            if (result.success && result.assets) {
              // Cache the chunk
              this.cacheChunk(idx, result.assets);
              
              meta.loaded = true;
              meta.loading = false;
              meta.lastAccessed = Date.now();
              
              return result.assets;
            }
            return null;
          })
        );

        // Collect assets
        batchResults.forEach(assets => {
          if (assets) {
            Object.assign(allAssets, assets);
            loadedCount += Object.keys(assets).length;
          }
        });

        // Report progress
        this.reportProgress();
      }

      return { success: true, loadedCount, assets: allAssets };
    } catch (error) {
      // Mark loading chunks as failed
      chunksToLoad.forEach(idx => {
        const meta = this.chunkMetadata.get(idx);
        if (meta && meta.loading) {
          meta.loading = false;
        }
      });

      return { success: false, loadedCount, assets: allAssets, error: String(error) };
    }
  }

  /**
   * Progressive load all chunks with progress callbacks
   */
  async loadAllChunks(
    onProgress?: (progress: LoadingProgress) => void
  ): Promise<{
    success: boolean;
    totalAssets: number;
    error?: string;
  }> {
    if (this.isLoading) {
      return { success: false, totalAssets: 0, error: 'Already loading' };
    }

    this.isLoading = true;
    this.progressCallback = onProgress;
    this.abortController = new AbortController();

    try {
      const allIndices = Array.from(this.chunkMetadata.keys());
      const totalChunks = allIndices.length;
      let loadedChunks = 0;

      // Load in batches to show progress
      const batchSize = 3;
      for (let i = 0; i < allIndices.length; i += batchSize) {
        // Check for abort
        if (this.abortController.signal.aborted) {
          throw new Error('Loading aborted');
        }

        const batch = allIndices.slice(i, i + batchSize);
        const result = await this.loadChunks(batch);

        if (result.success) {
          loadedChunks += batch.length;
          
          // Report progress
          if (onProgress) {
            const totalAssets = this.getTotalAssets();
            onProgress({
              totalAssets,
              loadedAssets: this.loadedAssetIds.size,
              totalChunks,
              loadedChunks,
              percentComplete: Math.round((loadedChunks / totalChunks) * 100)
            });
          }
        }

        // Small delay to prevent overwhelming the UI
        await this.sleep(50);
      }

      return { 
        success: true, 
        totalAssets: this.loadedAssetIds.size 
      };
    } catch (error) {
      return { 
        success: false, 
        totalAssets: this.loadedAssetIds.size,
        error: String(error)
      };
    } finally {
      this.isLoading = false;
      this.progressCallback = undefined;
      this.abortController = undefined;
    }
  }

  /**
   * Get chunks needed for a list of asset IDs
   */
  getChunksForAssets(assetIds: string[]): number[] {
    const chunkIndices = new Set<number>();

    assetIds.forEach(assetId => {
      // Find which chunk contains this asset
      this.chunkMetadata.forEach((meta, idx) => {
        if (meta.assetIds.includes(assetId)) {
          chunkIndices.add(idx);
        }
      });
    });

    return Array.from(chunkIndices);
  }

  /**
   * Load chunks needed for visible tree items (virtual scrolling)
   */
  async loadVisibleChunks(
    visibleAssetIds: string[],
    preloadAhead: number = 1
  ): Promise<{
    success: boolean;
    loadedAssets: Record<string, any>;
  }> {
    // Get chunks for visible items
    const visibleChunks = this.getChunksForAssets(visibleAssetIds);
    
    // Add preload chunks
    const preloadChunks: number[] = [];
    visibleChunks.forEach(idx => {
      for (let i = 1; i <= preloadAhead; i++) {
        if (this.chunkMetadata.has(idx + i)) {
          preloadChunks.push(idx + i);
        }
      }
    });

    const chunksToLoad = [...visibleChunks, ...preloadChunks];
    const result = await this.loadChunks(chunksToLoad);

    return {
      success: result.success,
      loadedAssets: result.assets
    };
  }

  /**
   * Check if an asset is loaded
   */
  isAssetLoaded(assetId: string): boolean {
    return this.loadedAssetIds.has(assetId);
  }

  /**
   * Get loading progress
   */
  getProgress(): LoadingProgress {
    const totalAssets = this.getTotalAssets();
    const totalChunks = this.chunkMetadata.size;
    const loadedChunks = Array.from(this.chunkMetadata.values()).filter(m => m.loaded).length;

    return {
      totalAssets,
      loadedAssets: this.loadedAssetIds.size,
      totalChunks,
      loadedChunks,
      percentComplete: totalChunks > 0 
        ? Math.round((loadedChunks / totalChunks) * 100)
        : 0
    };
  }

  /**
   * Get total assets from manifest
   */
  private getTotalAssets(): number {
    let total = 0;
    this.chunkMetadata.forEach(meta => {
      total += meta.size;
    });
    return total;
  }

  /**
   * Abort ongoing loading
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isLoading = false;
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.chunkCache.clear();
    this.chunkMetadata.clear();
    this.loadedAssetIds.clear();
    this.isLoading = false;
  }

  /**
   * Get current loading strategy
   */
  getStrategy(): LoadingStrategy {
    return this.currentStrategy;
  }

  /**
   * Get cache stats
   */
  getCacheStats(): {
    cachedChunks: number;
    totalCachedAssets: number;
    maxCacheSize: number;
    loadedAssets: number;
  } {
    let totalCachedAssets = 0;
    this.chunkCache.forEach(assets => {
      totalCachedAssets += Object.keys(assets).length;
    });

    return {
      cachedChunks: this.chunkCache.size,
      totalCachedAssets,
      maxCacheSize: this.maxCacheSize,
      loadedAssets: this.loadedAssetIds.size
    };
  }

  // Private: Cache a chunk with LRU eviction
  private cacheChunk(index: number, assets: Record<string, any>): void {
    // Evict oldest if at capacity
    if (this.chunkCache.size >= this.maxCacheSize) {
      let oldestIdx: number | null = null;
      let oldestTime = Date.now();

      this.chunkMetadata.forEach((meta, idx) => {
        if (meta.loaded && meta.lastAccessed < oldestTime) {
          oldestTime = meta.lastAccessed;
          oldestIdx = idx;
        }
      });

      if (oldestIdx !== null) {
        this.chunkCache.delete(oldestIdx);
        const meta = this.chunkMetadata.get(oldestIdx);
        if (meta) {
          meta.loaded = false;
          // Remove assets from loaded set
          meta.assetIds.forEach(id => this.loadedAssetIds.delete(id));
        }
      }
    }

    this.chunkCache.set(index, assets);
    
    // Track all asset IDs in this chunk
    Object.keys(assets).forEach(id => this.loadedAssetIds.add(id));
  }

  // Private: Report progress
  private reportProgress(): void {
    if (this.progressCallback) {
      this.progressCallback(this.getProgress());
    }
  }

  // Private: Sleep helper
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const largeBookLoader = LargeBookLoader.getInstance();
