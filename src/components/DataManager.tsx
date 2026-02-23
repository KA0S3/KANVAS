import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBookStore } from "@/stores/bookStoreSimple";
import { Download, Upload, AlertCircle, CheckCircle } from "lucide-react";

interface DataManagerProps {
  children: React.ReactNode;
}

const DataManager = ({ children }: DataManagerProps) => {
  const [open, setOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { exportBooks, importBooks, getAllBooks } = useBookStore();

  const handleExport = () => {
    try {
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
      
      setMessage({ type: 'success', text: 'World data exported successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to export world data.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleImport = () => {
    if (!importData.trim()) {
      setMessage({ type: 'error', text: 'Please paste backup data to import.' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    try {
      const success = importBooks(importData);
      if (success) {
        setMessage({ type: 'success', text: 'World data imported successfully!' });
        setImportData('');
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
            <Button 
              onClick={handleExport} 
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              disabled={worldCount === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Backup File
            </Button>
          </div>

          {/* Import Section */}
          <div className="space-y-3">
            <h3 className="font-semibold text-orange-400">Import / Restore</h3>
            <p className="text-sm text-gray-300">
              Restore worlds from a backup file. This will replace your current data.
            </p>
            
            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="file-upload" className="text-sm font-medium text-gray-200">
                Or upload a backup file:
              </Label>
              <Input
                id="file-upload"
                type="file"
                accept=".json"
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
              disabled={!importData.trim()}
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
    </Dialog>
  );
};

export default DataManager;
