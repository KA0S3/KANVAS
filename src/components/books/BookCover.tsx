import React, { useState, useMemo } from 'react';
import type { Book } from '@/types/book';
import { useThemeStore } from '@/stores/themeStore';

interface BookCoverProps {
  book: Book;
  size?: 'small' | 'medium' | 'large';
  showBack?: boolean;
  className?: string;
}

const BookCover: React.FC<BookCoverProps> = ({ 
  book, 
  size = 'medium', 
  showBack = false,
  className = ''
}) => {
  const { theme } = useThemeStore();
  const [isHovered, setIsHovered] = useState(false);
  
  const sizeClasses = {
    small: 'w-16 h-24 text-xs',
    medium: 'w-24 h-36 text-sm',
    large: 'w-48 h-72 text-lg'
  };

  // Calculate world statistics
  const worldStats = useMemo(() => {
    const assets = book.worldData?.assets || {};
    const assetCount = Object.keys(assets).length;
    const tags = book.worldData?.tags || {};
    const tagCount = Object.keys(tags).length;
    
    // Calculate estimated storage size (rough approximation)
    const estimatedSize = JSON.stringify({
      assets,
      tags,
      globalCustomFields: book.worldData?.globalCustomFields || [],
      viewportOffset: book.worldData?.viewportOffset || { x: 0, y: 0 },
      viewportScale: book.worldData?.viewportScale || 1
    }).length;
    
    const formatSize = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return {
      assetCount,
      tagCount,
      estimatedSize: formatSize(estimatedSize),
      storageLocation: 'Local Storage', // Could be enhanced to detect Google Drive
      lastModified: new Date(book.updatedAt).toLocaleDateString()
    };
  }, [book.worldData, book.updatedAt]);

  const getLeatherStyle = () => {
    if (!book.isLeatherMode || book.coverImage) return null;
    
    const leatherColor = book.leatherColor || '#8B4513';
    const isDark = theme === 'dark';
    
    // Calculate appropriate darkening based on color
    const getDarkeningAmount = (color: string) => {
      const num = parseInt(color.replace('#', ''), 16);
      const r = num >> 16;
      const g = (num >> 8) & 0x00FF;
      const b = num & 0x0000FF;
      
      // Brown colors - darken less to keep leather look
      if (r > 100 && g > 50 && g < 150 && b < 100) return 50;
      // Green colors - darken much less to maintain green visibility
      if (g > r && g > b) return 20;
      // Grey colors - darken less to maintain grey visibility
      if (Math.abs(r - g) < 30 && Math.abs(g - b) < 30) return 30;
      // Default for other colors
      return 40;
    };
    
    const darkeningAmount = getDarkeningAmount(leatherColor);
    
    const darkenColor = (color: string, amount: number) => {
      const num = parseInt(color.replace('#', ''), 16);
      const r = Math.max(0, (num >> 16) - amount);
      const g = Math.max(0, ((num >> 8) & 0x00FF) - amount);
      const b = Math.max(0, (num & 0x0000FF) - amount);
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    };
    
    const darkLeather = darkenColor(leatherColor, darkeningAmount);
    
    return {
      backgroundColor: darkLeather,
      backgroundImage: `
        repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 6px),
        repeating-linear-gradient(0deg, transparent, transparent 4px, rgba(0,0,0,0.03) 4px, rgba(0,0,0,0.03) 8px)
      `,
      backgroundBlend: 'multiply' as const,
      border: `2px solid ${darkenColor(leatherColor, darkeningAmount + 20)}`,
      boxShadow: isDark 
        ? `inset 0 2px 4px rgba(0,0,0,0.7), inset 0 -1px 2px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.5)`
        : `inset 0 2px 4px rgba(0,0,0,0.5), inset 0 -1px 2px rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.3)`,
      position: 'relative' as const
    };
  };

  const getCoverStyle = () => {
    // Check for custom cover image first (highest priority)
    if (book.coverImage && !showBack) {
      return {
        backgroundImage: `url(${book.coverImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      };
    }
    
    // If cover page settings are enabled, use the base style
    if (book.coverPageSettings?.showCoverPage) {
      const { baseStyle, coverImageData } = book.coverPageSettings;
      
      if (baseStyle === 'image' && coverImageData && !showBack) {
        return {
          backgroundImage: `url(${coverImageData})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        };
      }
      
      if (baseStyle === 'gradient' && book.gradient && !showBack) {
        return {
          background: book.gradient.replace(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/g, (match, r, g, b) => {
            return `rgba(${r}, ${g}, ${b}, 0.95)`;
          })
        };
      }
      
      if (baseStyle === 'leather' && !showBack) {
        return getLeatherStyle();
      }
    }
    
    // Fallback to original logic with gradient presets
    if (book.gradient && !showBack) {
      return {
        background: book.gradient.replace(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/g, (match, r, g, b) => {
          return `rgba(${r}, ${g}, ${b}, 0.95)`;
        })
      };
    }
    
    // Use gradient presets based on book color
    const colorOptions = [
      { value: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' },
      { value: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #06b6d4)' },
      { value: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #ec4899)' },
      { value: '#f97316', gradient: 'linear-gradient(135deg, #f97316, #ef4444)' },
      { value: '#1f2937', gradient: 'linear-gradient(135deg, #1f2937, #374151)' },
      { value: '#f43f5e', gradient: 'linear-gradient(135deg, #f43f5e, #ec4899)' },
    ];
    
    const colorOption = colorOptions.find(option => option.value === book.color);
    if (colorOption && !showBack) {
      return {
        background: colorOption.gradient.replace(/#[0-9a-fA-F]{6}/g, (match) => {
          const r = parseInt(match.substr(1, 2), 16);
          const g = parseInt(match.substr(3, 2), 16);
          const b = parseInt(match.substr(5, 2), 16);
          return `rgba(${r}, ${g}, ${b}, 0.95)`;
        })
      };
    }
    
    return getLeatherStyle() || {
      background: book.color || '#3b82f6'
    };
  };

  const getTextStyle = (textSettings: { type: string; customFont?: string; color: string; size: string }) => {
    // Get font family based on text type
    let fontFamily = 'serif';
    switch (textSettings.type) {
      case 'sans-serif':
        fontFamily = 'sans-serif';
        break;
      case 'monospace':
        fontFamily = 'monospace';
        break;
      case 'cursive':
        fontFamily = 'cursive';
        break;
      case 'fantasy':
        fontFamily = 'fantasy';
        break;
      case 'custom':
        fontFamily = textSettings.customFont || 'serif';
        break;
      default:
        fontFamily = 'serif';
    }
    
    // Get font size based on size
    let fontSize = '14px';
    switch (textSettings.size) {
      case 'small':
        fontSize = '12px';
        break;
      case 'medium':
        fontSize = '14px';
        break;
      case 'large':
        fontSize = '18px';
        break;
      case 'extra-large':
        fontSize = '24px';
        break;
    }
    
    return {
      fontFamily,
      color: textSettings.color,
      fontSize
    };
  };


  const renderContent = () => {
    if (showBack) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
          <div className="font-bold mb-2" style={{ writingMode: 'horizontal-tb' }}>
            {book.title}
          </div>
          <div className="text-xs opacity-80 leading-tight">
            {book.description || 'No description available'}
          </div>
        </div>
      );
    }

    // Use cover page settings if enabled
    if (book.coverPageSettings?.showCoverPage) {
      const { title, description } = book.coverPageSettings;
      
      if (isHovered) {
        // Show stats overlay on hover
        return (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center p-2 text-center">
            <div className="font-bold text-white mb-1 text-xs">{book.title}</div>
            <div className="text-white text-xs space-y-1">
              <div>📦 {worldStats.assetCount} assets</div>
              <div>🏷️ {worldStats.tagCount} tags</div>
              <div>💾 {worldStats.estimatedSize}</div>
              <div>📁 {worldStats.storageLocation}</div>
              <div>📅 {worldStats.lastModified}</div>
            </div>
          </div>
        );
      }

      // Show title and description with custom positioning and styling
      return (
        <div className="absolute inset-0 h-full p-2">
          {/* Title */}
          {title.text && (
            <div 
              className="absolute"
              style={{
                left: `${title.position.x}%`,
                top: `${title.position.y}%`,
                transform: 'translate(-50%, -50%)',
                ...getTextStyle(title.style),
                writingMode: 'horizontal-tb',
                fontWeight: 'bold'
              }}
            >
              {title.text}
            </div>
          )}
          
          {/* Description */}
          {description?.text && (
            <div 
              className="absolute"
              style={{
                left: `${description.position.x}%`,
                top: `${description.position.y}%`,
                transform: 'translate(-50%, -50%)',
                ...getTextStyle(description.style),
                writingMode: 'horizontal-tb',
                fontSize: '12px',
                opacity: 0.8
              }}
            >
              {description.text}
            </div>
          )}
        </div>
      );
    }

    if (book.coverImage) {
      if (isHovered) {
        // Show stats overlay on hover for image covers
        return (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center p-2 text-center">
            <div className="font-bold text-white mb-1 text-xs">{book.title}</div>
            <div className="text-white text-xs space-y-1">
              <div>📦 {worldStats.assetCount} assets</div>
              <div>🏷️ {worldStats.tagCount} tags</div>
              <div>💾 {worldStats.estimatedSize}</div>
              <div>📁 {worldStats.storageLocation}</div>
              <div>📅 {worldStats.lastModified}</div>
            </div>
          </div>
        );
      }
      return null; // Image covers the entire area when not hovered
    }

    if (isHovered) {
      // Show stats on hover
      return (
        <div className="flex flex-col items-center justify-center h-full p-2 text-center">
          <div className="font-bold text-white mb-2 text-xs">{book.title}</div>
          <div className="text-white text-xs space-y-1 opacity-90">
            <div>📦 {worldStats.assetCount} assets</div>
            <div>🏷️ {worldStats.tagCount} tags</div>
            <div>💾 {worldStats.estimatedSize}</div>
            <div>📁 {worldStats.storageLocation}</div>
            <div>📅 {worldStats.lastModified}</div>
          </div>
        </div>
      );
    }

    // Show normal content when not hovered
    return (
      <div className="flex flex-col items-center justify-center h-full p-2 text-center">
        <div className="font-bold mb-1" style={{ writingMode: 'horizontal-tb' }}>
          {book.title}
        </div>
        {book.description && (
          <div className="text-xs opacity-80 line-clamp-3">
            {book.description}
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      className={`
        ${sizeClasses[size]} 
        rounded-md flex items-center justify-center 
        transition-all duration-300 ease-in-out
        ${book.isLeatherMode && !book.coverImage ? 'leather-texture' : ''}
        ${className}
        relative overflow-hidden
      `}
      style={getCoverStyle()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {renderContent()}
    </div>
  );
};

export default BookCover;
