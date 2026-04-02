import React, { useState } from 'react';
import { AlertTriangle, Upload, X, Loader2, Shield, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { dataMigrationService, type MigrationResult } from '@/services/dataMigrationService';

interface GuestImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onImportComplete: (result: MigrationResult) => void;
  onStartFresh: () => void;
}

export function GuestImportDialog({ 
  isOpen, 
  onClose, 
  userId, 
  onImportComplete,
  onStartFresh
}: GuestImportDialogProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<MigrationResult | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const result = await dataMigrationService.migrateForNewUser(userId);
      setImportResult(result);
      
      if (result.success) {
        // Save preference
        if (dontShowAgain) {
          localStorage.setItem('kanvas-guest-import-dismissed', 'true');
        }
        
        setTimeout(() => {
          onImportComplete(result);
          onClose();
        }, 2000);
      }
    } catch (error) {
      console.error('[GuestImportDialog] Import failed:', error);
      setImportResult({
        success: false,
        strategy: 'merge-as-new',
        message: 'Import failed. Please try again.'
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleStartFresh = () => {
    if (dontShowAgain) {
      localStorage.setItem('kanvas-guest-import-dismissed', 'true');
    }
    onStartFresh();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Welcome! Save Your Work
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Welcome Message */}
          <Alert>
            <Database className="h-4 w-4" />
            <AlertDescription>
              We found local projects from your guest session. Would you like to save them to the cloud?
            </AlertDescription>
          </Alert>

          {/* Benefits of Importing */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <h4 className="font-medium mb-2 text-blue-800 dark:text-blue-200">
              Benefits of cloud backup:
            </h4>
            <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <li>• Access your work from any device</li>
              <li>• Automatic backup and sync</li>
              <li>• Never lose your data</li>
              <li>• Share and collaborate later</li>
            </ul>
          </div>

          {/* Warning for starting fresh */}
          <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg">
            <h4 className="font-medium mb-2 text-amber-800 dark:text-amber-200">
              If you start fresh:
            </h4>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Your local projects will remain on this device but won't be backed up to the cloud. 
              You can always import them later from the settings.
            </p>
          </div>

          {/* Import Result */}
          {importResult && (
            <Alert className={importResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
              <AlertDescription className={importResult.success ? 'text-green-800' : 'text-red-800'}>
                {importResult.message}
                {importResult.success && importResult.migratedAssets !== undefined && (
                  <div className="mt-2 text-sm">
                    <p>✓ {importResult.migratedAssets} assets backed up</p>
                    <p>✓ {importResult.migratedBooks} projects saved</p>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Don't show again checkbox */}
          {!importResult && (
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="dont-show-again" 
                checked={dontShowAgain}
                onCheckedChange={(checked) => setDontShowAgain(checked as boolean)}
              />
              <Label 
                htmlFor="dont-show-again" 
                className="text-sm text-gray-600 dark:text-gray-300 cursor-pointer"
              >
                Don't ask me again
              </Label>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button 
              variant="outline" 
              onClick={handleStartFresh}
              disabled={isImporting}
            >
              {importResult?.success ? 'Close' : 'Start Fresh'}
            </Button>
            
            {!importResult && (
              <Button 
                onClick={handleImport}
                disabled={isImporting}
                className="min-w-[120px]"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Save to Cloud
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
