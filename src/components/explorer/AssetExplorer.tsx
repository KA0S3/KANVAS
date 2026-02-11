import { Plus, Search, Settings, Tag, Users, Building, Sparkles, Swords, X, Image } from 'lucide-react';
import { useState } from 'react';
import { useAssetStore } from '@/stores/assetStore';
import { AssetTreeNode } from './AssetTreeNode';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TagFilterControls } from '@/components/tags/TagFilterControls';
import { GlobalTagManager } from '@/components/tags/GlobalTagManager';
import { cn } from '@/lib/utils';
import { AssetEditModal } from '@/components/asset/AssetEditModal';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { BackgroundMapEditor } from '@/components/asset/BackgroundMapEditor';
import { GeneratorModal } from '@/components/generators/GeneratorModal';
import type { Asset } from '@/components/AssetItem';

interface AssetExplorerProps {
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function AssetExplorer({ sidebarOpen, onToggleSidebar }: AssetExplorerProps) {
  const { assets, createAsset, updateAsset, currentActiveId, currentViewportId } = useAssetStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [newAssetId, setNewAssetId] = useState<string | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [backgroundMapModalOpen, setBackgroundMapModalOpen] = useState(false);
  const [backgroundRefreshTrigger, setBackgroundRefreshTrigger] = useState(0);
  const [generatorModal, setGeneratorModal] = useState<{
    isOpen: boolean;
    path: string;
    title: string;
  }>({ isOpen: false, path: '', title: '' });
  
  const rootAssets = assets ? Object.values(assets).filter(asset => !asset.parentId) : [];
  
  const handleCreateAsset = () => {
    const newAsset = createAsset({
      name: 'New Asset',
      type: 'other',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      description: '',
      customFields: [],
      customFieldValues: [],
      tags: [],
    }, currentActiveId);
    setNewAssetId(newAsset);
    setEditModalOpen(true);
  };

  const handleEditAsset = (asset: Asset) => {
    setEditingAssetId(asset.id);
    setEditModalOpen(true);
  };

  const handleSelectAndFocus = (asset: Asset) => {
    // Navigate to the asset's viewport (same as double-click)
    // We need to implement viewport navigation in the sidebar context
    // For now, just set the asset as active
    const { setActiveAsset } = useAssetStore.getState();
    setActiveAsset(asset.id);
  };

  const handleBackgroundSave = () => {
    // Force re-render of components that depend on background config
    setBackgroundRefreshTrigger(prev => prev + 1);
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
            onClick={() => setBackgroundMapModalOpen(true)}
            title="Background Map"
          >
            <Image className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => setSettingsPanelOpen(true)}
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
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        
        {/* Four main buttons */}
        <div className="flex gap-1">
          <Button
            variant="outline"
            className="h-10 flex-1 flex flex-col items-center justify-center gap-0.5 bg-sidebar-accent/20 border-sidebar-border hover:bg-sidebar-accent/40 px-1 fantasy-tab"
            onClick={() => setGeneratorModal({
              isOpen: true,
              path: '/generators/character-generator.html',
              title: 'Character Generator'
            })}
          >
            <Users className="w-4 h-4" />
            <span className="text-xs">Characters</span>
          </Button>
          <Button
            variant="outline"
            className="h-10 flex-1 flex flex-col items-center justify-center gap-0.5 bg-sidebar-accent/20 border-sidebar-border hover:bg-sidebar-accent/40 px-1 fantasy-tab"
            onClick={() => setGeneratorModal({
              isOpen: true,
              path: '/generators/city-generator.html',
              title: 'City Generator'
            })}
          >
            <Building className="w-4 h-4" />
            <span className="text-xs">Cities</span>
          </Button>
          <Button
            variant="outline"
            className="h-10 flex-1 flex flex-col items-center justify-center gap-0.5 bg-sidebar-accent/20 border-sidebar-border hover:bg-sidebar-accent/40 px-1 fantasy-tab"
            onClick={() => setGeneratorModal({
              isOpen: true,
              path: '/generators/god-generator.html',
              title: 'God Generator'
            })}
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-xs">Gods</span>
          </Button>
          <Button
            variant="outline"
            className="h-10 flex-1 flex flex-col items-center justify-center gap-0.5 bg-sidebar-accent/20 border-sidebar-border hover:bg-sidebar-accent/40 px-1 fantasy-tab"
            onClick={() => setGeneratorModal({
              isOpen: true,
              path: '/generators/battle-generator.html',
              title: 'Battle Generator'
            })}
          >
            <Swords className="w-4 h-4" />
            <span className="text-xs">Battles</span>
          </Button>
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
            onClick={handleCreateAsset}
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
      
      {/* Edit Modal for New and Existing Assets */}
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
      
      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
      />
      
      {/* Generator Modal */}
      <GeneratorModal
        isOpen={generatorModal.isOpen}
        onClose={() => setGeneratorModal({ ...generatorModal, isOpen: false })}
        generatorPath={generatorModal.path}
        title={generatorModal.title}
        onImport={(assetData) => {
          // Create the asset using the store's createAsset function
          const newAsset = createAsset({
            name: assetData.name,
            type: 'other',
            x: 100,
            y: 100,
            width: 200,
            height: 150,
            description: assetData.description,
            customFields: [],
            customFieldValues: [],
            tags: assetData.tags || [],
          }, currentActiveId);
          
          // Update the asset with the additional data from the generator
          updateAsset(newAsset, {
            description: assetData.description,
            tags: assetData.tags || []
          });
          
          setGeneratorModal({ ...generatorModal, isOpen: false });
        }}
      />

      {/* Background Map Editor */}
      <BackgroundMapEditor
        isOpen={backgroundMapModalOpen}
        onClose={() => setBackgroundMapModalOpen(false)}
        assetId={currentViewportId} // Use current viewport context from store
        onSave={handleBackgroundSave} // Trigger background refresh on save
      />

    </div>
  );
}
