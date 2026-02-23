 import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Sparkles, ArrowLeft, Plus, PanelRight, BookOpen } from "lucide-react";
import { AssetItem, type Asset } from "./AssetItem";
import { AssetEditModal } from "./asset/AssetEditModal";
import { useAssetTree } from "@/hooks/useAssetTree";
import { useAssetStore } from "@/stores/assetStore";
import { useBookStore } from "@/stores/bookStoreSimple";
import { useBackgroundStore } from "@/stores/backgroundStore";
import { Button } from "@/components/ui/button";
import { useSampleData } from "@/hooks/useSampleData";
import { 
  globalToLocalCoords, 
  localToGlobalCoords, 
  screenToViewportCoords,
  getDefaultViewportConfig,
  calculateCenterTransform,
  type ViewportConfig 
} from "@/utils/coordinateUtils";
import { getBackgroundColor, shouldShowParchmentOverlay, shouldShowGlassEffect } from "@/utils/backgroundUtils";
import { getAssetKeyWithBook } from "@/stores/backgroundStore";
import type { BackgroundConfig } from "@/types/background";

const initialAssets: Omit<Asset, 'id' | 'children'>[] = [
  { 
    name: "Project Folder", 
    type: "other", 
    x: 100, 
    y: 100,
    width: 250,
    height: 180,
    customFields: [],
    customFieldValues: [],
    viewportConfig: {
      zoom: 1.2,
      panX: 50,
      panY: 30,
    },
    backgroundConfig: {
      isClear: true,
      color: undefined,
      gridSize: 30,
    },
  },
  { name: "Project Overview.pdf", type: "document", x: 60, y: 80, width: 200, height: 150, customFields: [], customFieldValues: [] },
  { name: "Hero Banner.png", type: "image", x: 300, y: 150, width: 220, height: 160, customFields: [], customFieldValues: [] },
  { name: "Background Music.mp3", type: "audio", x: 150, y: 250, width: 200, height: 150, customFields: [], customFieldValues: [] },
];

interface AssetPortProps {
  onToggleSidebar?: () => void;
  currentWorldTitle?: string;
  onOpenWorldLibrary?: () => void;
}

