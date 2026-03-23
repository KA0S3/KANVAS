import { useState, useEffect } from 'react';
import { Database, AlertCircle, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { BackgroundMigration } from '@/utils/backgroundMigration';

interface BackgroundMigrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BackgroundMigrationDialog({ isOpen, onClose }: BackgroundMigrationDialogProps) {
  const [needsMigration, setNeedsMigration] = useState(false);
  const [migrationStats, setMigrationStats] = useState<any>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const needs = BackgroundMigration.needsMigration();
      const stats = BackgroundMigration.getMigrationStats();
      
      setNeedsMigration(needs);
      setMigrationStats(stats);
      setShowResults(false);
      setMigrationResult(null);
    }
  }, [isOpen]);

  const handleMigrate = async () => {
    setIsMigrating(true);
    
    try {
      const result = await BackgroundMigration.migrateAll();
      setMigrationResult(result);
      setShowResults(true);
      
      if (result.success && result.failed === 0) {
        // Clean up old entries after successful migration
        setTimeout(() => {
          BackgroundMigration.cleanupOldEntries();
        }, 2000);
      }
    } catch (error) {
      console.error('Migration failed:', error);
      setMigrationResult({
        success: false,
        errors: ['Migration failed: ' + (error instanceof Error ? error.message : 'Unknown error')]
      });
      setShowResults(true);
    } finally {
      setIsMigrating(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatTime = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
  };

  if (!needsMigration) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md glass cosmic-glow border-glass-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Background Storage Upgrade
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!showResults ? (
            <>
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 dark:text-blue-100">
                      Storage Upgrade Required
                    </p>
                    <p className="text-blue-700 dark:text-blue-300 mt-1">
                      We're upgrading background storage to use IndexedDB for better performance and larger storage capacity.
                    </p>
                  </div>
                </div>
              </div>

              {migrationStats && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Images to migrate:</span>
                    <span className="font-medium">{migrationStats.entriesNeedingMigration}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Estimated size:</span>
                    <span className="font-medium">{formatSize(migrationStats.estimatedSize)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Estimated time:</span>
                    <span className="font-medium">{formatTime(BackgroundMigration.estimateMigrationTime())}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Space saved after compression:</span>
                    <span className="font-medium text-green-600">~70%</span>
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                <p>• Your images will be compressed to save space</p>
                <p>• No images will be lost in this process</p>
                <p>• Background settings remain the same</p>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {migrationResult?.success ? (
                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-green-900 dark:text-green-100">
                        Migration Complete!
                      </p>
                      <div className="mt-2 space-y-1">
                        <p>✅ {migrationResult.migrated} images migrated successfully</p>
                        {migrationResult.spaceSaved > 0 && (
                          <p>✅ {formatSize(migrationResult.spaceSaved)} space saved</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="flex items-start gap-3">
                    <X className="w-5 h-5 text-red-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-red-900 dark:text-red-100">
                        Migration Failed
                      </p>
                      <div className="mt-2 space-y-1">
                        {migrationResult?.errors?.map((error: string, index: number) => (
                          <p key={index}>❌ {error}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!showResults ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={isMigrating}>
                Later
              </Button>
              <Button onClick={handleMigrate} disabled={isMigrating}>
                {isMigrating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Migrating...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4 mr-2" />
                    Upgrade Now
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>
              {migrationResult?.success ? 'Done' : 'Close'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
