import { useState } from 'react';
import { AlertTriangle, Trash2, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { LocalStorageCleanup } from '@/utils/localStorageCleanup';

interface StorageResetButtonProps {
  className?: string;
}

export function StorageResetButton({ className }: StorageResetButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleEmergencyReset = async () => {
    setIsResetting(true);
    
    try {
      // Show current status first
      LocalStorageCleanup.showStorageStatus();
      
      // Wait a moment for user to see the status
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Perform emergency reset
      LocalStorageCleanup.emergencyReset();
    } catch (error) {
      console.error('Reset failed:', error);
      setIsResetting(false);
    }
  };

  const handleSelectiveCleanup = () => {
    LocalStorageCleanup.selectiveCleanup();
    setShowDialog(false);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowDialog(true)}
        className={`gap-2 ${className || ''}`}
      >
        <Database className="w-4 h-4" />
        Storage Reset
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md glass cosmic-glow border-glass-border/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Storage Reset Required
            </DialogTitle>
          </DialogHeader>
          
          <DialogDescription className="space-y-4">
            <p className="text-sm">
              Your localStorage appears to have quota exceeded errors or corrupted data. 
              This can happen when large images are stored or data becomes corrupted.
            </p>
            
            <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
              <h4 className="font-medium text-orange-900 dark:text-orange-100 mb-2">
                Recommended Actions:
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="font-medium">1.</span>
                  <span>Check current storage status</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-medium">2.</span>
                  <span>Selective cleanup (removes large/corrupted entries)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-medium">3.</span>
                  <span>Emergency reset (complete wipe, preserves login data)</span>
                </div>
              </div>
            </div>
          </DialogDescription>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleSelectiveCleanup}
              disabled={isResetting}
            >
              Selective Cleanup
            </Button>
            
            <Button
              variant="destructive"
              onClick={handleEmergencyReset}
              disabled={isResetting}
            >
              {isResetting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Resetting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Emergency Reset
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
