import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Key, 
  Shield, 
  ShieldOff, 
  Clock, 
  User, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Trash2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface OwnerKey {
  id: string;
  user_id: string;
  key_name: string;
  token_hash: string;
  scopes: {
    ads?: boolean;
    max_storage_bytes?: number;
    max_books?: number;
    import_export?: boolean;
    [key: string]: any;
  };
  issuer: string;
  expires_at: string;
  is_revoked: boolean;
  revoked_at?: string;
  revoked_by?: string;
  revoked_reason?: string;
  created_by: string;
  created_at: string;
  user_email?: string;
  revoked_by_email?: string;
  created_by_email?: string;
}

const OwnerKeyManager = () => {
  const [ownerKeys, setOwnerKeys] = useState<OwnerKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);

  const fetchOwnerKeys = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: keys, error: keysError } = await supabase
        .from('owner_keys')
        .select(`
          *,
          user:users(email),
          revoked_by_user:users(email),
          created_by_user:users(email)
        `)
        .order('created_at', { ascending: false });

      if (keysError) throw keysError;

      const formattedKeys = keys?.map(key => ({
        ...key,
        user_email: key.user?.email,
        revoked_by_email: key.revoked_by_user?.email,
        created_by_email: key.created_by_user?.email
      })) || [];

      setOwnerKeys(formattedKeys);
    } catch (err) {
      console.error('Error fetching owner keys:', err);
      setError('Failed to fetch owner keys');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeKey = async (keyId: string, tokenHash: string) => {
    try {
      setError(null);
      setSuccess(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Authentication required');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/revoke-owner-key`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            tokenHash,
            reason: revokeReason || 'Revoked by admin'
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      setSuccess('Owner key revoked successfully');
      setShowRevokeDialog(false);
      setRevokeReason('');
      setSelectedKeyId(null);
      await fetchOwnerKeys();
    } catch (err) {
      console.error('Error revoking owner key:', err);
      setError(err instanceof Error ? err.message : 'Failed to revoke owner key');
    }
  };

  useEffect(() => {
    fetchOwnerKeys();
  }, []);

  const getScopeBadge = (key: string, value: any) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      ads: value ? 'destructive' : 'secondary',
      import_export: value ? 'default' : 'secondary',
      max_storage_bytes: 'outline',
      max_books: 'outline'
    };

    return (
      <Badge key={key} variant={variants[key] || 'outline'} className="mr-1 mb-1">
        {key}: {typeof value === 'boolean' ? (value ? '✓' : '✗') : value}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading owner keys...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Owner Key Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {ownerKeys.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No owner keys found</p>
              </div>
            ) : (
              ownerKeys.map((key) => (
                <div key={key.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-medium">{key.key_name}</h3>
                        <Badge variant={key.is_revoked ? 'destructive' : 'default'}>
                          {key.is_revoked ? (
                            <><ShieldOff className="h-3 w-3 mr-1" /> Revoked</>
                          ) : (
                            <><Shield className="h-3 w-3 mr-1" /> Active</>
                          )}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span>User: {key.user_email || key.user_id}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <span>Expires: {formatDistanceToNow(new Date(key.expires_at), { addSuffix: true })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>Created: {formatDistanceToNow(new Date(key.created_at), { addSuffix: true })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>Created by: {key.created_by_email || key.created_by}</span>
                        </div>
                      </div>

                      {key.scopes && Object.keys(key.scopes).length > 0 && (
                        <div className="mt-3">
                          <p className="text-sm font-medium mb-2">Scopes:</p>
                          <div className="flex flex-wrap">
                            {Object.entries(key.scopes).map(([k, v]) => getScopeBadge(k, v))}
                          </div>
                        </div>
                      )}

                      {key.is_revoked && (
                        <div className="mt-3 p-3 bg-destructive/10 rounded-md">
                          <div className="flex items-center gap-2 text-sm font-medium text-destructive mb-1">
                            <XCircle className="h-4 w-4" />
                            Revocation Details
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <div>Revoked by: {key.revoked_by_email || key.revoked_by}</div>
                            <div>Revoked at: {key.revoked_at ? formatDistanceToNow(new Date(key.revoked_at), { addSuffix: true }) : 'Unknown'}</div>
                            {key.revoked_reason && (
                              <div>Reason: {key.revoked_reason}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {!key.is_revoked && (
                      <div className="ml-4">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setSelectedKeyId(key.id);
                            setShowRevokeDialog(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Revoke
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Revoke Confirmation Dialog */}
      {showRevokeDialog && selectedKeyId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Revoke Owner Key
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to revoke this owner key? This action cannot be undone.
              </p>
              
              <div className="space-y-2">
                <Label htmlFor="revokeReason">Reason (optional)</Label>
                <Textarea
                  id="revokeReason"
                  placeholder="Enter reason for revocation..."
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRevokeDialog(false);
                    setRevokeReason('');
                    setSelectedKeyId(null);
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    const key = ownerKeys.find(k => k.id === selectedKeyId);
                    if (key) {
                      handleRevokeKey(key.id, key.token_hash);
                    }
                  }}
                  className="flex-1"
                >
                  Revoke Key
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default OwnerKeyManager;
