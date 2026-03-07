import { Plus, Search, Settings, User, Tag, Users, Building, Sparkles, Swords, X, Image, GripVertical } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useAssetStore } from '@/stores/assetStore';
import { AssetTreeNode } from './AssetTreeNode';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TagFilterControls } from '@/components/tags/TagFilterControls';
import { GlobalTagManager } from '@/components/tags/GlobalTagManager';
import { cn } from '@/lib/utils';
import { AssetCreationModal } from '@/components/asset/AssetCreationModal';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { AccountModal } from '@/components/account/AccountModal';
import type { Asset } from '@/components/AssetItem';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';

// Root Asset Component
function RootAsset({ isDragActive }: { isDragActive: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'root-asset',
  });
  
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-2 py-1.5 px-2 mx-3 mt-1 mb-1 rounded-lg border transition-all duration-200",
        isOver 
          ? "border-blue-500/60 bg-blue-500/10 text-blue-500" 
          : "border-sidebar-border/30 bg-sidebar-accent/15 text-sidebar-foreground/60 hover:border-sidebar-border/50 hover:bg-sidebar-accent/25"
      )}
    >
      <div className="w-4 h-4 flex items-center justify-center">
        <div className="w-3 h-3 rounded-full bg-gradient-to-br from-amber-400 to-orange-500" />
      </div>
      <span className="text-sm font-medium">Root</span>
      {isOver && (
        <span className="text-xs text-blue-500 font-medium animate-pulse ml-auto">
          Drop here
        </span>
      )}
    </div>
  );
}

