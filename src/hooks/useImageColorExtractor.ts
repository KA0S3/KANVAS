import { useState, useCallback, useRef } from 'react';
import { FastAverageColor } from 'fast-average-color';
import type { FastAverageColorResult } from 'fast-average-color';

interface ExtractedColor {
  color: string;
  isDark: boolean;
}

interface UseImageColorExtractorReturn {
  extractColor: (imageUrl: string) => Promise<string | null>;
  getColor: (imageUrl: string) => string | null;
  isLoading: boolean;
  error: string | null;
}

const useImageColorExtractor = (): UseImageColorExtractorReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colorCache = useRef<Map<string, string>>(new Map());
  const fac = useRef(new FastAverageColor());

  const darkenColor = useCallback((color: string, percentage: number = 15): string => {
    // Convert hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // Darken by percentage
    const factor = 1 - (percentage / 100);
    const newR = Math.round(r * factor);
    const newG = Math.round(g * factor);
    const newB = Math.round(b * factor);

    // Convert back to hex
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
  }, []);

  const extractColor = useCallback(async (imageUrl: string): Promise<string | null> => {
    // Check cache first
    if (colorCache.current.has(imageUrl)) {
      return colorCache.current.get(imageUrl)!;
    }

    setIsLoading(true);
    setError(null);

    try {
      const color = await fac.current.getColorAsync(imageUrl, {
        mode: 'speed', // Use speed mode for better performance
        crossOrigin: 'anonymous'
      });
      
      const extractedColor = color.hex;
      
      // Darken the color for spine depth
      const darkenedColor = darkenColor(extractedColor, 15);
      
      // Cache the result
      colorCache.current.set(imageUrl, darkenedColor);
      
      setIsLoading(false);
      console.log('Color extracted successfully:', { original: extractedColor, darkened: darkenedColor });
      return darkenedColor;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to extract color';
      setError(errorMsg);
      setIsLoading(false);
      return null;
    }
  }, [darkenColor]);

  const getColor = useCallback((imageUrl: string): string | null => {
    return colorCache.current.get(imageUrl) || null;
  }, []);

  return {
    extractColor,
    getColor,
    isLoading,
    error
  };
};

export default useImageColorExtractor;
