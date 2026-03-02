import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/authStore';
import { Shield, ShieldCheck, AlertTriangle, HardDrive, Download, Eye } from 'lucide-react';

export function OwnerKeyStatus() {
  const { ownerKeyInfo, effectiveLimits } = useAuthStore();

  if (!ownerKeyInfo?.isValid) {
    return null;
  }

  return (
    <Card className="border-green-200 bg-green-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-green-800">
          <ShieldCheck className="h-5 w-5" />
          Owner Key Active
        </CardTitle>
        <CardDescription className="text-green-700">
          Your account has enhanced features through an owner key
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Ads Status */}
          <div className="flex items-center gap-2 p-2 bg-white rounded-lg">
            <Eye className="h-4 w-4 text-gray-500" />
            <div className="flex-1">
              <div className="text-xs text-gray-500">Ads</div>
              <Badge 
                variant={effectiveLimits?.adsEnabled ? 'destructive' : 'default'}
                className="text-xs"
              >
                {effectiveLimits?.adsEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </div>

          {/* Storage Status */}
          <div className="flex items-center gap-2 p-2 bg-white rounded-lg">
            <HardDrive className="h-4 w-4 text-gray-500" />
            <div className="flex-1">
              <div className="text-xs text-gray-500">Storage</div>
              <Badge variant="secondary" className="text-xs">
                {effectiveLimits?.maxStorageBytes 
                  ? `${(effectiveLimits.maxStorageBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
                  : 'Default'
                }
              </Badge>
            </div>
          </div>

          {/* Import/Export Status */}
          <div className="flex items-center gap-2 p-2 bg-white rounded-lg">
            <Download className="h-4 w-4 text-gray-500" />
            <div className="flex-1">
              <div className="text-xs text-gray-500">Import/Export</div>
              <Badge 
                variant={effectiveLimits?.importExportEnabled ? 'default' : 'secondary'}
                className="text-xs"
              >
                {effectiveLimits?.importExportEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Additional Features */}
        {ownerKeyInfo.scopes && Object.keys(ownerKeyInfo.scopes).length > 3 && (
          <div className="mt-3 p-2 bg-white rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Additional Features</div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(ownerKeyInfo.scopes)
                .filter(([key]) => !['ads', 'max_storage_bytes', 'import_export'].includes(key))
                .map(([key, value]) => (
                  <Badge key={key} variant="outline" className="text-xs">
                    {key}: {String(value)}
                  </Badge>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
