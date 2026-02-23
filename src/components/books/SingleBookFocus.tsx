import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Edit } from 'lucide-react';
import type { Book } from '@/types/book';
import BookCover from './BookCover';
import BookEditDialog from '@/components/BookEditDialog';
import { useBookStore } from '@/stores/bookStoreSimple';

interface SingleBookFocusProps {
  books: Book[];
  selectedBookId?: string;
  onBookSelect: (book: Book) => void;
  onBookEnter?: (book: Book) => void;
  onBookDelete?: (bookId: string, event: React.MouseEvent) => void;
  showDeleteButton?: boolean;
  className?: string;
  enableEditing?: boolean; // New prop to enable editing functionality
}

const SingleBookFocus: React.FC<SingleBookFocusProps> = ({
  books,
  selectedBookId,
  onBookSelect,
  onBookEnter,
  onBookDelete,
  showDeleteButton = false,
  className = '',
  enableEditing = false
}) => {
  const { updateBook } = useBookStore();
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (selectedBookId) {
      const index = books.findIndex(book => book.id === selectedBookId);
      return index >= 0 ? index : 0;
    }
    return 0;
  });
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Update currentIndex when selectedBookId changes
  useEffect(() => {
    if (selectedBookId) {
      const index = books.findIndex(book => book.id === selectedBookId);
      if (index >= 0 && index !== currentIndex) {
        setCurrentIndex(index);
      }
    }
  }, [selectedBookId, books, currentIndex]);

  const currentBook = books[currentIndex];

  const handlePrevious = () => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : books.length - 1;
    setCurrentIndex(newIndex);
    const previousBook = books[newIndex];
    if (previousBook) {
      onBookSelect(previousBook);
    }
  };

  const handleNext = () => {
    const newIndex = currentIndex < books.length - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(newIndex);
    const nextBook = books[newIndex];
    if (nextBook) {
      onBookSelect(nextBook);
    }
  };

  const handleBookCardClick = (book: Book) => {
    // Only enter the book on double click, not single click
    // Single click should just show the book in focus
  };

  const handleBookCardDoubleClick = (book: Book) => {
    if (onBookEnter) {
      onBookEnter(book);
    }
  };

  const handleBookUpdate = (updatedBook: Book) => {
    // Update the book in the store
    updateBook(updatedBook.id, updatedBook);
    // Don't call onBookSelect to avoid closing the book library after update
  };

  const handleEditBook = () => {
    setIsEditDialogOpen(true);
  };

  if (!currentBook) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">No books available</p>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center h-full p-8 ${className}`}>
      {/* Left Navigation Button */}
      <button
        onClick={handlePrevious}
        disabled={books.length <= 1}
        className="absolute left-8 p-3 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors z-10"
        title="Previous book"
      >
        <ChevronLeft className="w-6 h-6 text-white" />
      </button>

      {/* Book Display */}
      <div className="flex flex-col items-center justify-center flex-1">
        <div className="perspective-1000">
          <div 
            onDoubleClick={() => handleBookCardDoubleClick(currentBook)}
            className="cursor-pointer group relative transform scale-110"
          >
            <BookCover book={currentBook} size="large" />
            {/* Hover instruction */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-black/80 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              Double-click to enter world
            </div>
          </div>
        </div>

        {/* Mini Navigation Dots */}
        <div className="flex gap-2 mt-6">
          {books.map((book, index) => (
            <button
              key={book.id}
              onClick={() => {
                setCurrentIndex(index);
                onBookSelect(book);
              }}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentIndex 
                  ? 'bg-blue-500' 
                  : 'bg-gray-600 hover:bg-gray-500'
              }`}
              title={book.title}
            />
          ))}
        </div>
      </div>

      {/* Right Navigation Button */}
      <button
        onClick={handleNext}
        disabled={books.length <= 1}
        className="absolute right-8 p-3 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors z-10"
        title="Next book"
      >
        <ChevronRight className="w-6 h-6 text-white" />
      </button>

      {/* Edit Dialog */}
      <BookEditDialog
        book={currentBook}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onBookUpdated={handleBookUpdate}
      />
    </div>
  );
};

export default SingleBookFocus;
