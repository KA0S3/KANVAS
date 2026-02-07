import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, AlertCircle, CheckCircle, User, Building, Package, MapPin } from 'lucide-react';
import { GeneratorParser, EXAMPLE_GENERATOR_DATA } from '@/services/generatorParser';
import type { ExtendedAsset, GeneratorData } from '@/types/extendedAsset';

interface GeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (asset: Omit<ExtendedAsset, 'id' | 'x' | 'y' | 'parentId' | 'children'>) => void;
}

const TYPE_ICONS = {
  character: User,
  city: Building,
  item: Package,
  location: MapPin,
};

export function GeneratorModal({ isOpen, onClose, onImport }: GeneratorModalProps) {
  const [jsonInput, setJsonInput] = useState('');
  const [parsedData, setParsedData] = useState<GeneratorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedExample, setSelectedExample] = useState<string>('character');

  const handleJsonInput = (value: string) => {
    setJsonInput(value);
    setError(null);
    
    try {
      const data = JSON.parse(value);
      if (GeneratorParser.validateGeneratorData(data)) {
        setParsedData(data);
        setError(null);
      } else {
        setError('Invalid generator data format. Expected { type: "character|city|item|location", data: {...} }');
        setParsedData(null);
      }
    } catch (e) {
      setError('Invalid JSON format');
      setParsedData(null);
    }
  };

  const loadExample = (type: string) => {
    const example = EXAMPLE_GENERATOR_DATA[type as keyof typeof EXAMPLE_GENERATOR_DATA];
    if (example) {
      const jsonString = JSON.stringify(example, null, 2);
      setJsonInput(jsonString);
      handleJsonInput(jsonString);
      setSelectedExample(type);
    }
  };

  const handleImport = () => {
    if (!parsedData) return;

    try {
      const asset = GeneratorParser.parseGeneratorData(parsedData);
      onImport(asset);
      handleClose();
    } catch (e) {
      setError(`Failed to parse generator data: ${e}`);
    }
  };

  const handleClose = () => {
    setJsonInput('');
    setParsedData(null);
    setError(null);
    onClose();
  };

  const supportedTypes = GeneratorParser.getSupportedTypes();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import from External Generator</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="import" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="import">Import JSON</TabsTrigger>
            <TabsTrigger value="examples">Examples</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="json-input">Generator JSON Data</Label>
                <Textarea
                  id="json-input"
                  placeholder={`Paste your generator JSON here. Expected format:
{
  "type": "character",
  "data": {
    "name": "Character Name",
    "description": "Character description",
    ...
  }
}`}
                  value={jsonInput}
                  onChange={(e) => handleJsonInput(e.target.value)}
                  className="mt-1 font-mono text-sm"
                  rows={10}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {parsedData && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      Parsed Successfully
                    </CardTitle>
                    <CardDescription>
                      Preview of the asset that will be created
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{parsedData.type}</Badge>
                      <span className="font-medium">{parsedData.data.name || 'Unnamed Asset'}</span>
                    </div>
                    
                    {parsedData.data.description && (
                      <p className="text-sm text-muted-foreground">
                        {parsedData.data.description}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <strong>Fields detected:</strong> {Object.keys(parsedData.data).length}
                      </div>
                      <div>
                        <strong>Custom fields:</strong> {Object.keys(parsedData.data).length - 2}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <strong className="text-sm">Data preview:</strong>
                      <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                        {JSON.stringify(parsedData.data, null, 2)}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="examples" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {supportedTypes.map((type) => {
                const Icon = TYPE_ICONS[type as keyof typeof TYPE_ICONS];
                return (
                  <Card 
                    key={type}
                    className={`cursor-pointer transition-all ${
                      selectedExample === type ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => loadExample(type)}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="w-4 h-4" />
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Click to load example {type} data
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label>Supported Generator Types</Label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {supportedTypes.map((type) => {
                  const mapping = GeneratorParser.getMappingForType(type);
                  const Icon = TYPE_ICONS[type as keyof typeof TYPE_ICONS];
                  return (
                    <div key={type} className="flex items-center gap-2 p-2 border rounded">
                      <Icon className="w-4 h-4" />
                      <span className="font-medium">{type}</span>
                      <Badge variant="outline" className="ml-auto">
                        {mapping ? Object.keys(mapping).length : 0} fields
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={!parsedData}
          >
            Import Asset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
