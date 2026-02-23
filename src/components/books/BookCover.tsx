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
    
    return {
      background: isDark 
        ? `linear-gradient(135deg, ${leatherColor}dd, ${leatherColor}99)`
        : `linear-gradient(135deg, ${leatherColor}, ${leatherColor}cc)`,
      border: `1px solid ${isDark ? leatherColor : `${leatherColor}88`}`,
      boxShadow: isDark 
        ? `inset 0 1px 0 ${leatherColor}44, 0 4px 8px rgba(0,0,0,0.3)`
        : `inset 0 1px 0 ${leatherColor}66, 0 4px 8px rgba(0,0,0,0.1)`
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
          background: book.gradient
        };
      }
      
      if (baseStyle === 'leather' && !showBack) {
        return getLeatherStyle();
      }
    }
    
    // Fallback to original logic
    if (book.gradient && !showBack) {
      return {
        background: book.gradient
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
