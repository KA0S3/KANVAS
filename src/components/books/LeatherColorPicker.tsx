import React from 'react';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useThemeStore } from '@/stores/themeStore';
import type { LeatherColorPreset } from '@/types/book';

interface LeatherColorPickerProps {
  selectedColor?: string;
  onColorSelect: (color: LeatherColorPreset) => void;
  disabled?: boolean;
  className?: string;
}

const LeatherColorPicker: React.FC<LeatherColorPickerProps> = ({
  selectedColor,
  onColorSelect,
  disabled = false,
  className = ''
}) => {
  const { leatherPresets } = useBookStore();
  const { theme } = useThemeStore();

  const getColorDisplay = (preset: LeatherColorPreset) => {
    return theme === 'dark' ? preset.darkVariant : preset.lightVariant;
  };

  if (leatherPresets.length === 0) {
    return (
      <div className={`text-center text-gray-500 ${className}`}>
        No leather colors available
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="text-sm font-medium text-gray-300 mb-3">
        Choose Leather Color
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        {leatherPresets.map((preset) => {
          const displayColor = getColorDisplay(preset);
          const isSelected = selectedColor === preset.color;
          
          return (
            <button
              key={preset.id}
              onClick={() => !disabled && onColorSelect(preset)}
              disabled={disabled}
              className={`
                relative group p-3 rounded-lg border-2 transition-all duration-200
                ${isSelected 
                  ? 'border-blue-500 bg-blue-500/10' 
                  : 'border-gray-600 hover:border-gray-500 hover:bg-gray-700/50'
                }
                ${disabled 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'cursor-pointer'
                }
              `}
              title={preset.name}
            >
              {/* Color Preview */}
              <div 
                className="w-full h-12 rounded-md mb-2 transition-transform duration-200 group-hover:scale-105"
                style={{ 
                  backgroundColor: displayColor,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.2)'
                }}
              />
              
              {/* Color Name */}
              <div className="text-xs text-gray-300 text-center">
                {preset.name}
              </div>
              
              {/* Selection Indicator */}
              {isSelected && (
                <div className="absolute top-1 right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                </div>
              )}
              
              {/* Hover Effect */}
              <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            </button>
          );
        })}
      </div>
      
      {/* Description */}
      <div className="text-xs text-gray-500 text-center">
        Leather colors adapt to dark/light theme
      </div>
    </div>
  );
};

export default LeatherColorPicker;
