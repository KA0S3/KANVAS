import React, { useState } from 'react';
import type { Book } from '@/types/book';
import BookCover from './BookCover';
import BookSpine from './BookSpine';

interface BookCardProps {
  book: Book;
  viewMode: 'single' | 'spine';
  onSelect?: (book: Book) => void;
  onDelete?: (bookId: string, event: React.MouseEvent) => void;
  showDeleteButton?: boolean;
  className?: string;
}

const BookCard: React.FC<BookCardProps> = ({ 
  book, 
  viewMode, 
  onSelect, 
  onDelete,
  showDeleteButton = false,
  className = ''
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = (event: React.MouseEvent) => {
    if (onDelete && event.target === event.currentTarget) {
      return;
    }
    onSelect?.(book);
  };

  const renderSingleView = () => (
    <div className="relative group">
      <BookCover book={book} size="large" />
      {showDeleteButton && onDelete && (
        <button
          onClick={(e) => onDelete(book.id, e)}
          className="absolute top-2 right-2 p-2 rounded-md bg-red-600/80 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
          title="Delete world"
        >
          ×
        </button>
      )}
    </div>
  );

  const renderGridView = () => (
    <div 
      className="group relative cursor-pointer transition-transform duration-200 hover:scale-105"
      onClick={handleClick}
    >
      <BookCover book={book} size="medium" />
      <div className="mt-2 text-center">
        <h3 className="font-bold text-white truncate">{book.title}</h3>
        {book.description && (
          <p className="text-xs text-gray-400 line-clamp-2">{book.description}</p>
        )}
      </div>
      {showDeleteButton && onDelete && (
        <button
          onClick={(e) => onDelete(book.id, e)}
          className="absolute top-2 right-2 p-2 rounded-md bg-red-600/80 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
          title="Delete world"
        >
          ×
        </button>
      )}
    </div>
  );

  const renderSpineView = () => (
    <div 
      className="cursor-pointer"
      onClick={handleClick}
    >
      <BookSpine book={book} height="medium" />
    </div>
  );

  return (
    <div className={className}>
      {viewMode === 'single' && renderSingleView()}
      {viewMode === 'spine' && renderSpineView()}
    </div>
  );
};

export default BookCard;
