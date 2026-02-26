import { useState, useEffect, useCallback } from 'react';
import { useAssetTree } from '@/hooks/useAssetTree';
import { AssetTree } from '@/components/AssetTree';
import { useAssetStore } from '@/stores/assetStore';
import { AssetCreationModal } from '@/components/asset/AssetCreationModal';

export const AssetHierarchyDemo: React.FC = () => {
  const {
    assets,
    createAsset,
    reparentAsset,
    deleteAsset,
    getRootAssets,
    getAssetTree,
    getAssetPath,
    searchAssets,
  } = useAssetTree();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialData, setModalInitialData] = useState<any>(null);

  const handleCreateAssetForTree = useCallback((options: { name: string; parentId?: string }) => {
    setModalInitialData({
      name: options.name,
      type: 'other',
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      customFields: [],
      customFieldValues: [],
      parentId: options.parentId,
      context: 'demo-tree'
    });
    setIsModalOpen(true);
  }, []);

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedAssetPath = selectedAssetId ? getAssetPath(selectedAssetId) : [];

  const handleAssetSelect = (assetId: string) => {
    setSelectedAssetId(assetId);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const searchResults = searchQuery ? searchAssets(searchQuery) : [];

  return (
    <>
      <div className="p-6 space-y-6">
      <div className="glass-strong cosmic-glow rounded-2xl p-6">
        <h1 className="text-2xl font-bold text-foreground mb-4">Asset Hierarchy Demo</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tree View */}
          <div className="lg:col-span-2">
            <AssetTree
              onAssetSelect={handleAssetSelect}
              selectedAssetId={selectedAssetId}
              onCreateAsset={handleCreateAssetForTree}
            />
          </div>

          {/* Info Panel */}
          <div className="space-y-4">
            {/* Search */}
            <div className="glass rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-2">Search Assets</h3>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by name..."
                className="w-full px-3 py-2 bg-background border border-glass-border/30 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {searchResults.length > 0 && (
                <div className="mt-2 space-y-1">
                  {searchResults.map((asset) => (
                    <div
                      key={asset.id}
                      onClick={() => handleAssetSelect(asset.id)}
                      className="px-2 py-1 text-sm hover:bg-glass-border/20 rounded cursor-pointer"
                    >
                      {asset.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Asset Info */}
            {selectedAssetId && assets[selectedAssetId] && (
              <div className="glass rounded-lg p-4">
                <h3 className="text-sm font-semibold text-foreground mb-2">Selected Asset</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name:</span>
                    <span className="ml-2">{assets[selectedAssetId].name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Type:</span>
                    <span className="ml-2">{assets[selectedAssetId].type}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">ID:</span>
                    <span className="ml-2 font-mono text-xs">{selectedAssetId}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Children:</span>
                    <span className="ml-2">{assets[selectedAssetId].children.length}</span>
                  </div>
                </div>

                {/* Path */}
                {selectedAssetPath.length > 1 && (
                  <div className="mt-3 pt-3 border-t border-glass-border/20">
                    <div className="text-xs text-muted-foreground mb-1">Path:</div>
                    <div className="text-xs">
                      {selectedAssetPath.map((asset, index) => (
                        <span key={asset.id}>
                          {asset.name}
                          {index < selectedAssetPath.length - 1 && ' / '}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 pt-3 border-t border-glass-border/20 space-y-2">
                  <button
                    onClick={() => {
                      const name = prompt('Enter new child asset name:');
                      if (name) {
                        setModalInitialData({
                          name,
                          type: 'other',
                          x: Math.random() * 400,
                          y: Math.random() * 300,
                          width: 200,
                          height: 150,
                        });
                        setIsModalOpen(true);
                      }
                    }}
                    className="w-full px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 transition-colors"
                  >
                    Add Child
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this asset and all its children?')) {
                        deleteAsset(selectedAssetId);
                        setSelectedAssetId(null);
                      }
                    }}
                    className="w-full px-3 py-1 bg-destructive text-destructive-foreground rounded text-sm hover:bg-destructive/90 transition-colors"
                  >
                    Delete Asset
                  </button>
                </div>
              </div>
            )}

            {/* Statistics */}
            <div className="glass rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-2">Statistics</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Assets:</span>
                  <span>{Object.keys(assets).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Root Assets:</span>
                  <span>{getRootAssets().length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Depth:</span>
                  <span>
                    {Math.max(...getAssetTree().map(asset => 
                      getAssetPath(asset.id).length - 1
                    ), 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
      
    {/* Asset Creation Modal */}
      <AssetCreationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialData={modalInitialData}
      />
    </>
  );
};
