 import { useState, useCallback, useRef, useEffect } from "react";
import { Sparkles, ArrowLeft, Plus, PanelRight } from "lucide-react";
import { AssetItem, type Asset } from "./AssetItem";
import { AssetEditModal } from "./asset/AssetEditModal";
import { useAssetTree } from "@/hooks/useAssetTree";
import { useAssetStore } from "@/stores/assetStore";
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
      color: 'hsl(var(--background))',
      gridSize: 30,
    },
  },
  { name: "Project Overview.pdf", type: "document", x: 60, y: 80, width: 200, height: 150, customFields: [], customFieldValues: [] },
  { name: "Hero Banner.png", type: "image", x: 300, y: 150, width: 220, height: 160, customFields: [], customFieldValues: [] },
  { name: "Background Music.mp3", type: "audio", x: 150, y: 250, width: 200, height: 150, customFields: [], customFieldValues: [] },
];

interface AssetPortProps {
  onToggleSidebar?: () => void;
}

export function AssetPort({ onToggleSidebar }: AssetPortProps) {
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [currentViewport, setCurrentViewport] = useState<ViewportConfig>(getDefaultViewportConfig());
  const [enteredAssetId, setEnteredAssetId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [newAssetId, setNewAssetId] = useState<string | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  // Initialize sample data
  useSampleData();

  const {
    assets,
    activeAsset,
    deleteAsset,
    updateAssetPosition,
    updateAssetSize,
    setActiveAsset,
    getRootAssets,
    searchAssets,
  } = useAssetTree();
  
  const { createAsset: createStoreAsset, viewportOffset, viewportScale } = useAssetStore();
  
  const handleResize = useCallback((assetId: string, width: number, height: number) => {
    updateAssetSize(assetId, width, height);
  }, [updateAssetSize]);

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
    
    // Calculate viewport to center the asset
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const centerTransform = calculateCenterTransform(asset, rect.width, rect.height);
      
      // Use asset's custom viewport config if available, otherwise use calculated center
      const newViewport = asset.viewportConfig || centerTransform;
      setCurrentViewport(newViewport);
    }
  }, [setActiveAsset]);

  const handleExitAsset = useCallback(() => {
    setEnteredAssetId(null);
    setActiveAsset(null);
    setCurrentViewport(getDefaultViewportConfig());
  }, [setActiveAsset]);

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
    
    if (enteredAssetId && assets[enteredAssetId]) {
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
  const displayAssets = enteredAssetId 
    ? assets[enteredAssetId]?.children.map(childId => assets[childId]).filter(Boolean) || []
    : getRootAssets();

  // Get current background config
  const currentAsset = enteredAssetId ? assets[enteredAssetId] : null;
  const backgroundImage = currentAsset?.background;
  const backgroundColor = currentAsset?.backgroundConfig?.color;

   return (
    <div className="glass-strong cosmic-glow rounded-2xl w-full h-full flex flex-col mx-auto my-auto">
       {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-glass-border/20">
        <div className="flex items-center gap-2">
          {enteredAssetId && (
            <button
              onClick={handleExitAsset}
              className="p-1 hover:bg-muted rounded transition-colors"
              title="Exit asset"
            >
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          <Button
            variant="cosmic"
            size="sm"
            className="gap-2"
            onClick={handleCreateAsset}
          >
            <Plus className="w-4 h-4" />
            Add Asset
          </Button>
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
        className="flex-1 relative overflow-hidden cursor-crosshair"
        style={{
          backgroundImage: backgroundImage
            ? `url(${backgroundImage})`
            : 'none',
          backgroundColor: backgroundColor || 'transparent',
        }}
      >
        {/* Viewport transform container */}
        <div
          style={{
            transform: `scale(${currentViewport.zoom * viewportScale}) translate(${currentViewport.panX + viewportOffset.x}px, ${currentViewport.panY + viewportOffset.y}px)`,
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
            
            if (enteredAssetId && assets[enteredAssetId]) {
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
      />
    </div>
  );
}
