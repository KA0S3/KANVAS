import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useBookStore } from "@/stores/bookStoreSimple";
import { useAuthStore } from "@/stores/authStore";
import { useAssetStore } from "@/stores/assetStore";
import { useCanCreateBook } from "@/lib/limits";
import { Download, Upload, AlertCircle, CheckCircle, Archive, Lock, Info, Crown, User, FileUp, Type, AlertTriangle, Trash2 } from "lucide-react";
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
  const [importFiles, setImportFiles] = useState<Array<{ name: string; content: string; type: 'json' | 'zip' }>>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [exportChoice, setExportChoice] = useState<'json' | 'zip' | null>(null);
  const [importChoice, setImportChoice] = useState<'replace' | 'new' | null>(null);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showReplaceWarning, setShowReplaceWarning] = useState(false);
  const [replaceUnlocked, setReplaceUnlocked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        a.download = `kanvas-world-${currentBookId}-${timestamp}-${randomSuffix}.json`;
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
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        a.download = `kanvas-worlds-backup-${timestamp}-${randomSuffix}.json`;
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
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        a.download = `kanvas-worlds-backup-${timestamp}-${randomSuffix}.json`;
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
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      a.download = `kanvas-project-${bulk ? 'bulk' : 'single'}-${timestamp}-${randomSuffix}.zip`;
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
    // Check if we have files or text data
    const hasFiles = importFiles.length > 0;
    const hasTextData = importData.trim();
    
    if (!hasFiles && !hasTextData) {
      setMessage({ type: 'error', text: 'Please add files or paste backup data to import.' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (!importChoice) {
      setMessage({ type: 'error', text: 'Please choose an import option.' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    // If replace is chosen, show the double warning flow
    if (importChoice === 'replace') {
      setShowReplaceWarning(true);
      return;
    }

    // For 'new' choice, proceed with import directly
    proceedWithImport();
  };

  const restoreAssetsFromZip = async (extractedAssets: Record<string, Blob>, assetsData: any) => {
    try {
      const dbName = 'KanvasAssetDB';
      const storeName = 'assets';
      
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        
        request.onerror = () => {
          console.warn('Failed to open IndexedDB for asset restoration:', request.error);
          resolve(); // Continue even if DB fails
        };
        
        request.onsuccess = () => {
          const db = request.result;
          
          if (!db.objectStoreNames.contains(storeName)) {
            console.warn('Asset store not found in IndexedDB for restoration');
            resolve();
            return;
          }
          
          const transaction = db.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);
          
          let restoredCount = 0;
          const totalAssets = Object.keys(extractedAssets).length;
          
          if (totalAssets === 0) {
            resolve();
            return;
          }
          
          // Restore each asset to IndexedDB
          for (const [filename, blob] of Object.entries(extractedAssets)) {
            const assetId = filename.split('.')[0]; // Extract asset ID from filename
            
            const putRequest = store.put({
              id: assetId,
              blob: blob,
              timestamp: Date.now()
            });
            
            putRequest.onsuccess = () => {
              restoredCount++;
              if (restoredCount === totalAssets) {
                console.log(`Successfully restored ${restoredCount} assets to IndexedDB`);
                resolve();
              }
            };
            
            putRequest.onerror = () => {
              console.warn(`Failed to restore asset ${assetId}:`, putRequest.error);
              restoredCount++;
              if (restoredCount === totalAssets) {
                resolve();
              }
            };
          }
        };
      });
    } catch (error) {
      console.error('Error restoring assets to IndexedDB:', error);
    }
  };

  const proceedWithImport = async () => {
    try {
      // Handle files first, then fallback to text data
      let dataToImport = '';
      let importedBooksCount = 0;
      let firstFile = null;
      let parsed = null;
      
      if (importFiles.length > 0) {
        // For now, handle first file (could be extended to handle multiple files)
        firstFile = importFiles[0];
        dataToImport = firstFile.content;
        
        // For ZIP files, content should already be extracted project.json
        if (firstFile.type === 'zip') {
          try {
            parsed = JSON.parse(dataToImport);
            // Validate ZIP project structure
            if (!parsed.version || !parsed.worlds || !parsed.assets) {
              throw new Error('Invalid ZIP project structure: missing required fields (version, worlds, assets)');
            }
            
            // Store extracted assets for later restoration
            const extractedAssets = parsed.extractedAssets || {};
            
            // Convert to book store format
            dataToImport = JSON.stringify({
              books: parsed.worlds,
              settings: {
                defaultViewMode: 'single',
                autoSave: true,
                showBookDescriptions: true,
              },
              exportedAt: parsed.exportedAt || new Date().toISOString(),
              // Include assets data for restoration
              assetsData: parsed.assets,
              extractedAssets: extractedAssets,
            });
          } catch (zipError) {
            console.error('ZIP content validation error:', zipError);
            setMessage({ type: 'error', text: `Invalid ZIP file format: ${zipError.message}` });
            setTimeout(() => setMessage(null), 5000);
            return;
          }
        }
      } else if (importData.trim()) {
        dataToImport = importData;
      } else {
        setMessage({ type: 'error', text: 'No data available to import.' });
        setTimeout(() => setMessage(null), 3000);
        return;
      }
      
      // Validate JSON structure before parsing
      if (!dataToImport.trim()) {
        setMessage({ type: 'error', text: 'Import data is empty.' });
        setTimeout(() => setMessage(null), 3000);
        return;
      }
      
      try {
        parsed = JSON.parse(dataToImport);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        setMessage({ type: 'error', text: 'Invalid JSON format. Please check your backup file.' });
        setTimeout(() => setMessage(null), 5000);
        return;
      }
      
      // Validate imported data structure
      if (!parsed.books || typeof parsed.books !== 'object') {
        setMessage({ type: 'error', text: 'Invalid backup format: missing or invalid books data.' });
        setTimeout(() => setMessage(null), 5000);
        return;
      }
      
      importedBooksCount = Object.keys(parsed.books).length;
      
      if (importedBooksCount === 0) {
        setMessage({ type: 'error', text: 'Backup file contains no worlds to import.' });
        setTimeout(() => setMessage(null), 3000);
        return;
      }
      
      // Check if import would exceed limits using central helper
      if (!checkImportLimits(importedBooksCount, importChoice === 'new')) {
        // Get the upgrade prompt from the central helper
        const { canCreate, upgradePrompt } = useCanCreateBook();
        if (!canCreate && upgradePrompt) {
          setShowUpgradePrompt(true);
        }
        return;
      }
      
      const success = importBooks(dataToImport, importChoice);
      if (success) {
        // If this is a ZIP import with assets, restore them
        if (firstFile && firstFile.type === 'zip' && parsed.extractedAssets && Object.keys(parsed.extractedAssets).length > 0) {
          await restoreAssetsFromZip(parsed.extractedAssets, parsed.assetsData);
        }
        
        setMessage({ type: 'success', text: `World data imported successfully as ${importChoice === 'replace' ? 'replacement' : 'new world'}!` });
        setImportData('');
        setImportFiles([]);
        setImportChoice(null);
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: 'Invalid backup data format or import failed.' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error('Import error:', error);
      setMessage({ type: 'error', text: `Failed to import world data: ${error.message || 'Unknown error'}` });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleConfirmReplaceData = () => {
    // Show browser confirmation dialog
    const confirmed = window.confirm(
      '⚠️ FINAL WARNING ⚠️\n\n' +
      'This action will PERMANENTLY replace ALL existing data including:\n' +
      '• All current worlds and their contents\n' +
      '• All assets and tags\n' +
      '• All settings and preferences\n' +
      '• All unsaved changes\n\n' +
      'THIS ACTION CANNOT BE UNDONE!\n\n' +
      'Click "OK" to permanently replace all data, or "Cancel" to abort.'
    );

    if (!confirmed) {
      return; // User cancelled the browser confirmation
    }

    // Close the warning dialog and proceed with import
    setShowReplaceWarning(false);
    setReplaceUnlocked(false);
    proceedWithImport();
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    // If replace mode, only allow one file
    if (importChoice === 'replace' && files.length > 1) {
      setMessage({ type: 'error', text: 'When replacing existing data, only one file can be imported.' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    // If replace mode and we already have files, clear them first
    if (importChoice === 'replace' && importFiles.length > 0) {
      setImportFiles([]);
    }

    for (const file of Array.from(files)) {
      try {
        if (file.name.endsWith('.zip')) {
          // Handle ZIP files with JSZip
          const zip = new JSZip();
          const content = await file.arrayBuffer();
          const zipData = await zip.loadAsync(content);
          
          // Look for project.json
          const projectFile = zipData.file('project.json');
          if (!projectFile) {
            setMessage({ type: 'error', text: `ZIP file ${file.name} does not contain project.json` });
            setTimeout(() => setMessage(null), 3000);
            continue;
          }
          
          const projectContent = await projectFile.async('string');
          
          // Extract and store assets from ZIP for later restoration
          const assetsFolder = zipData.folder('assets');
          const extractedAssets: Record<string, Blob> = {};
          
          if (assetsFolder) {
            // Extract all asset files
            for (const [relativePath, assetFile] of Object.entries(assetsFolder.files)) {
              if (!assetFile.dir) {
                const assetBlob = await assetFile.async('blob');
                extractedAssets[relativePath] = assetBlob;
              }
            }
          }
          
          // Store the project content with embedded assets info
          const projectData = JSON.parse(projectContent);
          projectData.extractedAssets = extractedAssets;
          
          setImportFiles(prev => [...prev, { 
            name: file.name, 
            content: JSON.stringify(projectData), 
            type: 'zip' 
          }]);
        } else {
          // Handle JSON files
          const reader = new FileReader();
          const content = await new Promise<string>((resolve, reject) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsText(file);
          });
          setImportFiles(prev => [...prev, { name: file.name, content, type: 'json' }]);
        }
      } catch (error) {
        console.error('Error processing file:', file.name, error);
        setMessage({ type: 'error', text: `Failed to process file ${file.name}` });
        setTimeout(() => setMessage(null), 3000);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      // If replace mode, only allow one file
      if (importChoice === 'replace' && files.length > 1) {
        setMessage({ type: 'error', text: 'When replacing existing data, only one file can be imported.' });
        setTimeout(() => setMessage(null), 3000);
        return;
      }

      // If replace mode and we already have files, clear them first
      if (importChoice === 'replace' && importFiles.length > 0) {
        setImportFiles([]);
      }

      for (const file of Array.from(files)) {
        if (file.type === 'application/json' || file.name.endsWith('.json') || file.name.endsWith('.zip')) {
          try {
            if (file.name.endsWith('.zip')) {
              // Handle ZIP files with JSZip
              const zip = new JSZip();
              const content = await file.arrayBuffer();
              const zipData = await zip.loadAsync(content);
              
              // Look for project.json
              const projectFile = zipData.file('project.json');
              if (!projectFile) {
                setMessage({ type: 'error', text: `ZIP file ${file.name} does not contain project.json` });
                setTimeout(() => setMessage(null), 3000);
                continue;
              }
              
              const projectContent = await projectFile.async('string');
              setImportFiles(prev => [...prev, { name: file.name, content: projectContent, type: 'zip' }]);
            } else {
              // Handle JSON files
              const reader = new FileReader();
              const content = await new Promise<string>((resolve, reject) => {
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = reject;
                reader.readAsText(file);
              });
              setImportFiles(prev => [...prev, { name: file.name, content, type: 'json' }]);
            }
          } catch (error) {
            console.error('Error processing dropped file:', file.name, error);
            setMessage({ type: 'error', text: `Failed to process file ${file.name}` });
            setTimeout(() => setMessage(null), 3000);
          }
        }
      }
    } else {
      // Handle text paste via drag
      const text = e.dataTransfer.getData('text/plain');
      if (text) {
        setImportData(text);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text) {
      setImportData(text);
    }
  };

  const removeFile = (index: number) => {
    setImportFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setImportFiles([]);
    setImportData('');
  };

  const worldCount = getAllBooks().length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">🗂️ Data Management</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Status Header */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-3 border border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-300">Worlds Saved:</span>
                <span className="font-bold text-white">{worldCount}</span>
              </div>
              <div className="relative group">
                <Info className="w-4 h-4 text-gray-400 cursor-help" />
                <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-gray-800 border border-gray-600 rounded-lg text-xs text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <div className="font-semibold text-blue-400 mb-1">Import Limits:</div>
                  <p>• <strong>Guests:</strong> Can import single worlds only</p>
                  <p>• <strong>Free Users:</strong> Can import up to 2 worlds total</p>
                  <p>• <strong>Pro/Lifetime:</strong> Unlimited world imports</p>
                </div>
              </div>
            </div>
          </div>

          {/* Dual-Engine Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Column - JSON Export */}
            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-lg text-green-400 mb-2">Structure & Settings (JSON)</h3>
                  <p className="text-sm text-gray-300">Lightweight backup of world data and configurations. Does not include media assets.</p>
                </div>
                
                <Button 
                  onClick={handleJsonExport} 
                  className="w-full bg-green-600 hover:bg-green-700 text-white h-12"
                  disabled={worldCount === 0}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export JSON
                </Button>
                
                <div className="flex items-center gap-2">
                  {(() => {
                    const limits = getExportLimits();
                    const Icon = limits.jsonExport.icon;
                    return (
                      <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-800/50 border border-gray-600">
                        <Icon className="w-3 h-3" />
                        <span className="text-gray-300">{limits.jsonExport.description}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Right Column - ZIP Export */}
            <div className={`bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700 relative transition-all duration-300 ${
              !getExportLimits().zipExport.allowed ? 'grayscale opacity-75' : ''
            }`}>
              {/* Upgrade Overlay for Free Users */}
              {!getExportLimits().zipExport.allowed && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-md rounded-lg flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300 z-10 cursor-pointer"
                     onClick={() => {
                       if (!isAuthenticated) {
                         setShowAccountModal(true);
                       } else {
                         setShowUpgradePrompt(true);
                       }
                     }}>
                  <div className="text-center">
                    <Crown className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                    <p className="text-white font-semibold">Upgrade to Unlock</p>
                    <p className="text-gray-300 text-sm">Full world backup with assets</p>
                  </div>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-lg text-blue-400 mb-2">Full World Backup (ZIP)</h3>
                  <p className="text-sm text-gray-300">Complete archive including all structures, settings, and uploaded assets.</p>
                </div>
                
                <Button 
                  onClick={handleZipExport} 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12"
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
                      Export ZIP
                    </>
                  )}
                </Button>
                
                <div className="flex items-center gap-2">
                  {(() => {
                    const limits = getExportLimits();
                    const Icon = limits.zipExport.icon;
                    return (
                      <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-800/50 border border-gray-600">
                        <Icon className="w-3 h-3" />
                        <span className="text-gray-300">{limits.zipExport.description}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Import Section */}
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700 space-y-4">
            <div>
              <h3 className="font-bold text-lg text-orange-400 mb-2">Import / Restore</h3>
              <p className="text-sm text-gray-300">Restore worlds from a backup file or paste data directly.</p>
            </div>

            {/* Mode Selection - Toggle Group */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-200">Import Mode:</Label>
              <ToggleGroup 
                type="single" 
                value={importChoice || ''} 
                onValueChange={(value) => {
                  if (value === 'new') {
                    // Check if user can import as new (free/guest with 1 book should trigger upgrade)
                    const currentBooks = getAllBooks();
                    const { isAuthenticated, plan } = useAuthStore.getState();
                    
                    // Guest users - max 1 book
                    if (!isAuthenticated && currentBooks.length >= 1) {
                      setShowUpgradePrompt(true);
                      return; // Don't change the toggle
                    }
                    
                    // Free users - max 1 book
                    if (plan === 'free' && currentBooks.length >= 1) {
                      setShowUpgradePrompt(true);
                      return; // Don't change the toggle
                    }
                  }
                  
                  setImportChoice(value as 'replace' | 'new');
                }}
                className="w-full"
              >
                <ToggleGroupItem value="replace" className="flex-1">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    <span>Replace Existing</span>
                  </div>
                </ToggleGroupItem>
                <ToggleGroupItem value="new" className="flex-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Import as New</span>
                  </div>
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Unified Input Zone */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-200">Backup Data:</Label>
              <div
                className={`w-full h-32 p-4 bg-gray-800/50 border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
                  isDragging ? 'border-blue-400 bg-blue-900/20' : 'border-gray-600 hover:border-gray-500'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center justify-center h-full text-center">
                  {importFiles.length > 0 || importData ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-xs text-gray-300 font-mono truncate max-w-full">
                        {importFiles.length > 0 ? `${importFiles.length} file(s) loaded` : 'Data loaded - Ready to import'}
                      </div>
                    </div>
                  ) : (
                    <>
                      <FileUp className="w-8 h-8 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-300 mb-1">Drag & drop file or paste data</p>
                      <p className="text-xs text-gray-400">Supports JSON and ZIP files</p>
                    </>
                  )}
                </div>
              </div>
              
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.zip"
                multiple={importChoice !== 'replace'}
                onChange={handleFileImport}
                className="hidden"
              />
              
              {/* File List */}
              {importFiles.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      Files loaded: {importChoice === 'replace' ? '(single file only)' : `(${importFiles.length} files)`}
                    </span>
                    <button
                      onClick={clearAllFiles}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                  {importFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-gray-800/50 border border-gray-600 rounded-md"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {file.type === 'zip' ? (
                          <Archive className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        ) : (
                          <Type className="w-4 h-4 text-green-400 flex-shrink-0" />
                        )}
                        <span className="text-sm text-gray-200 truncate">
                          {file.name}
                        </span>
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Text area for manual paste */}
              {importData && !importFiles.length && (
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  onPaste={handlePaste}
                  placeholder="Or paste your backup JSON data here..."
                  className="w-full h-24 p-3 bg-gray-800/50 border border-gray-600 text-white rounded-md resize-none font-mono text-xs placeholder-gray-400"
                />
              )}
            </div>

            <Button 
              onClick={handleImport} 
              className="w-full bg-orange-600 hover:bg-orange-700 text-white h-12"
              disabled={(importFiles.length === 0 && !importData.trim()) || !importChoice}
            >
              <Upload className="w-4 h-4 mr-2" />
              Import Backup Data
            </Button>
          </div>

          {/* Warning Footer - Only show for replace mode */}
          {importChoice === 'replace' && (
            <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                <p className="text-xs text-yellow-200">
                  Importing data replaces current settings; export a backup first.
                </p>
              </div>
            </div>
          )}

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
          <div className="flex justify-end pt-2">
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
          onClose={() => {
            setShowUpgradePrompt(false);
            // Reset toggle back to 'replace' if user closes upgrade modal
            if (importChoice === 'new') {
              setImportChoice('replace');
            }
          }}
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
      
      {/* Replace Data Warning Dialog */}
      <AlertDialog open={showReplaceWarning} onOpenChange={setShowReplaceWarning}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Replace All Data
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <div className="text-center py-4">
                <div className="text-xl font-bold text-destructive mb-2">
                  WARNING THIS WILL REPLACE ALL DATA
                </div>
                <div className="text-lg font-bold text-destructive">
                  THIS ACTION IS NOT REVERSABLE
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 border border-destructive/30 rounded-lg bg-destructive/5">
                <div className="flex items-center gap-2">
                  <Switch
                    id="replace-unlock"
                    checked={replaceUnlocked}
                    onCheckedChange={setReplaceUnlocked}
                  />
                  <Label htmlFor="replace-unlock" className="text-sm font-medium">
                    Unlock replacement
                  </Label>
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground text-center">
                This will permanently replace all current worlds, assets, tags, and settings with the imported data. There is no way to recover this data.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowReplaceWarning(false);
              setReplaceUnlocked(false);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReplaceData}
              disabled={!replaceUnlocked}
              className="bg-destructive hover:bg-destructive/90"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Replace All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

export default DataManager;
