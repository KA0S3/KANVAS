import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/stores/authStore';
import { Key, Shield, ShieldCheck, AlertCircle } from 'lucide-react';

interface OwnerKeyInputProps {
  onSuccess?: () => void;
}

export function OwnerKeyInput({ onSuccess }: OwnerKeyInputProps) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { validateOwnerKey, ownerKeyInfo, clearOwnerKey } = useAuthStore();

  const handleValidate = async () => {
    if (!token.trim()) {
      setError('Please enter an owner key token');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await validateOwnerKey(token.trim());
      
      if (result.success) {
        setToken('');
        onSuccess?.();
      } else {
        setError(result.error || 'Failed to validate owner key');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    clearOwnerKey();
    setToken('');
    setError(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleValidate();
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Owner Key Management
        </CardTitle>
        <CardDescription>
          Enter an owner key token to unlock additional features and override plan restrictions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {ownerKeyInfo?.isValid ? (
          <div className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <div className="font-medium">Active Owner Key</div>
                <div className="text-sm mt-1">
                  Your owner key is valid and providing the following benefits:
                </div>
              </AlertDescription>
            </Alert>

            <div className="grid gap-3">
              {ownerKeyInfo.scopes?.ads !== undefined && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium">Ads</span>
                  <Badge variant={ownerKeyInfo.scopes.ads ? 'destructive' : 'default'}>
                    {ownerKeyInfo.scopes.ads ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              )}

              {ownerKeyInfo.scopes?.max_storage_bytes && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium">Storage Limit</span>
                  <Badge variant="secondary">
                    {(ownerKeyInfo.scopes.max_storage_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB
                  </Badge>
                </div>
              )}

              {ownerKeyInfo.scopes?.import_export !== undefined && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium">Import/Export</span>
                  <Badge variant={ownerKeyInfo.scopes.import_export ? 'default' : 'secondary'}>
                    {ownerKeyInfo.scopes.import_export ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              )}
            </div>

            <Button 
              variant="outline" 
              onClick={handleClear}
              className="w-full"
            >
              Clear Owner Key
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="owner-key-token">Owner Key Token</Label>
              <Input
                id="owner-key-token"
                type="password"
                placeholder="Enter your owner key JWT token..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button 
              onClick={handleValidate} 
              disabled={loading || !token.trim()}
              className="w-full"
            >
              {loading ? 'Validating...' : 'Validate Owner Key'}
            </Button>

            <div className="text-xs text-gray-500 space-y-1">
              <p>• Owner keys provide additional features and override plan restrictions</p>
              <p>• Tokens are validated securely and stored as hashes</p>
              <p>• Keys can be revoked at any time by the issuer</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
