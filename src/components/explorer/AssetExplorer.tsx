import { Plus, Search, Settings, User, Tag, Users, Building, Sparkles, Swords, X, Image } from 'lucide-react';
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

interface AssetExplorerProps {
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function AssetExplorer({ sidebarOpen, onToggleSidebar }: AssetExplorerProps) {
  const { assets, updateAsset, currentActiveId, currentViewportId, setIsEditingBackground } = useAssetStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialData, setModalInitialData] = useState<any>(null);
  const [generatorImportData, setGeneratorImportData] = useState<any>(null);
  
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
            onClick={() => setAccountModalOpen(true)}
            title="Account"
          >
            <User className="w-3.5 h-3.5" />
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
      
      {/* Breadcrumb */}
      {breadcrumbs.length > 1 && (
        <div className="flex-shrink-0 px-3 py-1.5 border-b border-sidebar-border bg-sidebar-accent/20">
          <div className="text-xs text-sidebar-foreground/60 truncate">
            {breadcrumbs.join(' / ')}
          </div>
        </div>
      )}
      
      {/* Tree */}
      <div 
        className="flex-1 fantasy-sidebar-content overflow-y-auto" 
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
      >
        <div className="py-1">
          {rootAssets.map((asset) => (
            <AssetTreeNode
              key={asset.id}
              asset={asset}
              depth={0}
              searchQuery={searchQuery}
              onEdit={handleEditAsset}
              onSelectAndFocus={handleSelectAndFocus}
            />
          ))}
        </div>
      </div>
      
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
  );
}
