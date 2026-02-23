import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { validateBackgroundConfig } from '@/utils/backgroundUtils';
import type { BackgroundMode } from '@/types/background';

export function BackgroundSystemTest() {
  const { getBackground, setBackground } = useBackgroundStore();
  
  // Test different asset keys
  const rootConfig = getBackground('root:test-book');
  const assetConfig = getBackground('asset:test-asset');
  
  const [testMode, setTestMode] = useState<BackgroundMode>('glass');

  const handleModeChange = (mode: BackgroundMode) => {
    setTestMode(mode);
    
    // Update root config
    const newConfig = validateBackgroundConfig({
      ...rootConfig,
      mode,
      color: mode === 'color' ? '#ff0000' : null,
    });
    
    setBackground('root:test-book', newConfig);
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-bold">Background System Test</h2>
      
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Root Background Config</h3>
        <pre className="bg-gray-100 p-2 rounded text-sm">
          {JSON.stringify(rootConfig, null, 2)}
        </pre>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Asset Background Config</h3>
        <pre className="bg-gray-100 p-2 rounded text-sm">
          {JSON.stringify(assetConfig, null, 2)}
        </pre>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Mode Test</h3>
        <RadioGroup value={testMode} onValueChange={(value) => handleModeChange(value as BackgroundMode)}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="glass" id="test-glass" />
            <label htmlFor="test-glass">Glass</label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="parchment" id="test-parchment" />
            <label htmlFor="test-parchment">Parchment</label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="color" id="test-color" />
            <label htmlFor="test-color">Color</label>
          </div>
        </RadioGroup>
        
        <Button 
          onClick={() => {
            console.log('Root config:', rootConfig);
            console.log('Asset config:', assetConfig);
            console.log('Test mode:', testMode);
          }}
        >
          Log to Console
        </Button>
      </div>
    </div>
  );
}
