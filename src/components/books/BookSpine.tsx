import React, { useEffect, useState } from 'react';
import type { Book } from '@/types/book';
import { useThemeStore } from '@/stores/themeStore';
import useImageColorExtractor from '@/hooks/useImageColorExtractor';

// Import book cover images
import BlackBook from '@/assets/Book-Covers/Black_book.png';
import BlueBook from '@/assets/Book-Covers/Blue_book.png';
import BrownBook from '@/assets/Book-Covers/brown_book.png';
import GreenBook from '@/assets/Book-Covers/Green_book.png';
import PurpleBook from '@/assets/Book-Covers/purple_book.png';
import WhiteBook from '@/assets/Book-Covers/White_book.png';

interface BookSpineProps {
  book: Book;
  height?: 'small' | 'medium' | 'large';
  className?: string;
}

const BookSpine: React.FC<BookSpineProps> = ({ 
  book, 
  height = 'medium',
  className = ''
}) => {
  const { theme } = useThemeStore();
  const { extractColor, getColor } = useImageColorExtractor();
  const [extractedSpineColor, setExtractedSpineColor] = useState<string | null>(null);
  
  const heightClasses = {
    small: 'h-24',
    medium: 'h-36',
    large: 'h-48'
  };

  // Extract color from cover image when it changes
  useEffect(() => {
    if (book.coverImage) {
      console.log('BookSpine: Extracting color for book:', book.title);
      // Check cache first
      const cachedColor = getColor(book.coverImage);
      if (cachedColor) {
        console.log('BookSpine: Using cached color:', cachedColor);
        setExtractedSpineColor(cachedColor);
      } else {
        console.log('BookSpine: Extracting new color...');
        // Extract color asynchronously
        extractColor(book.coverImage).then((color) => {
          if (color) {
            console.log('BookSpine: Color extracted:', color);
            setExtractedSpineColor(color);
          }
        });
      }
    } else {
      setExtractedSpineColor(null);
    }
  }, [book.coverImage, extractColor, getColor]);

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
      borderLeft: '1px solid rgba(0,0,0,0.3)',
      borderRight: '1px solid rgba(0,0,0,0.2)',
      boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.2), inset 1px 0 0 rgba(0,0,0,0.1)'
    };
  };

  const getSpineStyle = () => {
    if (book.coverImage && extractedSpineColor) {
      // Use extracted color with vertical gradient for depth
      return {
        background: `
          linear-gradient(135deg, 
            ${extractedSpineColor} 0%, 
            ${extractedSpineColor}cc 30%, 
            ${extractedSpineColor}99 50%, 
            ${extractedSpineColor}cc 70%, 
            ${extractedSpineColor} 100%
          )
        `,
        borderLeft: '1px solid rgba(0,0,0,0.3)',
        borderRight: '1px solid rgba(0,0,0,0.2)',
        boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.2), inset 1px 0 0 rgba(0,0,0,0.1)'
      };
    }
    
    if (book.coverImage && !extractedSpineColor) {
      // Fallback while color is being extracted
      return {
        backgroundColor: book.color || '#3b82f6'
      };
    }
    
    if (book.gradient) {
      return {
        background: `linear-gradient(90deg, ${book.gradient})`
      };
    }
    
    return getLeatherStyle() || {
      backgroundColor: book.color || '#3b82f6'
    };
  };

  const truncateTitle = (title: string, maxLength: number) => {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength - 2) + '..';
  };

  return (
    <div 
      className={`
        ${heightClasses[height]} 
        w-12 flex items-center justify-center 
        transition-all duration-200 ease-in-out
        hover:w-14 cursor-pointer
        ${book.isLeatherMode && !book.coverImage ? 'leather-spine' : ''}
        ${className}
      `}
      style={getSpineStyle()}
    >
      <div 
        className="text-white font-bold text-center leading-tight"
        style={{ 
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          fontSize: height === 'small' ? '10px' : height === 'medium' ? '12px' : '14px',
          textShadow: theme === 'dark' 
            ? '0 1px 2px rgba(0,0,0,0.8)' 
            : '0 1px 2px rgba(0,0,0,0.3)'
        }}
      >
        {truncateTitle(book.title, height === 'small' ? 15 : height === 'medium' ? 20 : 25)}
      </div>
    </div>
  );
};

export default BookSpine;
