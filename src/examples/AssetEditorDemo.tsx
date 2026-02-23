import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AssetEditModal } from '@/components/AssetEditModal';
import { GeneratorModal } from '@/components/GeneratorModal';
import { useAssetStore } from '@/stores/assetStore';
import { Edit, Download, Plus } from 'lucide-react';
import type { Asset } from '@/components/AssetItem';

export function AssetEditorDemo() {
  const { assets, createAsset, updateAsset } = useAssetStore();
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

  const handleImportAsset = (assetData: Omit<Asset, 'id' | 'x' | 'y' | 'parentId' | 'children'>) => {
    const newAssetId = createAsset({
      ...assetData,
      x: Math.random() * 400,
      y: Math.random() * 300,
    });
    console.log('Created new asset with ID:', newAssetId);
  };

  const createSampleAsset = () => {
    const sampleAsset = {
      name: 'Sample Character',
      type: 'other' as const,
      x: 100,
      y: 100,
      description: 'A sample character for testing',
      customFields: [
        {
          id: crypto.randomUUID(),
          name: 'Class',
          value: 'Warrior',
          showOnCanvas: true,
        },
        {
          id: crypto.randomUUID(),
          name: 'Level',
          value: '5',
          showOnCanvas: true,
        },
        {
          id: crypto.randomUUID(),
          name: 'Background',
          value: 'Former soldier turned adventurer',
          showOnCanvas: false,
        },
      ],
      tags: ['NPC', 'Character'],
    };

    createAsset(sampleAsset);
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
          <Button onClick={createSampleAsset} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Create Sample Asset
          </Button>
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
                        <span className="font-medium">{field.name}:</span>
                        <span className="text-muted-foreground">{field.value}</span>
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
              No assets created yet. Create a sample asset or import from a generator to get started.
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={createSampleAsset} variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Create Sample Asset
              </Button>
              <Button onClick={() => setIsGeneratorModalOpen(true)}>
                <Download className="w-4 h-4 mr-2" />
                Import from Generator
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AssetEditModal
        asset={selectedAsset}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedAsset(null);
        }}
        onSave={handleSaveAsset}
      />

      <GeneratorModal
        isOpen={isGeneratorModalOpen}
        onClose={() => setIsGeneratorModalOpen(false)}
        onImport={handleImportAsset}
      />
    </div>
  );
}
