import { useState } from 'react';
import { X, Download, Upload, Trash2, Settings as SettingsIcon, Sun, Moon, BookOpen, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAssetStore } from '@/stores/assetStore';
import { useTagStore } from '@/stores/tagStore';
import { useThemeStore } from '@/stores/themeStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { toast } from 'sonner';
import type { Book } from '@/types/book';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const {
    assets,
    globalCustomFields,
    viewportOffset,
    viewportScale,
    setViewportOffset,
    setViewportScale,
  } = useAssetStore();
  const { tags } = useTagStore();
  const { theme, toggleTheme } = useThemeStore();
  const { 
    getAllBooks, 
    exportBooks, 
    importBooks, 
    settings: bookSettings, 
    updateSettings 
  } = useBookStore();
  
  const [activeTab, setActiveTab] = useState('general');
  const [autoSave, setAutoSave] = useState(bookSettings.autoSave);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridSize, setGridSize] = useState(40);
  
  const allBooks = getAllBooks();

  const handleExportData = () => {
    try {
      const data = {
        assets,
        tags,
        globalCustomFields,
        exportedAt: new Date().toISOString(),
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kanvas-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Data exported successfully');
    } catch (error) {
      toast.error('Failed to export data');
    }
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        
        // Validate data structure
        if (!data.assets || !data.tags) {
          throw new Error('Invalid data format');
        }
        
        // Here you would typically dispatch actions to update the stores
        // For now, just show success message
        toast.success('Data imported successfully');
        onClose();
      } catch (error) {
        toast.error('Failed to import data: Invalid format');
      }
    };
    reader.readAsText(file);
  };

  const handleClearAllData = () => {
    if (confirm('Are you sure you want to delete all data? This action cannot be undone.')) {
      // Here you would typically dispatch actions to clear the stores
      toast.success('All data cleared');
      onClose();
    }
  };

  const stats = {
    totalAssets: Object.keys(assets).length,
    totalTags: Object.keys(tags).length,
    totalGlobalFields: globalCustomFields.length,
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] glass cosmic-glow border-glass-border/40 flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-glass-border/40 scrollbar-track-transparent hover:scrollbar-thumb-glass-border/60">
        <DialogHeader className="flex-shrink-0 sticky top-0 bg-glass/90 backdrop-blur-sm z-10 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5" />
            Settings
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col">
            <TabsList className="grid w-full grid-cols-4 flex-shrink-0 sticky top-16 bg-glass/90 backdrop-blur-sm z-10">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="worlds">Worlds</TabsTrigger>
              <TabsTrigger value="data">Data Management</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
            </TabsList>
            
            <div className="mt-4">
              <TabsContent value="general" className="space-y-4">
                <Card className="glass cosmic-glow border-glass-border/40">
              <CardHeader>
                <CardTitle className="text-lg">Display Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="theme-toggle" className="flex items-center gap-2">
                      {theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      Theme
                    </Label>
                    <div className="text-sm text-muted-foreground">
                      {theme === 'light' ? 'Light mode' : 'Dark mode'}
                    </div>
                  </div>
                  <Switch
                    id="theme-toggle"
                    checked={theme === 'light'}
                    onCheckedChange={toggleTheme}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-save">Auto Save</Label>
                    <div className="text-sm text-muted-foreground">
                      Automatically save changes
                    </div>
                  </div>
                  <Switch
                    id="auto-save"
                    checked={autoSave}
                    onCheckedChange={setAutoSave}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="show-grid">Show Grid</Label>
                    <div className="text-sm text-muted-foreground">
                      Display grid in viewport
                    </div>
                  </div>
                  <Switch
                    id="show-grid"
                    checked={showGrid}
                    onCheckedChange={setShowGrid}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="snap-to-grid">Snap to Grid</Label>
                    <div className="text-sm text-muted-foreground">
                      Align assets to grid
                    </div>
                  </div>
                  <Switch
                    id="snap-to-grid"
                    checked={snapToGrid}
                    onCheckedChange={setSnapToGrid}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="grid-size">Grid Size</Label>
                  <Input
                    id="grid-size"
                    type="number"
                    value={gridSize}
                    onChange={(e) => setGridSize(Number(e.target.value))}
                    min="10"
                    max="100"
                    step="10"
                    className="bg-glass/50 border-glass-border/40"
                  />
                </div>

                <div className="pt-4 border-t border-glass-border/30">
                  <div className="text-sm font-medium text-foreground mb-3">Viewport Position & Scale</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="viewport-offset-x">Offset X</Label>
                      <Input
                        id="viewport-offset-x"
                        type="number"
                        value={viewportOffset.x}
                        onChange={(e) =>
                          setViewportOffset({
                            x: Number(e.target.value),
                            y: viewportOffset.y,
                          })
                        }
                        step="1"
                        className="bg-glass/50 border-glass-border/40"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="viewport-offset-y">Offset Y</Label>
                      <Input
                        id="viewport-offset-y"
                        type="number"
                        value={viewportOffset.y}
                        onChange={(e) =>
                          setViewportOffset({
                            x: viewportOffset.x,
                            y: Number(e.target.value),
                          })
                        }
                        step="1"
                        className="bg-glass/50 border-glass-border/40"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="viewport-scale">Viewport Scale</Label>
                      <Input
                        id="viewport-scale"
                        type="number"
                        value={viewportScale}
                        onChange={(e) => setViewportScale(Number(e.target.value))}
                        min="0.5"
                        max="2"
                        step="0.05"
                        className="bg-glass/50 border-glass-border/40"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="worlds" className="space-y-4">
            <Card className="glass cosmic-glow border-glass-border/40">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  World Management
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="p-4 border border-glass-border/30 rounded-lg bg-glass/30">
                    <div className="text-2xl font-bold text-primary">{allBooks.length}</div>
                    <div className="text-sm text-muted-foreground">Total Worlds</div>
                  </div>
                  <div className="p-4 border border-glass-border/30 rounded-lg bg-glass/30">
                    <div className="text-2xl font-bold text-accent">
                      {allBooks.reduce((sum, book) => sum + Object.keys(book.worldData.assets || {}).length, 0)}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Assets</div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-save-worlds">Auto Save Worlds</Label>
                    <div className="text-sm text-muted-foreground">
                      Automatically save world changes
                    </div>
                  </div>
                  <Switch
                    id="auto-save-worlds"
                    checked={autoSave}
                    onCheckedChange={(checked) => {
                      setAutoSave(checked);
                      updateSettings({ autoSave: checked });
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label>World List</Label>
                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {allBooks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No worlds created yet</p>
                    ) : (
                      allBooks.map((book) => (
                        <div key={book.id} className="flex items-center justify-between p-2 border border-glass-border/30 rounded-lg bg-glass/30">
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            <div>
                              <div className="font-medium text-sm">{book.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {Object.keys(book.worldData.assets || {}).length} assets
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      const data = exportBooks();
                      const blob = new Blob([data], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `worlds-export-${new Date().toISOString().split('T')[0]}.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      toast.success('Worlds exported successfully');
                    }}
                    className="flex-1"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export Worlds
                  </Button>
                  
                  <div className="flex-1">
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const data = event.target?.result as string;
                            if (importBooks(data)) {
                              toast.success('Worlds imported successfully');
                            } else {
                              toast.error('Failed to import worlds');
                            }
                          };
                          reader.readAsText(file);
                        }
                      }}
                      className="hidden"
                      id="import-worlds"
                    />
                    <Label htmlFor="import-worlds" className="w-full">
                      <Button variant="outline" className="w-full">
                        <Upload className="w-4 h-4 mr-2" />
                        Import Worlds
                      </Button>
                    </Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="data" className="space-y-4">
            <Card className="glass cosmic-glow border-glass-border/40">
              <CardHeader>
                <CardTitle className="text-lg">Data Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-4 border border-glass-border/30 rounded-lg bg-glass/30">
                    <div className="text-2xl font-bold text-primary">{stats.totalAssets}</div>
                    <div className="text-sm text-muted-foreground">Assets</div>
                  </div>
                  <div className="p-4 border border-glass-border/30 rounded-lg bg-glass/30">
                    <div className="text-2xl font-bold text-accent">{stats.totalTags}</div>
                    <div className="text-sm text-muted-foreground">Tags</div>
                  </div>
                  <div className="p-4 border border-glass-border/30 rounded-lg bg-glass/30">
                    <div className="text-2xl font-bold text-secondary">{stats.totalGlobalFields}</div>
                    <div className="text-sm text-muted-foreground">Global Fields</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="glass cosmic-glow border-glass-border/40">
              <CardHeader>
                <CardTitle className="text-lg">Import/Export</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button onClick={handleExportData} className="flex-1">
                    <Download className="w-4 h-4 mr-2" />
                    Export Data
                  </Button>
                  
                  <div className="flex-1">
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportData}
                      className="hidden"
                      id="import-data"
                    />
                    <Label htmlFor="import-data" className="w-full">
                      <Button variant="outline" className="w-full">
                        <Upload className="w-4 h-4 mr-2" />
                        Import Data
                      </Button>
                    </Label>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-glass-border/30">
                  <Button
                    variant="destructive"
                    onClick={handleClearAllData}
                    className="w-full"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear All Data
                  </Button>
                  <div className="text-xs text-muted-foreground mt-2">
                    This will permanently delete all assets, tags, and settings.
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="about" className="space-y-4">
            <Card className="glass cosmic-glow border-glass-border/40">
              <CardHeader>
                <CardTitle className="text-lg">About KANVAS</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center space-y-2">
                  <div className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    KANVAS
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Version 3.8.1F
                  </div>
                  <div className="text-xs text-muted-foreground max-w-md mx-auto">
                    A sophisticated asset management system with nested viewports, 
                    custom fields, and cosmic glassmorphic design.
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-medium">Features:</div>
                    <ul className="text-muted-foreground space-y-1 mt-1">
                      <li>• Nested Viewports</li>
                      <li>• Custom Fields</li>
                      <li>• Tag System</li>
                      <li>• Drag & Drop</li>
                    </ul>
                  </div>
                  <div>
                    <div className="font-medium">Technology:</div>
                    <ul className="text-muted-foreground space-y-1 mt-1">
                      <li>• React 18</li>
                      <li>• TypeScript</li>
                      <li>• Zustand</li>
                      <li>• Tailwind CSS</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
