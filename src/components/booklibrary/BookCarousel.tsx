import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BookItem } from './BookItem';
import type { Book } from '@/types/book';

interface BookCarouselProps {
  books: Book[];
  selectedBookId?: string | null;
  onBookSelect?: (book: Book) => void;
  onBookEdit?: (book: Book) => void;
  onBookDelete?: (book: Book) => void;
}

export function BookCarousel({ 
  books, 
  selectedBookId, 
  onBookSelect, 
  onBookEdit, 
  onBookDelete 
}: BookCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to selected book
  useEffect(() => {
    if (selectedBookId) {
      const selectedIndex = books.findIndex(book => book.id === selectedBookId);
      if (selectedIndex !== -1) {
        setCurrentIndex(selectedIndex);
      }
    }
  }, [selectedBookId, books]);

  const visibleBooks = 3; // Number of books visible at once
  const maxIndex = Math.max(0, books.length - visibleBooks);

  const handlePrevious = () => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => Math.min(maxIndex, prev + 1));
  };

  const getVisibleBooks = () => {
    const start = Math.min(currentIndex, Math.max(0, books.length - visibleBooks));
    const end = start + visibleBooks;
    return books.slice(start, end);
  };

  if (books.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium mb-2">No Books Yet</p>
          <p className="text-sm">Create your first world to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-96 flex items-center justify-center">
      {/* Carousel Container */}
      <div 
        ref={carouselRef}
        className="relative flex items-center justify-center gap-8 px-16"
        style={{ perspective: '1000px' }}
      >
        {/* Navigation Buttons */}
        {currentIndex > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="absolute left-4 z-10 rounded-full w-10 h-10 p-0 glass cosmic-glow"
            onClick={handlePrevious}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        )}

        {currentIndex < maxIndex && (
          <Button
            variant="outline"
            size="sm"
            className="absolute right-4 z-10 rounded-full w-10 h-10 p-0 glass cosmic-glow"
            onClick={handleNext}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}

        {/* Books */}
        {getVisibleBooks().map((book, index) => {
          const globalIndex = currentIndex + index;
          const position = index - 1; // -1, 0, 1 for left, center, right
          const isSelected = book.id === selectedBookId;
          
          // Calculate 3D transforms
          const rotateY = position * -15; // Rotate books towards center
          const translateZ = position === 0 ? 50 : 0; // Center book comes forward
          const scale = position === 0 ? 1.1 : 0.9; // Center book is larger
          const opacity = position === 0 ? 1 : 0.7; // Side books are slightly transparent

          return (
            <div
              key={book.id}
              className="absolute transition-all duration-500 ease-in-out"
              style={{
                transform: `
                  translateX(${position * 200}px)
                  rotateY(${rotateY}deg)
                  translateZ(${translateZ}px)
                  scale(${scale})
                `,
                opacity,
                transformStyle: 'preserve-3d',
                zIndex: position === 0 ? 10 : 5 - Math.abs(position),
              }}
            >
              <BookItem
                book={book}
                isSelected={isSelected}
                onClick={() => onBookSelect?.(book)}
                onEdit={() => onBookEdit?.(book)}
                onDelete={() => onBookDelete?.(book)}
              />
            </div>
          );
        })}
      </div>

      {/* Pedestal */}
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-8">
        <div 
          className="w-96 h-4 bg-gradient-to-b from-foreground/20 to-foreground/10 rounded-full blur-sm"
          style={{ transform: 'rotateX(70deg)' }}
        />
      </div>

      {/* Book Counter */}
      {books.length > visibleBooks && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-sm text-muted-foreground">
          {currentIndex + 1} - {Math.min(currentIndex + visibleBooks, books.length)} of {books.length}
        </div>
      )}
    </div>
  );
}
