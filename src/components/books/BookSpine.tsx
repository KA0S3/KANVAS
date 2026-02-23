import React from 'react';
import type { Book } from '@/types/book';
import { useThemeStore } from '@/stores/themeStore';

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
  
  const heightClasses = {
    small: 'h-24',
    medium: 'h-36',
    large: 'h-48'
  };

  const getLeatherStyle = () => {
    if (!book.isLeatherMode || book.coverImage) return null;
    
    const leatherColor = book.leatherColor || '#8B4513';
    const isDark = theme === 'dark';
    
    return {
      background: `linear-gradient(90deg, 
        ${isDark ? leatherColor : leatherColor} 0%, 
        ${isDark ? `${leatherColor}dd` : `${leatherColor}ee`} 50%, 
        ${isDark ? leatherColor : leatherColor} 100%)`,
      borderLeft: `1px solid ${isDark ? `${leatherColor}66` : `${leatherColor}99`}`,
      borderRight: `1px solid ${isDark ? `${leatherColor}44` : `${leatherColor}77`}`,
      boxShadow: `inset -1px 0 0 ${isDark ? `${leatherColor}33` : `${leatherColor}55`}, 
                  inset 1px 0 0 ${isDark ? `${leatherColor}55` : `${leatherColor}88`}`
    };
  };

  const getSpineStyle = () => {
    if (book.coverImage) {
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