interface AssetExplorerProps {
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function AssetExplorer({ sidebarOpen, onToggleSidebar }: AssetExplorerProps) {
  const { assets, updateAsset, currentActiveId, currentViewportId, setIsEditingBackground, reparentAsset } = useAssetStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialData, setModalInitialData] = useState<any>(null);
  const [generatorImportData, setGeneratorImportData] = useState<any>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggedAsset, setDraggedAsset] = useState<Asset | null>(null);
  
  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // Reduced from 8 to make it easier to start dragging
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    console.log('Drag started:', active.id);
    setActiveId(active.id as string);
    const asset = assets[active.id as string];
    setDraggedAsset(asset || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    
    const activeAsset = assets[active.id as string];
    const overAsset = assets[over.id as string];
    
    if (!activeAsset || !overAsset) return;
    
    // Prevent dropping a parent onto its own child
    const isDescendant = (parentId: string, childId: string): boolean => {
      const parent = assets[parentId];
      if (!parent) return false;
      
      if (parent.children.includes(childId)) return true;
      
      return parent.children.some(childId => isDescendant(childId, childId));
    };
    
    if (isDescendant(activeAsset.id, overAsset.id)) {
      return;
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    console.log('Drag ended:', { active: active.id, over: over?.id });
    
    if (!over) {
      console.log('No drop target');
      setActiveId(null);
      setDraggedAsset(null);
      return;
    }
    
    const activeAsset = assets[active.id as string];
    
    if (!activeAsset) {
      console.warn('Active asset not found:', active.id);
      setActiveId(null);
      setDraggedAsset(null);
      return;
    }
    
    // Check if dropping on root asset
    if (over.id === 'root-asset') {
      console.log('Dropping on root asset');
      // Move to root level (only if not already at root)
      if (activeAsset.parentId !== undefined) {
        reparentAsset(activeAsset.id, undefined);
      }
      setActiveId(null);
      setDraggedAsset(null);
      return;
    }
    
    const overAsset = assets[over.id as string];
    
    if (!overAsset) {
      console.warn('Over asset not found:', over.id);
      setActiveId(null);
      setDraggedAsset(null);
      return;
    }
    
    console.log('Dropping asset:', activeAsset.name, 'onto:', overAsset.name);
    
    // Prevent dropping a parent onto its own child
    const isDescendant = (parentId: string, childId: string): boolean => {
      const parent = assets[parentId];
      if (!parent) return false;
      
      if (parent.children.includes(childId)) return true;
      
      return parent.children.some(childId => isDescendant(childId, childId));
    };
    
    if (isDescendant(activeAsset.id, overAsset.id)) {
      console.log('Prevented dropping parent onto child');
      setActiveId(null);
      setDraggedAsset(null);
      return;
    }
    
    // If dropping on the same asset, do nothing
    if (activeAsset.id === overAsset.id) {
      console.log('Dropping on same asset - no action');
      setActiveId(null);
      setDraggedAsset(null);
      return;
    }
    
    try {
      // Always nest the dragged asset under the target asset
      // This works for both folders and empty assets
      if (activeAsset.parentId !== overAsset.id) {
        console.log('Reparenting:', activeAsset.name, 'to parent:', overAsset.name);
        reparentAsset(activeAsset.id, overAsset.id);
      } else {
        console.log('Asset already has this parent - no action');
      }
    } catch (error) {
      console.error('Error during drag operation:', error);
    }
    
    setActiveId(null);
    setDraggedAsset(null);
  };

  // Handle generator import messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'GENERATOR_IMPORT') {
        console.log('Received generator import data:', event.data.data);
        setGeneratorImportData(event.data.data);
        setIsModalOpen(true);
      }
    };

    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);
  
  const rootAssets = assets ? Object.values(assets).filter(asset => !asset.parentId) : [];
  
  const openCreateAssetModal = useCallback(() => {
    console.log('🎯 Opening create modal');
    
    // ONLY open the modal - do NOT create any assets
    setModalInitialData({
      name: 'New Asset',
      type: 'other',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
    });
    setIsModalOpen(true);
  }, [currentActiveId]);

  const handleCreateAssetClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation(); // Prevent other listeners
    openCreateAssetModal();
  };

  const handleCreateAssetForTree = useCallback((options: { name: string; parentId?: string }) => {
    // Open modal with pre-filled data
    setModalInitialData({
      name: options.name,
      type: 'other',
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      customFields: [],
      customFieldValues: [],
    });
    setIsModalOpen(true);
  }, []);

  const handleEditAsset = (asset: Asset) => {
    setEditingAssetId(asset.id);
  };

  const handleSelectAndFocus = (asset: Asset) => {
    // Set the asset as active
    const { setActiveAsset } = useAssetStore.getState();
    setActiveAsset(asset.id);
    
    // Dispatch event to trigger viewport navigation
    window.dispatchEvent(new CustomEvent('navigateToAsset', {
      detail: { assetId: asset.id }
    }));
  };
  
  // Get breadcrumb path to active asset
  const activeAsset = currentActiveId && assets ? assets[currentActiveId] : null;
  const breadcrumbs: string[] = [];
  if (activeAsset && assets) {
    let current = activeAsset;
    while (current) {
      breadcrumbs.unshift(current.name);
      if (current.parentId) {
        current = assets[current.parentId];
      } else {
        break;
      }
    }
  }
  
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col bg-sidebar">
      {/* Button Section */}
      <div className="flex-shrink-0 px-3 py-3 border-b border-sidebar-border">
        {/* Top right buttons */}
        <div className="flex justify-end gap-2 mb-3">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => {
              setIsEditingBackground(true);
              if (onToggleSidebar) {
                onToggleSidebar();
              }
            }}
            title="Background Map"
          >
            <Image className="w-3.5 h-3.5" />
          </Button>
                    <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => setSettingsPanelOpen(true)}
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>
          <GlobalTagManager />
          {onToggleSidebar && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={onToggleSidebar}
              title="Close sidebar"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        
        {/* Four main buttons */}
        <div className="flex gap-1">
          <button
            type="button"
            className="whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border hover:text-accent-foreground py-2 h-10 flex-1 flex flex-col items-center justify-center gap-0.5 bg-sidebar-accent/20 border-sidebar-border hover:bg-sidebar-accent/40 px-1 fantasy-tab"
            onClick={() => {
              console.log('Characters button clicked');
              window.open('/generators/character-generator.html', '_blank');
            }}
          >
            <Users className="w-4 h-4" />
            <span className="text-xs">Characters</span>
          </button>
          <button
            type="button"
            className="whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border hover:text-accent-foreground py-2 h-10 flex-1 flex flex-col items-center justify-center gap-0.5 bg-sidebar-accent/20 border-sidebar-border hover:bg-sidebar-accent/40 px-1 fantasy-tab"
            onClick={() => {
              console.log('Cities button clicked');
              window.open('/generators/city-generator.html', '_blank');
            }}
          >
            <Building className="w-4 h-4" />
            <span className="text-xs">Cities</span>
          </button>
          <button
            type="button"
            className="whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border hover:text-accent-foreground py-2 h-10 flex-1 flex flex-col items-center justify-center gap-0.5 bg-sidebar-accent/20 border-sidebar-border hover:bg-sidebar-accent/40 px-1 fantasy-tab"
            onClick={() => {
              console.log('Gods button clicked');
              window.open('/generators/god-generator.html', '_blank');
            }}
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-xs">Gods</span>
          </button>
          <button
            type="button"
            className="whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border hover:text-accent-foreground py-2 h-10 flex-1 flex flex-col items-center justify-center gap-0.5 bg-sidebar-accent/20 border-sidebar-border hover:bg-sidebar-accent/40 px-1 fantasy-tab"
            onClick={() => {
              console.log('Battles button clicked');
              window.open('/generators/battle-manager.html', '_blank');
            }}
          >
            <Swords className="w-4 h-4" />
            <span className="text-xs">Battles</span>
          </button>
        </div>
      </div>
      
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-sidebar-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-sm tracking-wide text-sidebar-foreground">
            Assets
          </h2>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={handleCreateAssetClick}
            disabled={isModalOpen}
            title={isModalOpen ? "Creating asset..." : "Create new asset"}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sidebar-foreground/40" />
          <Input
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-7 text-xs bg-sidebar-accent/30 border-sidebar-border"
          />
        </div>
        
        {/* Tag filters */}
        <TagFilterControls compact />
      </div>
      
            
        {/* Tree */}
        <div 
          className="flex-1 fantasy-sidebar-content overflow-y-auto" 
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
        >
          {/* Root Asset */}
          <RootAsset isDragActive={activeId !== null} />
          
          <div className="py-1">
            {rootAssets.map((asset) => (
              <AssetTreeNode
                key={asset.id}
                asset={asset}
                depth={0}
                searchQuery={searchQuery}
                onEdit={handleEditAsset}
                onSelectAndFocus={handleSelectAndFocus}
                isDragActive={activeId !== null}
              />
            ))}
          </div>
        </div>
        
        {/* Drag Overlay */}
        <DragOverlay>
          {draggedAsset && (
            <div className="flex items-center gap-2 py-2 px-3 bg-background/95 backdrop-blur-sm border border-border/80 rounded-lg shadow-xl opacity-95 transform scale-105">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{draggedAsset.name}</span>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            </div>
          )}
        </DragOverlay>
        
        {/* Settings Panel */}
        <SettingsPanel
          isOpen={settingsPanelOpen}
          onClose={() => setSettingsPanelOpen(false)}
        />

        {/* Account Modal */}
        <AccountModal
          isOpen={accountModalOpen}
          onClose={() => setAccountModalOpen(false)}
        />

        {/* Asset Creation Modal */}
        <AssetCreationModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setGeneratorImportData(null);
          }}
          initialData={modalInitialData}
          parentId={currentActiveId || undefined}
          generatorImportData={generatorImportData}
        />
      </div>
    </DndContext>
  );
}
