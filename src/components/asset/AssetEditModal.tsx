import { useState, useEffect } from 'react';
import { X, Save, Upload } from 'lucide-react';
import { useAssetStore } from '@/stores/assetStore';
import { useTagStore } from '@/stores/tagStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CustomFieldsManager } from './CustomFieldsManager';
import { ViewportDisplaySettingsManager } from './ViewportDisplaySettingsManager';
import type { Asset } from '@/components/AssetItem';
import type { CustomField, CustomFieldValue, ViewportDisplaySettings } from '@/types/extendedAsset';

interface AssetEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId?: string | null;
  isNewAsset?: boolean;
}

export function AssetEditModal({ isOpen, onClose, assetId, isNewAsset = false }: AssetEditModalProps) {
  const { assets, createAsset, updateAsset } = useAssetStore();
  const { tags } = useTagStore();
  
  const asset = assetId ? assets[assetId] : null;
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    thumbnail: '',
    background: '',
    tags: [] as string[],
  });
  
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<CustomFieldValue[]>([]);
  const [viewportDisplaySettings, setViewportDisplaySettings] = useState<ViewportDisplaySettings>({
    name: true,
    description: false,
    thumbnail: true,
    portraitBlur: 0,
  });

  // Initialize form data when asset changes
  useEffect(() => {
    if (asset) {
      setFormData({
        name: asset.name || '',
        description: asset.description || '',
        thumbnail: asset.thumbnail || '',
        background: asset.background || '',
        tags: asset.tags || [],
      });
      setCustomFields(asset.customFields || []);
      setCustomFieldValues(asset.customFieldValues || []);
      setViewportDisplaySettings(asset.viewportDisplaySettings || {
        name: true,
        description: false,
        thumbnail: true,
        portraitBlur: 0,
      });
    } else if (isNewAsset) {
      // Reset for new asset
      setFormData({
        name: '',
        description: '',
        thumbnail: '',
        background: '',
        tags: [],
      });
      setCustomFields([]);
      setCustomFieldValues([]);
      setViewportDisplaySettings({
        name: true,
        description: false,
        thumbnail: true,
        portraitBlur: 0,
      });
    }
  }, [asset, isNewAsset]);

  const handleSave = () => {
    try {
      const assetData = {
        ...formData,
        customFields,
        customFieldValues,
        viewportDisplaySettings,
      };

      if (isNewAsset || !asset) {
        // Create new asset
        createAsset({
          ...assetData,
          type: 'other',
          x: 100,
          y: 100,
          width: 200,
          height: 150,
        });
      } else {
        // Update existing asset
        updateAsset(asset.id, assetData);
      }
      
      onClose();
    } catch (error) {
      console.error('Failed to save asset:', error);
    }
  };

  const handleImageUpload = (field: 'thumbnail' | 'background', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setFormData(prev => ({ ...prev, [field]: result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTagToggle = (tagId: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tagId)
        ? prev.tags.filter(id => id !== tagId)
        : [...prev.tags, tagId]
    }));
  };

  const availableTags = Object.values(tags);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto glass cosmic-glow border-glass-border/40">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {isNewAsset ? 'Create New Asset' : 'Edit Asset'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Basic Information</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="asset-name">Name *</Label>
                <Input
                  id="asset-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter asset name..."
                  className="bg-glass/50 border-glass-border/40"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="asset-tags">Tags</Label>
                <div className="flex flex-wrap gap-2 p-2 border border-glass-border/40 rounded-md bg-glass/30 min-h-[40px]">
                  {availableTags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={formData.tags.includes(tag.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      style={{ 
                        backgroundColor: formData.tags.includes(tag.id) ? tag.color : undefined,
                        borderColor: tag.color,
                        color: formData.tags.includes(tag.id) ? 'white' : tag.color
                      }}
                      onClick={() => handleTagToggle(tag.id)}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="asset-description">Description</Label>
              <Textarea
                id="asset-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter asset description..."
                rows={3}
                className="bg-glass/50 border-glass-border/40"
              />
            </div>
          </div>

          {/* Images */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Images</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="thumbnail">Thumbnail</Label>
                {formData.thumbnail ? (
                  <div className="relative group">
                    <img
                      src={formData.thumbnail}
                      alt="Thumbnail preview"
                      className="w-full h-32 object-cover rounded-md border border-glass-border/40"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setFormData(prev => ({ ...prev, thumbnail: '' }))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-glass-border/40 rounded-md p-4 bg-glass/20">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload('thumbnail', e)}
                      className="hidden"
                      id="thumbnail-upload"
                    />
                    <label
                      htmlFor="thumbnail-upload"
                      className="flex flex-col items-center justify-center cursor-pointer hover:text-muted-foreground transition-colors"
                    >
                      <Upload className="w-8 h-8 mb-2" />
                      <span className="text-sm">Click to upload thumbnail</span>
                      <span className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB</span>
                    </label>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="background">Background</Label>
                {formData.background ? (
                  <div className="relative group">
                    <img
                      src={formData.background}
                      alt="Background preview"
                      className="w-full h-32 object-cover rounded-md border border-glass-border/40"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setFormData(prev => ({ ...prev, background: '' }))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-glass-border/40 rounded-md p-4 bg-glass/20">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload('background', e)}
                      className="hidden"
                      id="background-upload"
                    />
                    <label
                      htmlFor="background-upload"
                      className="flex flex-col items-center justify-center cursor-pointer hover:text-muted-foreground transition-colors"
                    >
                      <Upload className="w-8 h-8 mb-2" />
                      <span className="text-sm">Click to upload background</span>
                      <span className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Custom Fields */}
          {asset && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Custom Fields</h3>
              <CustomFieldsManager
                assetId={asset.id}
                fields={customFields}
                values={customFieldValues}
              />
            </div>
          )}

          {/* Viewport Display Settings */}
          {asset && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Viewport Display Settings</h3>
              <ViewportDisplaySettingsManager
                assetId={asset.id}
                settings={viewportDisplaySettings}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!formData.name.trim()}>
            <Save className="w-4 h-4 mr-2" />
            {isNewAsset ? 'Create' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
