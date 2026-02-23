import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBackgroundStore } from '@/stores/backgroundStore';
import type { BackgroundConfig } from '@/types/background';

export function BackgroundScalingTest() {
  const { getBackground, setBackground } = useBackgroundStore();
  const [testImageUrl, setTestImageUrl] = useState('');
  const [currentConfig, setCurrentConfig] = useState<BackgroundConfig | null>(null);

  useEffect(() => {
    const config = getBackground('root:test-scaling');
    setCurrentConfig(config);
  }, [getBackground]);

  const handleTestImage = () => {
    if (!testImageUrl) return;

    const testConfig: BackgroundConfig = {
      mode: 'color',
      color: '#ffffff',
      imageUrl: testImageUrl,
      position: { x: 100, y: 100 },
      scale: 1,
      gridSize: 40,
      edgeOpacity: 0,
    };

    setBackground('root:test-scaling', testConfig);
    
    // Load image to detect size
    const img = new Image();
    img.onload = () => {
      const updatedConfig = { 
        ...testConfig, 
        imageSize: { width: img.naturalWidth, height: img.naturalHeight } 
      };
      setBackground('root:test-scaling', updatedConfig);
      setCurrentConfig(updatedConfig);
    };
    img.src = testImageUrl;
  };

  const handleScaleChange = (newScale: number) => {
    if (!currentConfig) return;
    
    const updatedConfig = { ...currentConfig, scale: newScale };
    setBackground('root:test-scaling', updatedConfig);
    setCurrentConfig(updatedConfig);
  };

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <h2 className="text-2xl font-bold">Background Scaling Test</h2>
      
      <div className="space-y-2">
        <Label htmlFor="test-image-url">Test Image URL</Label>
        <Input
          id="test-image-url"
          value={testImageUrl}
          onChange={(e) => setTestImageUrl(e.target.value)}
          placeholder="https://via.placeholder.com/800x600.png"
        />
        <Button onClick={handleTestImage}>Load Test Image</Button>
      </div>

      {currentConfig && (
        <div className="space-y-4">
          <div className="bg-gray-100 p-4 rounded">
            <h3 className="font-semibold mb-2">Current Config</h3>
            <pre className="text-sm">
              {JSON.stringify(currentConfig, null, 2)}
            </pre>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scale-slider">Scale: {currentConfig.scale?.toFixed(2)}</Label>
            <input
              id="scale-slider"
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={currentConfig.scale || 1}
              onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex gap-2">
              <Button 
                size="sm" 
                onClick={() => handleScaleChange(0.5)}
              >
                0.5x
              </Button>
              <Button 
                size="sm" 
                onClick={() => handleScaleChange(1)}
              >
                1x
              </Button>
              <Button 
                size="sm" 
                onClick={() => handleScaleChange(2)}
              >
                2x
              </Button>
            </div>
          </div>

          {currentConfig.imageSize && (
            <div className="bg-blue-50 p-4 rounded">
              <h3 className="font-semibold mb-2">Rendered Size</h3>
              <p>Original: {currentConfig.imageSize.width} × {currentConfig.imageSize.height}px</p>
              <p>Scaled: {Math.round(currentConfig.imageSize.width * (currentConfig.scale || 1))} × {Math.round(currentConfig.imageSize.height * (currentConfig.scale || 1))}px</p>
            </div>
          )}

          {currentConfig.imageUrl && (
            <div className="border-2 border-dashed border-gray-300 rounded p-4">
              <h3 className="font-semibold mb-2">Preview</h3>
              <div 
                className="relative bg-gray-100"
                style={{ 
                  width: '400px', 
                  height: '300px',
                  backgroundImage: `url(${currentConfig.imageUrl})`,
                  backgroundSize: currentConfig.imageSize ? 
                    `${Math.round(currentConfig.imageSize.width * (currentConfig.scale || 1))}px ${Math.round(currentConfig.imageSize.height * (currentConfig.scale || 1))}px` : 
                    'auto',
                  backgroundPosition: `${currentConfig.position?.x || 0}px ${currentConfig.position?.y || 0}px`,
                  backgroundRepeat: 'no-repeat'
                }}
              >
                <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                  Scale: {currentConfig.scale?.toFixed(2)}x
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
