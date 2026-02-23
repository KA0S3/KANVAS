import { useState } from 'react';
import { BookOpen, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Book } from '@/types/book';

interface BookItemProps {
  book: Book;
  isSelected?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showControls?: boolean;
}

export function BookItem({ 
  book, 
  isSelected = false, 
  onClick, 
  onEdit, 
  onDelete, 
  showControls = true 
}: BookItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  const bookStyle = book.coverImage 
    ? { backgroundImage: `url(${book.coverImage})` }
    : book.gradient 
      ? { background: book.gradient }
      : { backgroundColor: book.color };

  return (
    <div 
      className="relative group cursor-pointer transition-all duration-300"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      {/* 3D Book Container */}
      <div 
        className={`
          relative preserve-3d transition-transform duration-300
          ${isHovered ? 'transform-gpu scale-105 rotate-y-12' : ''}
          ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
        `}
        style={{
          transformStyle: 'preserve-3d',
          transform: isHovered ? 'scale(1.05) rotateY(12deg)' : 'scale(1) rotateY(0deg)',
        }}
      >
        {/* Book Cover */}
        <Card 
          className="relative w-32 h-48 md:w-40 md:h-56 rounded-sm shadow-2xl overflow-hidden border-0"
          style={bookStyle}
        >
          {/* Book Spine Effect */}
          <div 
            className="absolute left-0 top-0 bottom-0 w-2 opacity-30"
            style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
          />
          
          {/* Book Content */}
          <div className="absolute inset-0 p-3 flex flex-col justify-between text-white">
            {/* Title */}
            <div className="space-y-1">
              <h3 className="font-bold text-sm md:text-base line-clamp-3 drop-shadow-lg">
                {book.title}
              </h3>
              {book.description && (
                <p className="text-xs opacity-80 line-clamp-2 drop-shadow">
                  {book.description}
                </p>
              )}
            </div>
            
            {/* Book Icon */}
            <div className="flex justify-center">
              <BookOpen className="w-6 h-6 md:w-8 md:h-8 opacity-50 drop-shadow-lg" />
            </div>
          </div>

          {/* Hover Overlay */}
          {isHovered && (
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <div className="text-white text-center">
                <BookOpen className="w-8 h-8 mx-auto mb-2" />
                <p className="text-xs font-medium">Click to Open</p>
              </div>
            </div>
          )}
        </Card>

        {/* Book Shadow */}
        <div 
          className="absolute -bottom-2 left-2 right-2 h-4 bg-black/20 rounded-full blur-md"
          style={{ transform: 'translateZ(-10px)' }}
        />
      </div>

      {/* Controls */}
      {showControls && isHovered && (
        <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="secondary"
            className="w-6 h-6 p-0 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.();
            }}
          >
            <Edit className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="w-6 h-6 p-0 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Selection Indicator */}
      {isSelected && (
        <div className="absolute -top-1 -left-1 w-3 h-3 bg-primary rounded-full animate-pulse" />
      )}
    </div>
  );
}
