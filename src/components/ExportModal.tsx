import React, { useState } from 'react';
import { X, Download, FileText, Package, Lock, Check } from 'lucide-react';
import { PermissionGatedButton } from './PermissionGatedButton';
import { UpgradePromptModal } from './UpgradePromptModal';
import { permissionService } from '@/services/permissionService';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
}

export function ExportModal({ isOpen, onClose, projectId, projectName }: ExportModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeAction, setUpgradeAction] = useState<string>('');

  const handleExportJson = async () => {
    if (!projectId) return;
    
    setIsExporting(true);
    try {
      // Get auth session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      // Call export JSON function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/exportProject`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project_id: projectId,
            include_assets: false,
            bulk_export: false
          })
        }
      );

      const result = await response.json();
      
      if (response.ok) {
        // Handle successful export
        console.log('JSON export successful:', result);
        // You could trigger a download here or show success message
      } else {
        console.error('JSON export failed:', result.error);
      }
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
      onClose();
    }
  };

  const handleExportZip = async () => {
    if (!projectId) return;
    
    setIsExporting(true);
    try {
      // Get auth session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      // Call export ZIP function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/exportProject`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project_id: projectId,
            include_assets: true,
            bulk_export: false
          })
        }
      );

      const result = await response.json();
      
      if (response.ok) {
        // Handle successful export
        console.log('ZIP export successful:', result);
        // You could trigger a download here or show success message
      } else {
        console.error('ZIP export failed:', result.error);
      }
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
      onClose();
    }
  };

  const handleZipClick = () => {
    // Check if user has permission for ZIP export
    permissionService.canUserPerform('export_zip').then(result => {
      if (result.allowed) {
        handleExportZip();
      } else {
        setUpgradeAction('Export as ZIP');
        setShowUpgradeModal(true);
      }
    });
  };

  const handleClose = () => {
    setIsExporting(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Export Project</h2>
                {projectName && (
                  <p className="text-sm text-muted-foreground">{projectName}</p>
                )}
              </div>
              <button
                onClick={handleClose}
                className="ml-auto p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Export Options */}
            <div className="space-y-3">
              {/* JSON Export */}
              <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">JSON Export</h3>
                      <div className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                        Free
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Structure only (no images)
                    </p>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-500" />
                        Project structure and data
                      </div>
                      <div className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-500" />
                        Books, characters, and settings
                      </div>
                      <div className="flex items-center gap-1">
                        <X className="w-3 h-3 text-muted-foreground" />
                        No images or assets
                      </div>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={handleExportJson}
                  disabled={isExporting || !projectId}
                  className="w-full mt-3"
                  variant="outline"
                >
                  {isExporting ? (
                    <>Exporting...</>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 mr-2" />
                      Export as JSON
                    </>
                  )}
                </Button>
              </div>

              {/* ZIP Export */}
              <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                    <Package className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">ZIP Export</h3>
                      <div className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        Pro+
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Full export — project + images (Pro+ or paid addon)
                    </p>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-500" />
                        Everything in JSON export
                      </div>
                      <div className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-500" />
                        All images and assets
                      </div>
                      <div className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-500" />
                        Ready for backup or sharing
                      </div>
                    </div>
                  </div>
                </div>
                <PermissionGatedButton
                  action="export_zip"
                  onClick={handleZipClick}
                  disabled={isExporting || !projectId}
                  className="w-full mt-3"
                  fallback={
                    <Button
                      onClick={handleZipClick}
                      disabled={isExporting || !projectId}
                      className="w-full mt-3"
                      variant="default"
                    >
                      {isExporting ? (
                        <>Exporting...</>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 mr-2" />
                          Upgrade to Export ZIP
                        </>
                      )}
                    </Button>
                  }
                >
                  {isExporting ? (
                    <>Exporting...</>
                  ) : (
                    <>
                      <Package className="w-4 h-4 mr-2" />
                      Export as ZIP
                    </>
                  )}
                </PermissionGatedButton>
              </div>
            </div>

            {/* Info Alert */}
            <Alert>
              <AlertDescription>
                JSON exports are perfect for data migration and backups. 
                ZIP exports include all your images and are ideal for complete project backups or sharing.
              </AlertDescription>
            </Alert>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isExporting}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upgrade Modal */}
      <UpgradePromptModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        title="Upgrade Required"
        message={`ZIP exports are available for Pro users or with a storage addon. Upgrade your plan to access full project exports with all images and assets.`}
        action={upgradeAction}
        type="plan_limit"
        onAction={() => {
          setShowUpgradeModal(false);
          // Refresh permissions after upgrade
          permissionService.clearCache();
        }}
      />
    </>
  );
}
