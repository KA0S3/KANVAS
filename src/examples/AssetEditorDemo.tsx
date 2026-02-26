import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AssetEditModal } from '@/components/asset/AssetEditModal';
import { GeneratorModal } from '@/components/GeneratorModal';
import { useAssetStore } from '@/stores/assetStore';
import { Edit, Download, Plus } from 'lucide-react';
import type { Asset } from '@/components/AssetItem';

export function AssetEditorDemo() {
  const { assets, updateAsset } = useAssetStore();
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState(false);

  const handleEditAsset = (asset: Asset) => {
    setSelectedAsset(asset);
    setIsEditModalOpen(true);
  };

  const handleSaveAsset = (updatedAsset: Asset) => {
    updateAsset(updatedAsset.id, updatedAsset);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Asset Editor Demo</h1>
          <p className="text-muted-foreground">
            Test the Asset Edit Modal and Generator Parser features
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsGeneratorModalOpen(true)}>
            <Download className="w-4 h-4 mr-2" />
            Import from Generator
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.values(assets).map((asset) => (
          <Card key={asset.id} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg">{asset.name}</CardTitle>
              <CardDescription>
                {asset.type} • {asset.customFields.length} custom fields
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {asset.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {asset.description}
                  </p>
                )}
                
                {asset.customFields.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Custom Fields:</p>
                    {asset.customFields.slice(0, 3).map((field) => (
                      <div key={field.id} className="flex justify-between text-xs">
                        <span className="font-medium">{field.label}:</span>
                        <span className="text-muted-foreground">{field.type}</span>
                      </div>
                    ))}
                    {asset.customFields.length > 3 && (
                      <p className="text-xs text-muted-foreground">
                        +{asset.customFields.length - 3} more fields
                      </p>
                    )}
                  </div>
                )}

                {asset.tags && asset.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {asset.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="mt-4 pt-4 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleEditAsset(asset)}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Asset
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {Object.values(assets).length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              No assets created yet. Import from a generator to get started.
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => setIsGeneratorModalOpen(true)}>
                <Download className="w-4 h-4 mr-2" />
                Import from Generator
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AssetEditModal
        assetId={selectedAsset?.id}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedAsset(null);
        }}
      />

      <GeneratorModal
        isOpen={isGeneratorModalOpen}
        onClose={() => setIsGeneratorModalOpen(false)}
        onImport={() => {
          // Import functionality disabled - use modal instead
          console.log('Import disabled - use Asset Creation Modal instead');
        }}
      />
    </div>
  );
}
