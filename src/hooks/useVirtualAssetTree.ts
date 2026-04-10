import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { largeBookLoader, type LoadingProgress } from '@/services/LargeBookLoader';
import { documentMutationService } from '@/services/DocumentMutationService';

/**
 * Virtual Asset Tree Hook - Phase 9 Implementation
 * 
 * Provides efficient rendering of large asset trees (10k+ items) through:
 * - Virtual scrolling (only render visible items)
 * - Progressive chunk loading
 * - Collapsible tree support
 */

interface VirtualItem {
  id: string;
  index: number;
  data: any;
  depth: number;
  isVisible: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
}

interface UseVirtualAssetTreeOptions {
  itemHeight: number;
  overscan?: number;
  containerHeight: number;
}

interface UseVirtualAssetTreeResult {
  // Virtual list data
  virtualItems: VirtualItem[];
  totalHeight: number;
  
  // Loading state
  isLoading: boolean;
  loadingProgress: LoadingProgress | null;
  
  // Tree operations
  toggleExpand: (assetId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  
  // Loading methods
  loadInitial: () => Promise<void>;
  loadChunkForIndex: (index: number) => Promise<void>;
  
  // Scroll handling
  onScroll: (scrollTop: number) => void;
  scrollToItem: (index: number) => void;
  
  // Visibility
  visibleRange: { start: number; end: number };
}

export function useVirtualAssetTree(
  options: UseVirtualAssetTreeOptions
): UseVirtualAssetTreeResult {
  const { itemHeight, overscan = 5, containerHeight } = options;
  
  // State
  const [flatTree, setFlatTree] = useState<VirtualItem[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null);
  const [assetData, setAssetData] = useState<Record<string, any>>({});
  
  // Refs
  const loadedChunksRef = useRef<Set<number>>(new Set());
  const treeStructureRef = useRef<Array<{ assetId: string; parentId: string | null; hasChildren: boolean }>>([]);

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const start = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const end = Math.min(start + visibleCount + overscan, flatTree.length);
    return { 
      start: Math.max(0, start - overscan), 
      end 
    };
  }, [scrollTop, itemHeight, containerHeight, overscan, flatTree.length]);

  // Get virtual items for visible range
  const virtualItems = useMemo(() => {
    return flatTree.slice(visibleRange.start, visibleRange.end).map(item => ({
      ...item,
      isVisible: true
    }));
  }, [flatTree, visibleRange]);

  // Total scrollable height
  const totalHeight = flatTree.length * itemHeight;

  // Load initial tree structure (metadata only, no asset data)
  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    
    try {
      // Initialize loader
      await largeBookLoader.initialize('auto');
      
      // Load root assets first
      const rootResult = await largeBookLoader.loadRootOnly();
      
      if (rootResult.success) {
        setAssetData(prev => ({ ...prev, ...rootResult.assets }));
        
        // Query full tree structure (metadata only)
        const treeResult = await documentMutationService.queryAssetTree(undefined, 10);
        
        if (treeResult.success && treeResult.tree) {
          treeStructureRef.current = treeResult.tree.map(node => ({
            assetId: node.assetId,
            parentId: node.parentAssetId,
            hasChildren: node.hasChildren
          }));
          
          // Build initial flat tree (only visible nodes)
          rebuildFlatTree();
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Rebuild flat tree based on expanded state
  const rebuildFlatTree = useCallback(() => {
    const flat: VirtualItem[] = [];
    const structure = treeStructureRef.current;
    
    // Build tree map
    const childrenMap = new Map<string | null, string[]>();
    structure.forEach(node => {
      const parentId = node.parentId;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)?.push(node.assetId);
    });
    
    // Recursive function to build visible tree
    const addNode = (assetId: string, depth: number, index: number): number => {
      const node = structure.find(n => n.assetId === assetId);
      if (!node) return index;
      
      const isExpanded = expandedIds.has(assetId);
      
      flat.push({
        id: assetId,
        index,
        data: assetData[assetId],
        depth,
        isVisible: true,
        hasChildren: node.hasChildren,
        isExpanded
      });
      
      let nextIndex = index + 1;
      
      // Add children if expanded
      if (isExpanded && node.hasChildren) {
        const children = childrenMap.get(assetId) || [];
        for (const childId of children) {
          nextIndex = addNode(childId, depth + 1, nextIndex);
        }
      }
      
      return nextIndex;
    };
    
    // Start with root nodes
    const roots = childrenMap.get(null) || [];
    let index = 0;
    for (const rootId of roots) {
      index = addNode(rootId, 0, index);
    }
    
    setFlatTree(flat);
  }, [expandedIds, assetData]);

  // Toggle expand/collapse
  const toggleExpand = useCallback(async (assetId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
    
    // Load children data if expanding
    const node = treeStructureRef.current.find(n => n.assetId === assetId);
    if (node?.hasChildren) {
      const childrenIds = treeStructureRef.current
        .filter(n => n.parentId === assetId)
        .map(n => n.assetId);
      
      // Check if we need to load more data
      const unloadedChildren = childrenIds.filter(id => !assetData[id]);
      if (unloadedChildren.length > 0) {
        const chunks = largeBookLoader.getChunksForAssets(unloadedChildren);
        const result = await largeBookLoader.loadChunks(chunks);
        if (result.success) {
          setAssetData(prev => ({ ...prev, ...result.assets }));
        }
      }
    }
  }, [assetData]);

  // Expand all nodes
  const expandAll = useCallback(async () => {
    const allIds = new Set(treeStructureRef.current.map(n => n.assetId));
    setExpandedIds(allIds);
    
    // Load all chunks
    const progressCallback = (progress: LoadingProgress) => {
      setLoadingProgress(progress);
    };
    
    await largeBookLoader.loadAllChunks(progressCallback);
    
    // After loading all chunks, update the tree
    rebuildFlatTree();
  }, [rebuildFlatTree]);

  // Collapse all nodes
  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  // Load chunk for a specific index
  const loadChunkForIndex = useCallback(async (index: number) => {
    const chunks = largeBookLoader.getChunksForAssets([flatTree[index]?.id].filter(Boolean));
    if (chunks.length > 0 && !loadedChunksRef.current.has(chunks[0])) {
      const result = await largeBookLoader.loadChunks(chunks);
      if (result.success) {
        loadedChunksRef.current.add(chunks[0]);
        setAssetData(prev => ({ ...prev, ...result.assets }));
      }
    }
  }, [flatTree]);

  // Handle scroll
  const onScroll = useCallback((newScrollTop: number) => {
    setScrollTop(newScrollTop);
    
    // Preload chunks for visible items
    const startIdx = Math.floor(newScrollTop / itemHeight);
    const endIdx = Math.min(startIdx + Math.ceil(containerHeight / itemHeight), flatTree.length);
    
    // Load chunks for visible range
    const visibleAssetIds = flatTree.slice(startIdx, endIdx).map(item => item.id);
    if (visibleAssetIds.length > 0) {
      largeBookLoader.loadVisibleChunks(visibleAssetIds, 1).then(result => {
        if (result.success) {
          setAssetData(prev => ({ ...prev, ...result.loadedAssets }));
        }
      });
    }
  }, [flatTree, itemHeight, containerHeight]);

  // Scroll to specific item
  const scrollToItem = useCallback((index: number) => {
    const targetScrollTop = index * itemHeight;
    setScrollTop(targetScrollTop);
    loadChunkForIndex(index);
  }, [itemHeight, loadChunkForIndex]);

  // Update flat tree when expanded state changes
  useEffect(() => {
    rebuildFlatTree();
  }, [expandedIds, rebuildFlatTree]);

  // Update flat tree when asset data changes
  useEffect(() => {
    if (flatTree.length > 0) {
      rebuildFlatTree();
    }
  }, [assetData]);

  return {
    virtualItems,
    totalHeight,
    isLoading,
    loadingProgress,
    toggleExpand,
    expandAll,
    collapseAll,
    loadInitial,
    loadChunkForIndex,
    onScroll,
    scrollToItem,
    visibleRange
  };
}

export default useVirtualAssetTree;
