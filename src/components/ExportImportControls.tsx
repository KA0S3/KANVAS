import React from 'react';
import { Download, Upload, Package, FileText } from 'lucide-react';
import { PermissionGatedButton, PermissionGatedFeature } from './PermissionGatedButton';
import { ExportModal } from './ExportModal';
import { permissionService, usePermissions } from '@/services/permissionService';
import { Button } from '@/components/ui/button';

/**
 * Export/Import controls component demonstrating the permission system
 */
export function ExportImportControls() {
  const { permissions, loading, error } = usePermissions();
  const [showExportModal, setShowExportModal] = React.useState(false);

  const handleExportZip = async () => {
    try {
      // Call export function
      console.log('Exporting as ZIP...');
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleExportJson = async () => {
    try {
      // Call export function
      console.log('Exporting as JSON...');
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleImportZip = async () => {
    try {
      // Call import function
      console.log('Importing ZIP...');
    } catch (error) {
      console.error('Import failed:', error);
    }
  };

  const handleImportJson = async () => {
    try {
      // Call import function
      console.log('Importing JSON...');
    } catch (error) {
      console.error('Import failed:', error);
    }
  };

  const handleBulkExport = async () => {
    try {
      // Call bulk export function
      console.log('Bulk exporting...');
    } catch (error) {
      console.error('Bulk export failed:', error);
    }
  };

  if (loading) {
    return <div className="p-4">Loading permissions...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Error loading permissions: {error}</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Export Options</h2>
        <div className="grid grid-cols-2 gap-4">
          <Button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            <Download className="w-4 h-4" />
            Open Export Modal
          </Button>

          <PermissionGatedButton
            action="bulk_export"
            onClick={handleBulkExport}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
          >
            <Download className="w-4 h-4" />
            Bulk Export All Projects
          </PermissionGatedButton>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Import Options</h2>
        <div className="grid grid-cols-2 gap-4">
          <PermissionGatedButton
            action="import_zip"
            onClick={handleImportZip}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            <Upload className="w-4 h-4" />
            Import ZIP
          </PermissionGatedButton>

          <PermissionGatedButton
            action="import_json"
            onClick={handleImportJson}
            className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600"
          >
            <Upload className="w-4 h-4" />
            Import JSON
          </PermissionGatedButton>
        </div>
      </div>

      <PermissionGatedFeature
        action="bulk_export"
        fallback={
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800">
              Bulk export is available for Pro and Lifetime plans only.
              Upgrade to export all your projects at once.
            </p>
          </div>
        }
      >
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800">
            Premium feature unlocked! You can bulk export all your projects.
          </p>
        </div>
      </PermissionGatedFeature>

      <div className="text-sm text-gray-600">
        <p>Current plan: {permissions?.planType || 'Unknown'}</p>
        <p>Permissions loaded: {permissions ? 'Yes' : 'No'}</p>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        projectId="demo-project-id"
        projectName="Demo Project"
      />
    </div>
  );
}