export function AssetPort({ onToggleSidebar, currentWorldTitle, onOpenWorldLibrary }: AssetPortProps) {
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [currentViewport, setCurrentViewport] = useState<ViewportConfig>(getDefaultViewportConfig());
  const [enteredAssetId, setEnteredAssetId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [newAssetId, setNewAssetId] = useState<string | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const [backgroundRefreshKey, setBackgroundRefreshKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  
  // Background editing state - use refs to prevent resets
  const [isDraggingBackground, setIsDraggingBackground] = useState(false);
  const backgroundDragStartRef = useRef({ x: 0, y: 0 });
  const backgroundStartPositionRef = useRef({ x: 0, y: 0 });
  const backgroundConfigRef = useRef<BackgroundConfig | null>(null);

  // Initialize sample data
  useSampleData();

  // Listen for background save events
  useEffect(() => {
    const handleBackgroundSave = () => {
      setBackgroundRefreshKey(prev => prev + 1);
    };

    window.addEventListener('backgroundSaved', handleBackgroundSave);
    return () => {
      window.removeEventListener('backgroundSaved', handleBackgroundSave);
    };
  }, []);

  const {
    assets,
    activeAsset,
    deleteAsset,
    updateAssetPosition,
    updateAssetSize,
    setActiveAsset,
    getRootAssets,
    searchAssets,
    getAssetPath,
  } = useAssetTree();
  
  const { createAsset: createStoreAsset, currentActiveId, setCurrentViewportId, currentViewportId, isEditingBackground, updateAsset } = useAssetStore();
  const { getCurrentBook, getWorldData, updateWorldData } = useBookStore();
  const { getBackground, setBackground } = useBackgroundStore();
  
  // Get book-specific viewport settings, falling back to defaults if no book is selected
  const currentBook = getCurrentBook();
  const bookWorldData = currentBook ? getWorldData(currentBook.id) : null;
  const bookViewportOffset = bookWorldData?.viewportOffset || { x: -45, y: -20 };
  const bookViewportScale = bookWorldData?.viewportScale || 1;
  
  const handleResize = useCallback((assetId: string, width: number, height: number) => {
    updateAssetSize(assetId, width, height);
  }, [updateAssetSize]);

  // Update viewport size when component mounts or window resizes
  useEffect(() => {
    const updateViewportSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setViewportSize({ width: rect.width, height: rect.height });
      }
    };

    updateViewportSize();
    window.addEventListener('resize', updateViewportSize);
    return () => window.removeEventListener('resize', updateViewportSize);
  }, []);

  // Initialize with some sample assets on first render
  useEffect(() => {
    if (!hasInitialized.current && Object.keys(assets).length === 0) {
      hasInitialized.current = true;
      const folderId = createStoreAsset(initialAssets[0]); // Create the folder first
      
      // Create child assets and assign them to the folder
      initialAssets.slice(1).forEach(assetData => {
        createStoreAsset(assetData, folderId);
      });
    }
  }, [assets.length, createStoreAsset]);

  const handleCreateAsset = useCallback(() => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    const randomX = 50 + Math.random() * ((containerRect?.width || 400) - 250);
    const randomY = 80 + Math.random() * ((containerRect?.height || 300) - 150);
    
    const newAssetId = createStoreAsset({
      name: 'New Asset',
      type: 'other',
      x: randomX,
      y: randomY,
      width: 200,
      height: 150,
      description: '',
      customFields: [],
      customFieldValues: [],
      tags: [],
    }, enteredAssetId || undefined);
    
    setNewAssetId(newAssetId);
    setEditModalOpen(true);
  }, [createStoreAsset, enteredAssetId]);

  const handleDeleteAsset = useCallback((id: string) => {
    deleteAsset(id);
  }, [deleteAsset]);

  const handleEditAsset = useCallback((asset: Asset) => {
    setEditingAssetId(asset.id);
    setEditModalOpen(true);
  }, []);

  const handleAssetDoubleClick = useCallback((asset: Asset) => {
    // Enter the asset by setting it as the active asset and updating viewport
    setActiveAsset(asset.id);
    setEnteredAssetId(asset.id);
    setCurrentViewportId(asset.id); // Update current viewport context in store
    
    // Calculate viewport to center the asset
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const centerTransform = calculateCenterTransform(asset, rect.width, rect.height);
      
      // Use asset's custom viewport config if available, otherwise use calculated center
      const newViewport = asset.viewportConfig || centerTransform;
      setCurrentViewport(newViewport);
    }
  }, [setActiveAsset, setCurrentViewportId]);

  // Listen for navigation events from sidebar
  useEffect(() => {
    const handleNavigateToAsset = (event: CustomEvent) => {
      const { assetId } = event.detail;
      const asset = assets[assetId];
      
      if (asset) {
        // Navigate to parent viewport without moving the viewport
        if (asset.parentId) {
          // Exit current asset and go to parent
          setEnteredAssetId(asset.parentId);
          setCurrentViewportId(asset.parentId);
          setActiveAsset(asset.parentId);
        } else {
          // Asset is at root level, exit to root
          setEnteredAssetId(null);
          setCurrentViewportId(null);
          setActiveAsset(null);
        }
        
        // Set the target asset as active for highlighting
        setActiveAsset(assetId);
      }
    };

    window.addEventListener('navigateToAsset', handleNavigateToAsset as EventListener);
    return () => {
      window.removeEventListener('navigateToAsset', handleNavigateToAsset as EventListener);
    };
  }, [assets, setActiveAsset]);

  const handleExitAsset = useCallback(() => {
    setEnteredAssetId(null);
    setActiveAsset(null);
    setCurrentViewportId(null); // Clear current viewport context in store
    setCurrentViewport(getDefaultViewportConfig());
  }, [setActiveAsset, setCurrentViewportId]);

  const handleMouseDown = useCallback((e: React.MouseEvent, asset: Asset) => {
    e.preventDefault();
    setSelectedAsset(asset.id);
    setActiveAsset(asset.id);
    setIsDragging(true);
    
    const rect = (e.target as HTMLElement).closest('.asset-item')?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  }, [setActiveAsset]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !selectedAsset || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const screenX = e.clientX - containerRect.left - dragOffset.x;
    const screenY = e.clientY - containerRect.top - dragOffset.y;
    
    // Convert screen coordinates to viewport coordinates
    const viewportCoords = screenToViewportCoords(
      { x: screenX, y: screenY },
      currentViewport
    );
    
    // Keep within bounds (in viewport space)
    const boundedX = Math.max(0, Math.min(viewportCoords.x, containerRect.width - 200));
    const boundedY = Math.max(0, Math.min(viewportCoords.y, containerRect.height - 50));
    
    // Convert to global coordinates if we're inside an asset
    let finalX = boundedX;
    let finalY = boundedY;
    
    if (enteredAssetId && assets && assets[enteredAssetId]) {
      const parentAsset = assets[enteredAssetId];
      // Convert from local (viewport) to global coordinates
      const globalCoords = localToGlobalCoords(
        { x: boundedX, y: boundedY },
        parentAsset,
        currentViewport
      );
      finalX = globalCoords.x;
      finalY = globalCoords.y;
    }
    
    // Update asset position in store
    updateAssetPosition(selectedAsset, finalX, finalY);
  }, [isDragging, selectedAsset, dragOffset, updateAssetPosition, enteredAssetId, assets, currentViewport]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
   }, []);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedAsset(null);
      // Exit asset if we're inside one
      if (enteredAssetId) {
        handleExitAsset();
      } else {
        setActiveAsset(null);
      }
    }
  }, [enteredAssetId, handleExitAsset, setActiveAsset]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Get assets to display based on current context
  const displayAssets = enteredAssetId && assets && assets[enteredAssetId]
    ? assets[enteredAssetId].children.map(childId => assets[childId]).filter(Boolean) || []
    : getRootAssets();

  // Build breadcrumb path with asset IDs
  const getBreadcrumbPath = () => {
    const path: { name: string; assetId: string | null }[] = [{ name: 'Root', assetId: null }];
    
    if (enteredAssetId && assets && assets[enteredAssetId]) {
      const buildPath = (assetId: string): { name: string; assetId: string | null }[] => {
        const asset = assets[assetId];
        if (!asset) return [];
        
        if (asset.parentId) {
          const parentPath = buildPath(asset.parentId);
          return [...parentPath, { name: asset.name, assetId: asset.id }];
        }
        return [{ name: asset.name, assetId: asset.id }];
      };
      
      const fullPath = buildPath(enteredAssetId);
      return [...path, ...fullPath];
    }
    return path;
  };

  const breadcrumbPath = getBreadcrumbPath();

  // Get current background config from new store
  const backgroundConfig = getBackground(getAssetKeyWithBook(enteredAssetId || 'root', currentBook?.id));
  
  // State for tracking image natural size
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  
  // Handle image loading for natural size detection
  useEffect(() => {
    if (!backgroundConfig?.imageUrl) {
      setImageNaturalSize(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const newSize = { width: img.naturalWidth, height: img.naturalHeight };
      setImageNaturalSize(newSize);
      
      // Update config with image size if not already set
      if (!backgroundConfig.imageSize || 
          backgroundConfig.imageSize.width !== newSize.width || 
          backgroundConfig.imageSize.height !== newSize.height) {
        const assetKey = getAssetKeyWithBook(enteredAssetId || 'root', currentBook?.id);
        const updatedConfig = { ...backgroundConfig, imageSize: newSize };
        setBackground(assetKey, updatedConfig);
      }
    };
    img.src = backgroundConfig.imageUrl;
  }, [backgroundConfig?.imageUrl, backgroundConfig?.imageSize, enteredAssetId, currentBook?.id, setBackground]);

  // Background editing handlers
  const handleBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isEditingBackground || !backgroundConfig?.imageUrl) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    setIsDraggingBackground(true);
    
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    
    const startX = e.clientX - containerRect.left - (backgroundConfig.position?.x || 0);
    const startY = e.clientY - containerRect.top - (backgroundConfig.position?.y || 0);
    
    backgroundDragStartRef.current = { x: startX, y: startY };
    backgroundStartPositionRef.current = { x: backgroundConfig.position?.x || 0, y: backgroundConfig.position?.y || 0 };
  }, [isEditingBackground, backgroundConfig]);

  const handleBackgroundMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingBackground || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newX = e.clientX - containerRect.left - backgroundDragStartRef.current.x;
    const newY = e.clientY - containerRect.top - backgroundDragStartRef.current.y;
    
    // Update background position in real-time
    updateBackgroundPosition(newX, newY);
  }, [isDraggingBackground]);

  const handleBackgroundMouseUp = useCallback(() => {
    setIsDraggingBackground(false);
  }, []);

  const updateBackgroundPosition = useCallback((x: number, y: number) => {
    const assetKey = getAssetKeyWithBook(enteredAssetId || 'root', currentBook?.id);
    const updatedConfig = { ...backgroundConfig, position: { x, y } };
    setBackground(assetKey, updatedConfig);
  }, [enteredAssetId, currentBook, backgroundConfig, setBackground]);

  const updateBackgroundScale = useCallback((scale: number) => {
    const assetKey = getAssetKeyWithBook(enteredAssetId || 'root', currentBook?.id);
    const updatedConfig = { ...backgroundConfig, scale };
    setBackground(assetKey, updatedConfig);
  }, [enteredAssetId, currentBook, backgroundConfig, setBackground]);

  const handleBackgroundWheel = useCallback((e: WheelEvent) => {
    if (!isEditingBackground || !backgroundConfig?.imageUrl) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const scaleDelta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(0.1, Math.min(3, (backgroundConfig.scale || 1) + scaleDelta));
    
    // Dispatch event to sync with sliders in editor components
    window.dispatchEvent(new CustomEvent('backgroundPreviewUpdate', {
      detail: {
        scale: newScale,
        assetId: enteredAssetId || 'root'
      }
    }));
    
    // Also update directly for immediate visual feedback
    updateBackgroundScale(newScale);
  }, [backgroundConfig, enteredAssetId, isEditingBackground, updateBackgroundScale]);

  // Listen for background preview update events
  useEffect(() => {
    const handleBackgroundPreviewUpdate = (event: CustomEvent) => {
      // Update live scale for real-time preview
      const { scale } = event.detail;
      if (scale !== undefined) {
        // Actually update the scale like the mouse wheel does
        updateBackgroundScale(scale);
      }
    };

    window.addEventListener('backgroundPreviewUpdate', handleBackgroundPreviewUpdate as EventListener);
    return () => {
      window.removeEventListener('backgroundPreviewUpdate', handleBackgroundPreviewUpdate as EventListener);
    };
  }, [updateBackgroundScale]);

  // Background event listeners
  useEffect(() => {
    if (isDraggingBackground) {
      window.addEventListener("mousemove", handleBackgroundMouseMove);
      window.addEventListener("mouseup", handleBackgroundMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleBackgroundMouseMove);
        window.removeEventListener("mouseup", handleBackgroundMouseUp);
      };
    }
  }, [isDraggingBackground, handleBackgroundMouseMove, handleBackgroundMouseUp]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener("wheel", handleBackgroundWheel, { passive: false });
      return () => {
        container.removeEventListener("wheel", handleBackgroundWheel);
      };
    }
  }, [handleBackgroundWheel]);

  const getRenderedBackgroundImageSize = () => {
    const scale = typeof backgroundConfig.scale === 'number' ? backgroundConfig.scale : 1;
    const size = backgroundConfig.imageSize || imageNaturalSize;
    if (!size || typeof size.width !== 'number' || typeof size.height !== 'number') return null;
    return {
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
    };
  };

   return (
    <div className="glass-strong cosmic-glow rounded-2xl w-full h-full flex flex-col mx-auto my-auto">
       {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-glass-border/20">
        <div className="flex items-center gap-2">
          {enteredAssetId && (
            <button
              onClick={handleExitAsset}
              className="p-1 hover:bg-muted rounded transition-colors self-center"
              title="Exit asset"
            >
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          {currentWorldTitle && onOpenWorldLibrary && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenWorldLibrary}
              className="gap-2 self-center glass cosmic-glow border-glass-border/40"
            >
              <BookOpen className="w-4 h-4" />
              {currentWorldTitle}
            </Button>
          )}
          {/* Interactive Breadcrumb Path */}
          <nav className="flex items-center text-xs text-muted-foreground bg-glass/50 px-2 py-1 rounded border border-glass-border/30">
            {breadcrumbPath.map((segment, index) => {
              const isLast = index === breadcrumbPath.length - 1;
              const isRoot = index === 0;
              
              return (
                <div key={index} className="flex items-center">
                  {index > 0 && (
                    <span className="mx-1 text-muted-foreground/60">/</span>
                  )}
                  <button
                    onClick={() => {
                      if (isRoot) {
                        // Navigate to root
                        handleExitAsset();
                      } else if (segment.assetId) {
                        // Navigate to this asset
                        handleAssetDoubleClick(assets[segment.assetId]);
                      }
                    }}
                    className={`hover:text-foreground transition-colors ${
                      isLast 
                        ? 'text-foreground font-medium cursor-default' 
                        : 'hover:underline cursor-pointer'
                    }`}
                    disabled={isLast}
                  >
                    {segment.name}
                  </button>
                </div>
              );
            })}
          </nav>
          {!isEditingBackground && (
            <Button
              variant="cosmic"
              size="sm"
              className="gap-2 self-center"
              onClick={handleCreateAsset}
            >
              <Plus className="w-4 h-4" />
              Add Asset
            </Button>
          )}
        </div>
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="p-2 hover:bg-muted rounded transition-colors"
            title="Toggle Shelf"
          >
            <PanelRight className="w-5 h-5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {/* Canvas Area */}
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        onMouseDown={handleBackgroundMouseDown}
        className={`flex-1 relative overflow-hidden ${
          isEditingBackground && backgroundConfig?.imageUrl ? 'cursor-move' : 'cursor-crosshair'
        }`}
      >
        <div
          className={`absolute inset-0 ${shouldShowGlassEffect(backgroundConfig) ? 'glass cosmic-glow' : ''}`}
          style={{
            backgroundColor: getBackgroundColor(backgroundConfig),
          }}
        >
          {/* Parchment Texture Overlay */}
          {shouldShowParchmentOverlay(backgroundConfig) && (
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                opacity: backgroundConfig.imageUrl ? 0.15 : 0.25,
                backgroundImage: `
                  radial-gradient(
                    ellipse at 20% 30%,
                    rgba(139, 69, 19, 0.08) 0%,
                    transparent 40%
                  ),
                  radial-gradient(
                    ellipse at 80% 70%,
                    rgba(160, 82, 45, 0.06) 0%,
                    transparent 35%
                  ),
                  radial-gradient(
                    ellipse at 50% 50%,
                    rgba(205, 133, 63, 0.04) 0%,
                    transparent 60%
                  )
                `,
                backgroundSize: '400px 400px, 350px 350px, 500px 500px',
                backgroundPosition: '0 0, 100px 100px, -50px -50px',
                mixBlendMode: 'multiply',
                filter: 'blur(0.5px)',
              }}
            />
          )}
        </div>

        {backgroundConfig.imageUrl && (
          <>
            <img
              src={backgroundConfig.imageUrl}
              alt=""
              draggable={false}
              className={`absolute max-w-none select-none ${
                isEditingBackground ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
              style={{
                left: `${backgroundConfig.position?.x ?? 0}px`,
                top: `${backgroundConfig.position?.y ?? 0}px`,
                width: (() => {
                  const rendered = getRenderedBackgroundImageSize();
                  return rendered ? `${rendered.width}px` : 'auto';
                })(),
                height: (() => {
                  const rendered = getRenderedBackgroundImageSize();
                  return rendered ? `${rendered.height}px` : 'auto';
                })(),
                mask: backgroundConfig.imageUrl ? 
                  `radial-gradient(circle at center, 
                    black ${(backgroundConfig.innerRadius || 0.3) * 100}%, 
                    transparent ${(backgroundConfig.outerRadius || 0.8) * 100}%)` : 
                  undefined,
                WebkitMask: backgroundConfig.imageUrl ? 
                  `radial-gradient(circle at center, 
                    black ${(backgroundConfig.innerRadius || 0.3) * 100}%, 
                    transparent ${(backgroundConfig.outerRadius || 0.8) * 100}%)` : 
                  undefined,
              }}
            />
            
            {/* Visual guide - dashed border around background image */}
            {isEditingBackground && (() => {
              const rendered = getRenderedBackgroundImageSize();
              if (!rendered) return null;
              
              return (
                <div
                  className="absolute border-2 border-dashed border-primary/50 pointer-events-none"
                  style={{
                    left: `${backgroundConfig.position?.x ?? 0}px`,
                    top: `${backgroundConfig.position?.y ?? 0}px`,
                    width: `${rendered.width}px`,
                    height: `${rendered.height}px`,
                  }}
                />
              );
            })()}
          </>
        )}

        {/* Background editing overlay */}
        {isEditingBackground && backgroundConfig.imageUrl && (
          <div className="absolute bottom-4 right-4 bg-black/70 text-white text-xs px-3 py-2 rounded pointer-events-none z-30">
            <div>Position: ({Math.round(backgroundConfig.position?.x || 0)}, {Math.round(backgroundConfig.position?.y || 0)})</div>
            <div>Scale: {backgroundConfig.scale?.toFixed(2) || '1.00'}</div>
            <div>Inner Radius: {Math.round((backgroundConfig.innerRadius || 0.3) * 100)}%</div>
            <div>Outer Radius: {Math.round((backgroundConfig.outerRadius || 0.8) * 100)}%</div>
            <div className="text-xs text-gray-300 mt-1">Drag to move • Scroll to scale • Use slider to resize</div>
          </div>
        )}

        {/* Viewport transform container */}
        <div
          style={{
            transform: `scale(${currentViewport.zoom * bookViewportScale}) translate(${currentViewport.panX + bookViewportOffset.x}px, ${currentViewport.panY + bookViewportOffset.y}px)`,
            transformOrigin: '0 0',
            width: '100%',
            height: '100%',
          }}
        >
         {displayAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground" style={{ height: '100%' }}>
             <Sparkles className="w-8 h-8 mb-2 opacity-50" />
             <p className="text-sm">
               {enteredAssetId ? 'No child assets' : 'No assets yet'}
             </p>
             <p className="text-xs opacity-70">
               {enteredAssetId 
                 ? 'Double-click parent assets to add children' 
                 : 'Add your first asset to get started'
               }
             </p>
           </div>
         ) : (
          displayAssets.map((asset) => {
            // Convert asset position to local coordinates if we're inside a parent
            let displayAsset = { ...asset };
            
            if (enteredAssetId && assets && assets[enteredAssetId]) {
              const parentAsset = assets[enteredAssetId];
              // Convert from global to local coordinates
              const localCoords = globalToLocalCoords(
                { x: asset.x, y: asset.y },
                parentAsset,
                currentViewport
              );
              displayAsset = {
                ...asset,
                x: localCoords.x,
                y: localCoords.y,
              };
            }
            
            return (
              <AssetItem
                key={asset.id}
                asset={displayAsset}
                onDelete={handleDeleteAsset}
                onMouseDown={handleMouseDown}
                onDoubleClick={handleAssetDoubleClick}
                isSelected={selectedAsset === asset.id}
                onResize={handleResize}
                onEdit={handleEditAsset}
                onSelectAndFocus={handleAssetDoubleClick}
                isEditingBackground={isEditingBackground}
              />
            );
          })
         )}
        </div>
      </div>

      {/* Asset Edit Modal */}
      <AssetEditModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setNewAssetId(null);
          setEditingAssetId(null);
        }}
        assetId={editingAssetId || newAssetId}
        isNewAsset={!!newAssetId}
        viewportSize={viewportSize}
      />

      </div>
  );
}
