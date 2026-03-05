import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bug, 
  Loader2, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  XCircle, 
  Clock,
  Database,
  Key,
  Shield,
  Info
} from 'lucide-react';
import { 
  fetchEffectiveLimitsDebug, 
  formatDebugInfo, 
  type DebugChain 
} from '@/services/effectiveLimitsDebugService';

export function EffectiveLimitsDebug() {
  const [debugData, setDebugData] = useState<DebugChain | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const fetchDebug = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetchEffectiveLimitsDebug();
      
      if (response.data) {
        setDebugData(response.data);
        console.log('[EffectiveLimitsDebug] Debug data loaded:', response.data);
      } else {
        setError(response.error || 'Failed to load debug information');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('[EffectiveLimitsDebug] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!debugData) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="w-5 h-5" />
            Effective Limits Debug
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            View the complete resolution chain for your effective limits, including plan, license, and owner key overrides.
          </p>
          
          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <Button 
            onClick={fetchDebug} 
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading Debug Info...
              </>
            ) : (
              <>
                <Bug className="w-4 h-4 mr-2" />
                Load Debug Information
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const formatted = formatDebugInfo(debugData);
  const { finalLimits, summary } = debugData;

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bug className="w-5 h-5" />
            Effective Limits Debug
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showDetails ? 'Hide Details' : 'Show Details'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDebug}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Clock className="w-4 h-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="font-mono text-xs">
            {formatted.summary}
          </AlertDescription>
        </Alert>

        {/* Final Limits */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Final Limits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Storage</span>
                <Badge variant={finalLimits.quotaBytes > 100 * 1024 * 1024 ? 'default' : 'secondary'}>
                  {(finalLimits.quotaBytes / (1024 * 1024)).toFixed(1)}MB
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Max Books</span>
                <Badge variant={finalLimits.maxBooks === -1 ? 'default' : 'secondary'}>
                  {finalLimits.maxBooks === -1 ? 'Unlimited' : finalLimits.maxBooks}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Ads</span>
                <Badge variant={finalLimits.adsEnabled ? 'destructive' : 'default'}>
                  {finalLimits.adsEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Import/Export</span>
                <Badge variant={finalLimits.importExportEnabled ? 'default' : 'secondary'}>
                  {finalLimits.importExportEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="w-4 h-4" />
                Source Attribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Base Plan</span>
                <Badge variant="outline">{finalLimits.source.plan}</Badge>
              </div>
              {finalLimits.source.licenseId && (
                <div className="flex justify-between items-center">
                  <span className="text-sm">License</span>
                  <Badge variant="outline">
                    <Key className="w-3 h-3 mr-1" />
                    {finalLimits.source.licenseId.substring(0, 8)}...
                  </Badge>
                </div>
              )}
              {finalLimits.source.ownerKeyId && (
                <div className="flex justify-between items-center">
                  <span className="text-sm">Owner Key</span>
                  <Badge variant="outline">
                    <Key className="w-3 h-3 mr-1" />
                    {finalLimits.source.ownerKeyId.substring(0, 8)}...
                  </Badge>
                </div>
              )}
              {finalLimits.expiresAt && (
                <div className="flex justify-between items-center">
                  <span className="text-sm">Expires</span>
                  <Badge variant="secondary">
                    {new Date(finalLimits.expiresAt).toLocaleDateString()}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Feature Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Feature Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(formatted.featureStatus).map(([feature, status]) => (
                <div key={feature} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    {status.enabled ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium capitalize">
                      {feature.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-right">
                    <Badge variant={status.enabled ? 'default' : 'secondary'} className="text-xs">
                      {status.source.replace('_', ' ')}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {status.reason}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Detailed Resolution Steps */}
        {showDetails && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Resolution Chain</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] w-full rounded-md border p-4">
                <div className="space-y-3">
                  {formatted.resolutionSteps.map((step, index) => (
                    <div key={index} className="flex items-start gap-3 text-sm">
                      <Badge variant="outline" className="mt-0.5 min-w-[80px] text-center">
                        Step {index + 1}
                      </Badge>
                      <div className="flex-1">
                        <p className="font-mono text-xs">{step}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Raw Debug Data (for advanced users) */}
        {showDetails && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Raw Debug Data</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px] w-full rounded-md border p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(debugData, null, 2)}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
