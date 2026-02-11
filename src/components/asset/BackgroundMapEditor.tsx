import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, Upload, Maximize2 } from 'lucide-react';
import { useAssetStore } from '@/stores/assetStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Asset } from '@/components/AssetItem';

interface BackgroundConfig {
  isClear?: boolean;
  color?: string;
  image?: string;
  position?: { x: number; y: number };
  scale?: number;
  gridSize?: number;
  imageSize?: { width: number; height: number };
}

interface BackgroundMapEditorProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string | null;
  viewportSize?: { width: number; height: number };
  onSave?: () => void;
}

export function BackgroundMapEditor({ isOpen, onClose, assetId, viewportSize: _viewportSize, onSave }: BackgroundMapEditorProps) {
  const { assets, updateAsset } = useAssetStore();
  
  // Hook to get actual window size
  const [windowSize, setWindowSize] = useState({ width: 800, height: 600 });
  
  useEffect(() => {
    const updateWindowSize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    updateWindowSize();
    window.addEventListener('resize', updateWindowSize);
    return () => window.removeEventListener('resize', updateWindowSize);
  }, []);
  
  const asset = assetId ? assets[assetId] : null;
  
  // Create a virtual root asset for background management when no assetId is provided
  const virtualRootAsset: Asset = useMemo(() => asset || {
    id: 'root',
    name: 'Root Background',
    type: 'other',
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    description: '',
    customFields: [],
    customFieldValues: [],
    tags: [],
    children: [],
    parentId: null,
    backgroundConfig: {
      isClear: true,
      color: '#000000',
      image: '',
      position: { x: 0, y: 0 },
      scale: 1,
      gridSize: 40,
    },
    viewportConfig: {
      zoom: 1,
      panX: 0,
      panY: 0,
    },
    viewportDisplaySettings: {
      name: true,
      description: true,
      thumbnail: true,
      portraitBlur: 0,
    },
  }, [asset]);
  
  const previewRef = useRef<HTMLDivElement>(null);
  
  const [backgroundConfig, setBackgroundConfig] = useState<BackgroundConfig>({
    isClear: true,
    color: '#000000',
    image: '',
    position: { x: 0, y: 0 },
    scale: 1,
    gridSize: 40,
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [showAssetOverlay, setShowAssetOverlay] = useState(true);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  
  const actualViewportSize = windowSize;

  const getRenderedImageSize = () => {
    const scale = backgroundConfig.scale ?? 1;
    const size = backgroundConfig.imageSize || imageNaturalSize;
    if (!size) return null;
    return {
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
    };
  };

  const clampPositionToViewport = (pos: { x: number; y: number }) => {
    const rendered = getRenderedImageSize();
    if (!rendered) return pos;

    // Allow free movement for all images regardless of size
    // This gives users freedom to position images and have open space around them
    const maxOffset = Math.max(rendered.width, rendered.height, actualViewportSize.width, actualViewportSize.height) * 3;
    
    return {
      x: Math.max(-maxOffset, Math.min(maxOffset, pos.x)),
      y: Math.max(-maxOffset, Math.min(maxOffset, pos.y)),
    };
  };

  // Initialize background config when asset changes
  useEffect(() => {
    let config = virtualRootAsset.backgroundConfig || {};
    
    // For root asset, try to load from localStorage first
    if (!asset) {
      try {
        const stored = localStorage.getItem('rootBackgroundConfig');
        if (stored) {
          config = JSON.parse(stored);
        }
      } catch {
        // Use default config if localStorage fails
      }
    }
    
    setBackgroundConfig({
      isClear: config.isClear !== false, // Default to true
      color: config.color || '#000000',
      image: config.image || '',
      position: config.position || { x: 0, y: 0 },
      scale: config.scale || 1,
      gridSize: config.gridSize || 40,
      imageSize: config.imageSize,
    });
    setImageOffset(config.position || { x: 0, y: 0 });
    setImageNaturalSize(null);
    setHasUnsavedChanges(false);
  }, [virtualRootAsset, asset]);

  useEffect(() => {
    if (!backgroundConfig.image) {
      setImageNaturalSize(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const newSize = { width: img.naturalWidth, height: img.naturalHeight };
      setImageNaturalSize(newSize);
      setBackgroundConfig(prev => {
        if (prev.imageSize && prev.imageSize.width === newSize.width && prev.imageSize.height === newSize.height) {
          return prev;
        }
        return { ...prev, imageSize: newSize };
      });
    };
    img.src = backgroundConfig.image;
  }, [backgroundConfig.image]);

  useEffect(() => {
    if (!backgroundConfig.image) return;
    const clamped = clampPositionToViewport(backgroundConfig.position || { x: 0, y: 0 });
    if (clamped.x !== (backgroundConfig.position?.x || 0) || clamped.y !== (backgroundConfig.position?.y || 0)) {
      setImageOffset(clamped);
      setBackgroundConfig(prev => ({ ...prev, position: clamped }));
      setHasUnsavedChanges(true);
    }
  }, [backgroundConfig.scale, backgroundConfig.imageSize, windowSize.width, windowSize.height]);

  const handleCloseAttempt = () => {
    if (hasChangesFromInitial) {
      if (confirm('You have unsaved changes. Are you sure you want to exit without saving?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleSave = () => {
    if (!asset) {
      // For root background, store in localStorage
      localStorage.setItem('rootBackgroundConfig', JSON.stringify(backgroundConfig));
      setHasUnsavedChanges(false);
      // Trigger callback to update the display immediately
      if (onSave) {
        onSave();
      }
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('backgroundSaved'));
      onClose();
      return;
    }
    
    try {
      updateAsset(asset.id, {
        backgroundConfig,
      });
      
      setHasUnsavedChanges(false);
      // Trigger callback to update the display immediately
      if (onSave) {
        onSave();
      }
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('backgroundSaved'));
      onClose();
    } catch (error) {
      console.error('Failed to save background map:', error);
      alert('Failed to save background map. Please try again.');
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setBackgroundConfig(prev => ({ ...prev, image: result }));
        setHasUnsavedChanges(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveBackground = () => {
    setBackgroundConfig(prev => ({ ...prev, image: '' }));
    setHasUnsavedChanges(true);
  };

  const updateConfig = (updates: Partial<BackgroundConfig>) => {
    setBackgroundConfig(prev => {
      const next = { ...prev, ...updates };
      if (updates.position) {
        next.position = clampPositionToViewport(updates.position);
      }
      return next;
    });
    setHasUnsavedChanges(true);
  };

  // Enhanced change detection
  const hasChangesFromInitial = useMemo(() => {
    const initial = virtualRootAsset.backgroundConfig || {};
    
    // For root asset, compare with localStorage or defaults
    const compareWith = !asset ? (() => {
      try {
        const stored = localStorage.getItem('rootBackgroundConfig');
        return stored ? JSON.parse(stored) : {};
      } catch {
        return {};
      }
    })() : initial;

    return JSON.stringify(backgroundConfig) !== JSON.stringify({
      isClear: compareWith.isClear !== false,
      color: compareWith.color || '#000000',
      image: compareWith.image || '',
      position: compareWith.position || { x: 0, y: 0 },
      scale: compareWith.scale || 1,
      gridSize: compareWith.gridSize || 40,
      imageSize: compareWith.imageSize,
    });
  }, [backgroundConfig, virtualRootAsset, asset]);

  // Drag handlers for preview area
  const handlePreviewMouseDown = (e: React.MouseEvent) => {
    if (!backgroundConfig.image) return;
    
    e.preventDefault();
    setIsDragging(true);

    const previewRect = previewRef.current?.getBoundingClientRect();
    if (!previewRect) return;
    const startX = e.clientX - previewRect.left - imageOffset.x;
    const startY = e.clientY - previewRect.top - imageOffset.y;
    setDragStart({ x: startX, y: startY });
  };

  const handlePreviewMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !backgroundConfig.image) return;
    
    const previewRect = previewRef.current?.getBoundingClientRect();
    if (!previewRect) return;

    const newX = e.clientX - previewRect.left - dragStart.x;
    const newY = e.clientY - previewRect.top - dragStart.y;
    const clamped = clampPositionToViewport({ x: newX, y: newY });

    setImageOffset(clamped);
    updateConfig({ position: clamped });
  };

  const handlePreviewMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        const previewRect = previewRef.current?.getBoundingClientRect();
        if (!previewRect) return;

        const newX = e.clientX - previewRect.left - dragStart.x;
        const newY = e.clientY - previewRect.top - dragStart.y;
        const clamped = clampPositionToViewport({ x: newX, y: newY });

        setImageOffset(clamped);
        updateConfig({ position: clamped });
      };

      const handleGlobalMouseUp = () => {
        setIsDragging(false);
      };

      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  return (
    <Dialog open={isOpen} onOpenChange={handleCloseAttempt}>
      <DialogContent className="fixed inset-0 w-screen h-screen max-w-none translate-x-0 translate-y-0 left-0 top-0 p-0 glass cosmic-glow border-glass-border/40">
        <div className="relative w-full h-full">
          <div
            ref={previewRef}
            className={`absolute inset-0 cursor-move ${backgroundConfig.isClear ? 'glass cosmic-glow' : ''}`}
            style={{
              backgroundColor: backgroundConfig.isClear ? 'transparent' : (backgroundConfig.color || '#000000'),
              backgroundImage: backgroundConfig.image ? `url(${backgroundConfig.image})` : 'none',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: `${imageOffset.x}px ${imageOffset.y}px`,
              backgroundSize: (() => {
                const rendered = getRenderedImageSize();
                if (rendered) return `${rendered.width}px ${rendered.height}px`;
                return 'auto';
              })(),
            }}
            onMouseDown={handlePreviewMouseDown}
            onMouseMove={handlePreviewMouseMove}
            onMouseUp={handlePreviewMouseUp}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `
                  linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)
                `,
                backgroundSize: `${backgroundConfig.gridSize}px ${backgroundConfig.gridSize}px`,
              }}
            />

            {showAssetOverlay && (
              <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none">
                Viewport: {actualViewportSize.width}×{actualViewportSize.height}
              </div>
            )}

            <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none">
              Position: ({Math.round(imageOffset.x)}, {Math.round(imageOffset.y)}) | Scale: {backgroundConfig.scale?.toFixed(2)}
            </div>
          </div>

          <div className="absolute top-4 left-4 w-[380px] max-h-[calc(100vh-2rem)] overflow-auto glass cosmic-glow border border-glass-border/40 rounded-md p-3 space-y-4 scale-95 origin-top-left">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-lg font-bold">
                  Background Map Editor - {virtualRootAsset.name}
                </DialogTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"
                  onClick={handleCloseAttempt}
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              <h3 className="text-base font-semibold text-foreground">Background Image</h3>

              {backgroundConfig.image ? (
                <div className="relative group">
                  <img
                    src={backgroundConfig.image}
                    alt="Background preview"
                    className="w-full h-32 object-cover rounded-md border border-glass-border/40"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={handleRemoveBackground}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-glass-border/40 rounded-md p-6 bg-glass/20">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="bg-upload"
                  />
                  <label
                    htmlFor="bg-upload"
                    className="flex flex-col items-center justify-center cursor-pointer hover:text-muted-foreground transition-colors"
                  >
                    <Upload className="w-12 h-12 mb-3" />
                    <span className="text-base font-medium">Click to upload background map</span>
                    <span className="text-sm text-muted-foreground">PNG, JPG, GIF up to 10MB</span>
                  </label>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-semibold text-foreground">Background Type</h3>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="clear-bg">Use Glassmorphic Background</Label>
                  <p className="text-sm text-muted-foreground">
                    When enabled, shows the glass effect instead of a solid color
                  </p>
                </div>
                <Switch
                  id="clear-bg"
                  checked={backgroundConfig.isClear}
                  onCheckedChange={(checked) => updateConfig({ isClear: checked })}
                />
              </div>

              {!backgroundConfig.isClear && (
                <div className="space-y-2">
                  <Label htmlFor="bg-color">Background Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="bg-color"
                      type="color"
                      value={backgroundConfig.color || '#000000'}
                      onChange={(e) => updateConfig({ color: e.target.value })}
                      className="w-20 h-10 bg-glass/50 border-glass-border/40"
                    />
                    <Input
                      type="text"
                      value={backgroundConfig.color || '#000000'}
                      onChange={(e) => updateConfig({ color: e.target.value })}
                      className="flex-1 bg-glass/50 border-glass-border/40"
                      placeholder="#000000"
                    />
                  </div>
                </div>
              )}
            </div>

            {backgroundConfig.image && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-foreground">Position & Scale</h3>

                <div className="flex items-center justify-between">
                  <Label>True Viewport Preview (Drag on the canvas)</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
                      }}
                      className="text-xs"
                    >
                      <Maximize2 className="w-3 h-3 mr-1" />
                      Refresh
                    </Button>
                    <Switch
                      id="show-overlay"
                      checked={showAssetOverlay}
                      onCheckedChange={setShowAssetOverlay}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pos-x">X Position</Label>
                    <Input
                      id="pos-x"
                      type="number"
                      value={backgroundConfig.position?.x || 0}
                      onChange={(e) => updateConfig({
                        position: { ...backgroundConfig.position, x: Number(e.target.value) }
                      })}
                      className="bg-glass/50 border-glass-border/40"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pos-y">Y Position</Label>
                    <Input
                      id="pos-y"
                      type="number"
                      value={backgroundConfig.position?.y || 0}
                      onChange={(e) => updateConfig({
                        position: { ...backgroundConfig.position, y: Number(e.target.value) }
                      })}
                      className="bg-glass/50 border-glass-border/40"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="scale">Scale</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="scale-input"
                        type="number"
                        min="0.1"
                        max="3"
                        step="0.01"
                        value={backgroundConfig.scale?.toFixed(2) || '1.00'}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (!isNaN(value) && value >= 0.1 && value <= 3) {
                            updateConfig({ scale: value });
                          }
                        }}
                        className="w-20 h-8 bg-glass/50 border-glass-border/40 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">×{backgroundConfig.scale?.toFixed(2) || '1.00'}</span>
                    </div>
                  </div>
                  <Slider
                    id="scale"
                    min={0.1}
                    max={3}
                    step={0.01}
                    value={[backgroundConfig.scale || 1]}
                    onValueChange={([value]) => updateConfig({ scale: value })}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-base font-semibold text-foreground">Grid Settings</h3>

              <div className="space-y-2">
                <Label htmlFor="grid-size">Grid Size: {backgroundConfig.gridSize}px</Label>
                <Input
                  id="grid-size"
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={backgroundConfig.gridSize || 40}
                  onChange={(e) => updateConfig({ gridSize: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCloseAttempt}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!hasChangesFromInitial}>
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
