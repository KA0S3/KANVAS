import React, { useState } from 'react';
import { AlertTriangle, Database, Trash2, Cloud, Upload, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { dataMigrationService, type MigrationConflict, type MigrationResult, type MigrationStrategy } from '@/services/dataMigrationService';

interface DataMigrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conflict: MigrationConflict | null;
  userId: string;
  onMigrationComplete: (result: MigrationResult) => void;
}

export function DataMigrationDialog({ 
  isOpen, 
  onClose, 
  conflict, 
  userId, 
  onMigrationComplete 
}: DataMigrationDialogProps) {
  const [selectedStrategy, setSelectedStrategy] = useState<MigrationStrategy>('cancel');
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);

  if (!conflict) return null;

  const handleMigration = async () => {
    if (selectedStrategy === 'cancel') {
      onClose();
      return;
    }

    setIsMigrating(true);
    try {
      const result = await dataMigrationService.executeMigration(selectedStrategy, userId);
      setMigrationResult(result);
      
      if (result.success) {
        setTimeout(() => {
          onMigrationComplete(result);
          onClose();
        }, 2000);
      }
    } catch (error) {
      console.error('[DataMigrationDialog] Migration failed:', error);
      setMigrationResult({
        success: false,
        strategy: selectedStrategy,
        message: 'Migration failed. Please try again.'
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const getStrategyDescription = (strategy: MigrationStrategy): string => {
    switch (strategy) {
      case 'delete-old':
        return 'Delete all existing cloud data and replace with your local data';
      case 'delete-current':
        return 'Delete your local data and keep existing cloud data';
      case 'merge-as-new':
        return 'Create a new project with your local data';
      case 'cancel':
        return 'Cancel and keep data separate';
      default:
        return '';
    }
  };

  const getStrategyIcon = (strategy: MigrationStrategy) => {
    switch (strategy) {
      case 'delete-old':
        return <Trash2 className="w-4 h-4 text-red-500" />;
      case 'delete-current':
        return <Trash2 className="w-4 h-4 text-orange-500" />;
      case 'merge-as-new':
        return <Upload className="w-4 h-4 text-blue-500" />;
      case 'cancel':
        return <X className="w-4 h-4 text-gray-500" />;
      default:
        return null;
    }
  };

  const getStrategyColor = (strategy: MigrationStrategy) => {
    switch (strategy) {
      case 'delete-old':
        return 'text-red-600 border-red-200 hover:bg-red-50';
      case 'delete-current':
        return 'text-orange-600 border-orange-200 hover:bg-orange-50';
      case 'merge-as-new':
        return 'text-blue-600 border-blue-200 hover:bg-blue-50';
      case 'cancel':
        return 'text-gray-600 border-gray-200 hover:bg-gray-50';
      default:
        return '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Data Migration Required
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warning Alert */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {conflict.message}
            </AlertDescription>
          </Alert>

          {/* Local Data Summary */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Cloud className="w-4 h-4" />
              Your Local Data
            </h4>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
              <p>• {Object.keys(conflict.localData.assets).length} assets</p>
              <p>• {Object.keys(conflict.localData.books).length} projects/books</p>
              <p>• {Object.keys(conflict.localData.backgrounds).length} background configurations</p>
              <p>• Last modified: {new Date(conflict.localData.timestamp).toLocaleString()}</p>
            </div>
          </div>

          {/* Cloud Data Summary (if exists) */}
          {conflict.cloudData && conflict.cloudData.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Database className="w-4 h-4" />
                Existing Cloud Data
              </h4>
              <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                <p>• {conflict.cloudData.length} existing projects</p>
                {conflict.cloudData.map(project => (
                  <p key={project.id} className="ml-4">• {project.name}</p>
                ))}
              </div>
            </div>
          )}

          {/* Strategy Selection */}
          {!migrationResult && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Choose how to handle your data:</Label>
              <RadioGroup 
                value={selectedStrategy} 
                onValueChange={(value) => setSelectedStrategy(value as MigrationStrategy)}
                className="space-y-2"
              >
                {conflict.recommendedStrategy.map((strategy) => (
                  <div key={strategy} className="flex items-start space-x-3">
                    <RadioGroupItem value={strategy} id={strategy} className="mt-1" />
                    <Label 
                      htmlFor={strategy} 
                      className={`flex-1 cursor-pointer p-3 rounded-lg border ${getStrategyColor(strategy)}`}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        {getStrategyIcon(strategy)}
                        {strategy.replace('-', ' ').charAt(0).toUpperCase() + strategy.slice(1).replace('-', ' ')}
                      </div>
                      <p className="text-sm mt-1 opacity-80">
                        {getStrategyDescription(strategy)}
                      </p>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Migration Result */}
          {migrationResult && (
            <Alert className={migrationResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
              <AlertDescription className={migrationResult.success ? 'text-green-800' : 'text-red-800'}>
                {migrationResult.message}
                {migrationResult.success && migrationResult.migratedAssets !== undefined && (
                  <div className="mt-2 text-sm">
                    <p>✓ {migrationResult.migratedAssets} assets migrated</p>
                    <p>✓ {migrationResult.migratedBooks} projects migrated</p>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button 
              variant="outline" 
              onClick={onClose}
              disabled={isMigrating}
            >
              {migrationResult?.success ? 'Close' : 'Cancel'}
            </Button>
            
            {!migrationResult && (
              <Button 
                onClick={handleMigration}
                disabled={isMigrating || selectedStrategy === 'cancel'}
                className="min-w-[120px]"
              >
                {isMigrating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Migrating...
                  </>
                ) : (
                  <>
                    {selectedStrategy === 'cancel' ? 'Cancel' : 'Migrate Data'}
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
