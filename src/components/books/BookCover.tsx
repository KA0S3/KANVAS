import React, { useState, useMemo } from 'react';
import { X, Calendar, Tag, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Book } from '@/types/book';
import { useThemeStore } from '@/stores/themeStore';

// Import book cover images
import BlackBook from '@/assets/Book-Covers/Black_book.png';
import BlueBook from '@/assets/Book-Covers/Blue_book.png';
import BrownBook from '@/assets/Book-Covers/brown_book.png';
import GreenBook from '@/assets/Book-Covers/Green_book.png';
import PurpleBook from '@/assets/Book-Covers/purple_book.png';
import WhiteBook from '@/assets/Book-Covers/White_book.png';

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
  const [isFlipped, setIsFlipped] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const handleBookClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(!isFlipped);
  };
  
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
    
    // Map leather colors to book cover images based on preset names
    const getBookCoverImage = (leatherColor: string) => {
      const colorLower = leatherColor.toLowerCase();
      
      // Match based on leather preset names and hex values
      if (colorLower.includes('rich black') || colorLower === '#1a1a1a' || colorLower === '#0d0d0d' || colorLower === '#2d2d2d') {
        return BlackBook;
      }
      if (colorLower.includes('navy blue') || colorLower === '#1e3a8a' || colorLower === '#1e2f5a' || colorLower === '#2563eb') {
        return BlueBook;
      }
      if (colorLower.includes('classic brown') || colorLower === '#8b4513' || colorLower === '#654321' || colorLower === '#a0522d') {
        return BrownBook;
      }
      if (colorLower.includes('forest green') || colorLower === '#2d5016' || colorLower === '#1f3a0f' || colorLower === '#3a6b1e') {
        return GreenBook;
      }
      if (colorLower.includes('royal purple') || colorLower === '#6b46c1' || colorLower === '#553c9a' || colorLower === '#8b5cf6') {
        return PurpleBook;
      }
      if (colorLower.includes('arctic white') || colorLower === '#f5f5f0' || colorLower === '#e8e8e0' || colorLower === '#fafaf5') {
        return WhiteBook;
      }
      
      // Default fallback
      return BrownBook;
    };
    
    const coverImage = getBookCoverImage(book.leatherColor || '#8B4513');
    
    return {
      backgroundImage: `url(${coverImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      border: '2px solid rgba(0,0,0,0.2)',
      boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
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
        // Show description overlay on hover instead of stats
        return (
          <div className="absolute inset-0 bg-amber-100/80 flex items-center justify-center p-3 transition-opacity duration-200 ease-in-out">
            <div className="text-amber-900 text-center">
              <p className="text-xs leading-relaxed">
                {book.description || 'No description available'}
              </p>
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
        // Show description overlay on hover for image covers
        return (
          <div className="absolute inset-0 bg-amber-100/80 flex items-center justify-center p-3 transition-opacity duration-200 ease-in-out">
            <div className="text-amber-900 text-center">
              <p className="text-xs leading-relaxed">
                {book.description || 'No description available'}
              </p>
            </div>
          </div>
        );
      }
      return null; // Image covers entire area when not hovered
    }

    if (isHovered) {
      // Show description on hover instead of stats
      return (
        <div className="absolute inset-0 bg-amber-100/80 flex items-center justify-center p-3 transition-opacity duration-200 ease-in-out">
          <div className="text-amber-900 text-center">
            <p className="text-xs leading-relaxed">
              {book.description || 'No description available'}
            </p>
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
      onClick={handleBookClick}
    >
      {/* Front Content */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${isFlipped ? 'opacity-0' : 'opacity-100'}`}>
        {renderContent()}
      </div>

      {/* Back Content (Stats) */}
      <div 
        className={`absolute inset-0 transition-opacity duration-300 ${isFlipped ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Flipped background */}
        <div 
          className="absolute inset-0"
          style={{
            ...getCoverStyle(),
            transform: 'rotateX(180deg)'
          }}
        ></div>
        
        {/* Semi-transparent overlay for text readability */}
        <div className="absolute inset-0 bg-black/40"></div>
        
        {/* Close Button */}
        <div className="absolute top-2 right-2 z-10">
          <Button
            size="sm"
            variant="ghost"
            className="w-6 h-6 p-0 rounded-full text-white hover:bg-white/20 border border-white/30"
            onClick={(e) => {
              e.stopPropagation();
              setIsFlipped(false);
            }}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>

        {/* Stats Content - Normal orientation */}
        <div className="absolute inset-0 p-3 text-white z-0">
          <div className="space-y-3 text-xs">
            <div>
              <h4 className="font-bold text-sm mb-1 text-blue-300">{book.title || 'Untitled World'}</h4>
              {book.description && (
                <p className="text-xs opacity-90 line-clamp-2">{book.description}</p>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-white/30">
              <div className="flex items-center gap-2">
                <Image className="w-3 h-3 text-green-400 flex-shrink-0" />
                <span className="text-xs">{worldStats?.assetCount || 0} Assets</span>
              </div>
              <div className="flex items-center gap-2">
                <Tag className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                <span className="text-xs">{worldStats?.tagCount || 0} Tags</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-3 h-3 text-purple-400 flex-shrink-0" />
                <span className="text-xs">Created {worldStats?.lastModified || 'Unknown'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookCover;
