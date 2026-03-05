import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useBookStore } from "@/stores/bookStoreSimple";
import { useAuthStore } from "@/stores/authStore";
import { useAssetStore } from "@/stores/assetStore";
import { useCanCreateBook } from "@/lib/limits";
import { Download, Upload, AlertCircle, CheckCircle, Archive, Lock, Info, Crown, User } from "lucide-react";
import { UpgradePromptModal } from '@/components/UpgradePromptModal';
import { AccountModal } from '@/components/account/AccountModal';
import JSZip from 'jszip';
import { supabase } from '@/lib/supabase';
import type { Asset } from '@/components/AssetItem';

interface DataManagerProps {
  children: React.ReactNode;
}

const DataManager = ({ children }: DataManagerProps) => {
  const [open, setOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [exportChoice, setExportChoice] = useState<'json' | 'zip' | null>(null);
  const [importChoice, setImportChoice] = useState<'replace' | 'new' | null>(null);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const { exportBooks, importBooks, getAllBooks, exportSingleBook } = useBookStore();
  const { user, isAuthenticated, effectiveLimits, plan } = useAuthStore();
  const { getWorldData } = useAssetStore();
  const { canCreate: canCreateBook, reason, upgradePrompt } = useCanCreateBook();

  const getExportLimits = () => {
    if (!isAuthenticated) {
      return {
        jsonExport: { allowed: true, description: 'Current world only', icon: User },
        zipExport: { allowed: false, description: 'Sign in required', icon: Lock },
        bulkExport: { allowed: false, description: 'Sign in required', icon: Lock }
      };
    }

    // Use effectiveLimits instead of direct plan check
    if (effectiveLimits?.source.plan === 'free') {
      return {
        jsonExport: { allowed: true, description: 'Up to 2 worlds', icon: User },
        zipExport: { allowed: true, description: 'Single world', icon: User },
        bulkExport: { allowed: false, description: 'Pro feature', icon: Crown }
      };
    }

    // Pro & Lifetime (or any plan with import/export enabled)
    return {
      jsonExport: { allowed: true, description: 'All worlds', icon: Crown },
      zipExport: { allowed: true, description: 'All worlds', icon: Crown },
      bulkExport: { allowed: true, description: 'All worlds', icon: Crown }
    };
  };

  const exportProjectAsJson = async (bulk: boolean = false) => {
    try {
      const limits = getExportLimits();
      
      if (!limits.jsonExport.allowed) {
        setShowUpgradePrompt(true);
        return;
      }

      if (!isAuthenticated && !bulk) {
        // Guest - export current world only
        const currentBookId = useBookStore.getState().currentBookId;
        if (!currentBookId) {
          setMessage({ type: 'error', text: 'No world selected for export.' });
          setTimeout(() => setMessage(null), 3000);
          return;
        }
        const data = exportSingleBook(currentBookId);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kanvas-world-${currentBookId}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else if (effectiveLimits?.source.plan === 'free' && !bulk) {
        // Free user - export up to 2 worlds
        const allBooks = getAllBooks();
        if (allBooks.length > 2) {
          setMessage({ type: 'error', text: 'Free users can export up to 2 worlds at a time. Please upgrade for bulk export.' });
          setTimeout(() => setMessage(null), 5000);
          return;
        }
        const data = exportBooks();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kanvas-worlds-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Pro/Lifetime or bulk export
        const data = exportBooks();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kanvas-worlds-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      
      setMessage({ type: 'success', text: 'World data exported successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to export world data.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const fetchAssetFromCloud = async (assetPath: string): Promise<Blob | null> => {
    try {
      const { data, error } = await supabase.storage
        .from('assets')
        .createSignedUrl(assetPath, 3600); // 1 hour expiry
      
      if (error) {
        console.warn('Failed to create signed URL for asset:', assetPath, error);
        return null;
      }
      
      const response = await fetch(data.signedUrl);
      if (!response.ok) {
        console.warn('Failed to fetch asset:', assetPath, response.statusText);
        return null;
      }
      
      return await response.blob();
    } catch (error) {
      console.error('Error fetching cloud asset:', assetPath, error);
      return null;
    }
  };

  const getAssetFromIndexedDB = async (assetId: string): Promise<Blob | null> => {
    try {
      const dbName = 'KanvasAssetDB';
      const storeName = 'assets';
      
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName);
        
        request.onerror = () => {
          console.warn('Failed to open IndexedDB:', request.error);
          resolve(null);
        };
        
        request.onsuccess = () => {
          const db = request.result;
          
          if (!db.objectStoreNames.contains(storeName)) {
            console.warn('Asset store not found in IndexedDB');
            resolve(null);
            return;
          }
          
          const transaction = db.transaction([storeName], 'readonly');
          const store = transaction.objectStore(storeName);
          const getRequest = store.get(assetId);
          
          getRequest.onsuccess = () => {
            const result = getRequest.result;
            if (result && result.blob) {
              resolve(result.blob);
            } else {
              resolve(null);
            }
          };
          
          getRequest.onerror = () => {
            console.warn('Failed to get asset from IndexedDB:', getRequest.error);
            resolve(null);
          };
        };
      });
    } catch (error) {
      console.error('Error accessing IndexedDB:', error);
      return null;
    }
  };

  const exportProjectAsZip = async (bulk: boolean = false) => {
    const limits = getExportLimits();
    
    if (!limits.zipExport.allowed) {
      if (!isAuthenticated) {
        setShowAccountModal(true);
      } else {
        setShowUpgradePrompt(true);
      }
      return;
    }

    if (!effectiveLimits?.importExportEnabled) {
      setMessage({ 
        type: 'error', 
        text: 'Export is not available on your current plan. Please upgrade to Pro or Lifetime to enable this feature.' 
      });
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    // Check if bulk export is allowed
    if (bulk && !limits.bulkExport.allowed) {
      if (!isAuthenticated) {
        setShowAccountModal(true);
      } else {
        setShowUpgradePrompt(true);
      }
      return;
    }

    setIsExporting(true);
    try {
      const zip = new JSZip();
      
      // Get world data based on export type
      let worldData;
      let booksData;
      let assetsToInclude;
      
      if (!isAuthenticated) {
        // Guest - current world only
        const currentBookId = useBookStore.getState().currentBookId;
        if (!currentBookId) {
          setMessage({ type: 'error', text: 'No world selected for export.' });
          setTimeout(() => setMessage(null), 3000);
          return;
        }
        booksData = exportSingleBook(currentBookId);
        worldData = getWorldData();
        assetsToInclude = Object.values(worldData.assets) as Asset[];
      } else if (effectiveLimits?.source.plan === 'free' && !bulk) {
        // Free user - single world export
        const allBooks = getAllBooks();
        if (allBooks.length > 1) {
          // For free users with multiple worlds, export the first one
          const firstBook = allBooks[0];
          booksData = exportSingleBook(firstBook.id);
          worldData = getWorldData();
          assetsToInclude = Object.values(worldData.assets) as Asset[];
        } else {
          booksData = exportBooks();
          worldData = getWorldData();
          assetsToInclude = Object.values(worldData.assets) as Asset[];
        }
      } else {
        // Pro/Lifetime or bulk export
        booksData = exportBooks();
        worldData = getWorldData();
        assetsToInclude = Object.values(worldData.assets) as Asset[];
      }
      
      const projectData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        exportType: bulk ? 'bulk' : 'single',
        worlds: JSON.parse(booksData),
        assets: worldData
      };
      zip.file('project.json', JSON.stringify(projectData, null, 2));
      
      // Collect assets
      const assetsFolder = zip.folder('assets');
      
      for (const asset of assetsToInclude) {
        if (asset.type === 'image' && (asset.thumbnail || asset.background)) {
          let assetBlob: Blob | null = null;
          
          // Try to fetch from cloud first if it has cloud path
          if (asset.cloudPath) {
            assetBlob = await fetchAssetFromCloud(asset.cloudPath);
          }
          
          // Fallback to IndexedDB for local-only assets
          if (!assetBlob) {
            assetBlob = await getAssetFromIndexedDB(asset.id);
          }
          
          // If we have the blob, add it to the zip
          if (assetBlob) {
            const filename = `${asset.id}.${asset.cloudPath?.split('.').pop() || 'png'}`;
            assetsFolder?.file(filename, assetBlob);
          } else {
            console.warn('Could not retrieve asset:', asset.id, asset.cloudPath);
          }
        }
      }
      
      // Generate the zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Trigger browser download
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kanvas-project-${bulk ? 'bulk' : 'single'}-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setMessage({ type: 'success', text: `Project exported successfully${bulk ? ' (all worlds)' : ' (single world)'} with all assets!` });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Export error:', error);
      setMessage({ type: 'error', text: 'Failed to export project. Please try again.' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleJsonExport = () => exportProjectAsJson(false);
  const handleBulkJsonExport = () => exportProjectAsJson(true);
  const handleZipExport = () => exportProjectAsZip(false);
  const handleBulkZipExport = () => exportProjectAsZip(true);

  const handleUpgradeAction = () => {
    if (reason === 'guest_limit') {
      setShowAccountModal(true);
    } else if (reason === 'plan_limit') {
      // TODO: Navigate to upgrade page or open upgrade modal
      console.log('Navigate to upgrade flow');
    }
  };

  const checkImportLimits = (importedBooksCount: number, importAsNew: boolean = false): boolean => {
    const currentBooks = getAllBooks();
    const totalAfterImport = importAsNew ? currentBooks.length + importedBooksCount : importedBooksCount;
    
    // Get current auth state
    const { isAuthenticated, plan, effectiveLimits } = useAuthStore.getState();
    
    // Guest users - max 1 book
    if (!isAuthenticated) {
      return totalAfterImport <= 1;
    }
    
    // Check effective limits first (owner keys, licenses, etc.)
    if (effectiveLimits?.maxBooks !== undefined) {
      if (effectiveLimits.maxBooks === -1 || effectiveLimits.maxBooks === Infinity) {
        return true; // Unlimited books
      }
      return totalAfterImport <= effectiveLimits.maxBooks;
    }
    
    // Fallback to plan-based limits using canonical config
    const maxBooksByPlan = {
      free: 2,
      pro: -1, // Unlimited
      lifetime: -1 // Unlimited
    };
    
    const maxBooks = maxBooksByPlan[plan as keyof typeof maxBooksByPlan] || 2;
    
    if (maxBooks === -1) {
      return true; // Unlimited
    }
    
    return totalAfterImport <= maxBooks;
  };

  const handleImport = () => {
    if (!importData.trim()) {
      setMessage({ type: 'error', text: 'Please paste backup data to import.' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (!importChoice) {
      setMessage({ type: 'error', text: 'Please choose an import option.' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    try {
      // Parse the import data to check how many books are being imported
      const parsed = JSON.parse(importData);
      const importedBooksCount = parsed.books ? Object.keys(parsed.books).length : 0;
      
      // Check if import would exceed limits using central helper
      if (!checkImportLimits(importedBooksCount, importChoice === 'new')) {
        // Get the upgrade prompt from the central helper
        const { canCreate, upgradePrompt } = useCanCreateBook();
        if (!canCreate && upgradePrompt) {
          setShowUpgradePrompt(true);
        }
        return;
      }
      
      const success = importBooks(importData, importChoice);
      if (success) {
        setMessage({ type: 'success', text: `World data imported successfully as ${importChoice === 'replace' ? 'replacement' : 'new world'}!` });
        setImportData('');
        setImportChoice(null);
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: 'Invalid backup data format.' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to import world data.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setImportData(content);
    };
    reader.readAsText(file);
  };

  const worldCount = getAllBooks().length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">🗂️ Data Management</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Current Status */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-semibold mb-2 text-blue-400">Current Status</h3>
            <p className="text-sm text-gray-300">
              You have <span className="font-bold text-white">{worldCount}</span> world{worldCount !== 1 ? 's' : ''} saved locally.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              All data is automatically saved to your browser's local storage.
            </p>
          </div>

          {/* Export Section */}
          <div className="space-y-3">
            <h3 className="font-semibold text-green-400">Export / Backup</h3>
            <p className="text-sm text-gray-300">
              Download a backup file containing all your worlds and settings.
            </p>
            
            {!showExportOptions ? (
              <Button 
                onClick={() => setShowExportOptions(true)}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                disabled={worldCount === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                Choose Export Format
              </Button>
            ) : (
              <div className="space-y-4">
                {/* Export Format Choice */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-200">Choose Export Format:</h4>
                  
                  {/* JSON Export Options */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button 
                        onClick={handleJsonExport} 
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                        disabled={worldCount === 0}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        JSON Export — Structure Only
                      </Button>
                      <div className="relative group">
                        <Info className="w-4 h-4 text-gray-400 cursor-help" />
                        <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-gray-800 border border-gray-600 rounded-lg text-xs text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          <div className="font-semibold text-green-400 mb-1">JSON Export — Structure Only</div>
                          <p>Exports project JSON with world data and references. Images are referenced as local blob IDs for portability. Does not include binary image files.</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Export Limits Badge */}
                    <div className="flex items-center gap-2 ml-2">
                      {(() => {
                        const limits = getExportLimits();
                        const Icon = limits.jsonExport.icon;
                        return (
                          <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-800 border border-gray-600">
                            <Icon className="w-3 h-3" />
                            <span className="text-gray-300">{limits.jsonExport.description}</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  
                  {/* ZIP Export Options */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button 
                        onClick={handleZipExport} 
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={worldCount === 0 || isExporting || !getExportLimits().zipExport.allowed}
                      >
                        {isExporting ? (
                          <>
                            <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Exporting...
                          </>
                        ) : !getExportLimits().zipExport.allowed ? (
                          <>
                            <Lock className="w-4 h-4 mr-2" />
                            ZIP Export (Upgrade Required)
                          </>
                        ) : (
                          <>
                            <Archive className="w-4 h-4 mr-2" />
                            ZIP Export — Structure + Assets
                          </>
                        )}
                      </Button>
                      <div className="relative group">
                        <Info className="w-4 h-4 text-gray-400 cursor-help" />
                        <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-gray-800 border border-gray-600 rounded-lg text-xs text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          <div className="font-semibold text-blue-400 mb-1">ZIP Export — Structure + Assets</div>
                          <p>Creates a .project.zip containing project.json and all asset binaries (thumb/medium/original). This is the complete backup with all files included.</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Export Limits Badge */}
                    <div className="flex items-center gap-2 ml-2">
                      {(() => {
                        const limits = getExportLimits();
                        const Icon = limits.zipExport.icon;
                        return (
                          <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-800 border border-gray-600">
                            <Icon className="w-3 h-3" />
                            <span className="text-gray-300">{limits.zipExport.description}</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  
                  {/* Bulk Export for Pro/Lifetime */}
                  {isAuthenticated && plan !== 'free' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Button 
                          onClick={handleBulkZipExport} 
                          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                          disabled={worldCount === 0 || isExporting}
                        >
                          {isExporting ? (
                            <>
                              <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              Bulk Exporting...
                            </>
                          ) : (
                            <>
                              <Archive className="w-4 h-4 mr-2" />
                              Bulk Export — All Worlds
                            </>
                          )}
                        </Button>
                        <div className="relative group">
                          <Info className="w-4 h-4 text-gray-400 cursor-help" />
                          <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-gray-800 border border-gray-600 rounded-lg text-xs text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            <div className="font-semibold text-purple-400 mb-1">Bulk Export — All Worlds</div>
                            <p>Export all your worlds and assets in a single ZIP file. Available for Pro and Lifetime users only.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <Button 
                  variant="outline"
                  onClick={() => setShowExportOptions(false)}
                  className="border-gray-600 text-gray-200 hover:bg-gray-800"
                >
                  Cancel
                </Button>
              </div>
            )}
            
            {!effectiveLimits?.importExportEnabled && (
              <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-3">
                <p className="text-xs text-yellow-200">
                  <strong>ZIP Export — Structure + Assets</strong> is a Pro feature that includes all your assets in a ZIP file. 
                  Upgrade to unlock this functionality.
                </p>
              </div>
            )}
          </div>

          {/* Import Section */}
          <div className="space-y-3">
            <h3 className="font-semibold text-orange-400">Import / Restore</h3>
            <p className="text-sm text-gray-300">
              Restore worlds from a backup file. Choose how to handle the import.
            </p>
            
            {/* Import Choice */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-200">Import Option:</Label>
              <RadioGroup value={importChoice || ''} onValueChange={(value) => setImportChoice(value as 'replace' | 'new')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="replace" id="replace" className="border-gray-600" />
                  <Label htmlFor="replace" className="text-sm text-gray-200 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-500" />
                      <span>Import and Replace</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Replace all existing worlds with imported data</p>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="new" id="new" className="border-gray-600" />
                  <Label htmlFor="new" className="text-sm text-gray-200 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span>Import as New</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Add imported worlds as new items (preserves existing worlds)</p>
                  </Label>
                </div>
              </RadioGroup>
              
              {/* Import Limits Info */}
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium text-gray-200">Import Limits:</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>• <strong>Guests:</strong> Can import single worlds only</p>
                  <p>• <strong>Free Users:</strong> Can import up to 2 worlds total</p>
                  <p>• <strong>Pro/Lifetime:</strong> Unlimited world imports</p>
                </div>
              </div>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="file-upload" className="text-sm font-medium text-gray-200">
                Or upload a backup file:
              </Label>
              <Input
                id="file-upload"
                type="file"
                accept=".json,.zip"
                onChange={handleFileImport}
                className="bg-gray-800 border-gray-600 text-white file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
            </div>

            {/* Manual Paste */}
            <div className="space-y-2">
              <Label htmlFor="import-data" className="text-sm font-medium text-gray-200">
                Or paste backup data manually:
              </Label>
              <textarea
                id="import-data"
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                placeholder="Paste your backup JSON data here..."
                className="w-full h-32 p-3 bg-gray-800 border border-gray-600 text-white rounded-md resize-none font-mono text-xs placeholder-gray-400"
              />
            </div>

            <Button 
              onClick={handleImport} 
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              disabled={!importData.trim() || !importChoice}
            >
              <Upload className="w-4 h-4 mr-2" />
              Import Backup Data
            </Button>
          </div>

          {/* Warning Message */}
          <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-yellow-400">⚠️ Important Notice</h4>
                <p className="text-sm text-yellow-200 mt-1">
                  Importing backup data will <strong>replace</strong> all your current worlds and settings. 
                  Make sure to export a backup of your current data before importing.
                </p>
              </div>
            </div>
          </div>

          {/* Success/Error Message */}
          {message && (
            <div className={`rounded-lg p-4 flex items-center gap-2 ${
              message.type === 'success' 
                ? 'bg-green-900/30 border border-green-600' 
                : 'bg-red-900/30 border border-red-600'
            }`}>
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
              <p className={`text-sm ${
                message.type === 'success' ? 'text-green-200' : 'text-red-200'
              }`}>
                {message.text}
              </p>
            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-gray-600 text-gray-200 hover:bg-gray-800"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
      
      {/* Upgrade Prompt Modal */}
      {upgradePrompt && (
        <UpgradePromptModal
          isOpen={showUpgradePrompt}
          onClose={() => setShowUpgradePrompt(false)}
          title={upgradePrompt.title}
          message={upgradePrompt.message}
          action={upgradePrompt.action}
          onAction={handleUpgradeAction}
          type={reason === 'guest_limit' ? 'guest' : 'plan_limit'}
        />
      )}
      
      {/* Account Modal */}
      <AccountModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
      />
    </Dialog>
  );
};

export default DataManager;
