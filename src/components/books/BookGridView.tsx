import React from 'react';
import type { Book } from '@/types/book';
import BookCard from './BookCard';
import EditableBook from './EditableBook';
import { useBookStore } from '@/stores/bookStoreSimple';

interface BookGridViewProps {
  books: Book[];
  selectedBookId?: string;
  onBookSelect: (book: Book) => void;
  onBookDelete?: (bookId: string, event: React.MouseEvent) => void;
  showDeleteButton?: boolean;
  className?: string;
  enableEditing?: boolean;
}

const BookGridView: React.FC<BookGridViewProps> = ({
  books,
  selectedBookId,
  onBookSelect,
  onBookDelete,
  showDeleteButton = false,
  className = '',
  enableEditing = false
}) => {
  const { updateBook } = useBookStore();

  const handleBookUpdate = (updatedBook: Book) => {
    updateBook(updatedBook.id, updatedBook);
    onBookSelect(updatedBook);
  };
  const getGridColumns = () => {
    const count = books.length;
    if (count === 0) return 'grid-cols-1';
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count <= 4) return 'grid-cols-2';
    if (count <= 6) return 'grid-cols-3';
    if (count <= 9) return 'grid-cols-3';
    return 'grid-cols-4';
  };

  if (books.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">No books yet</p>
          <p className="text-gray-500 text-sm">Create your first book to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 h-full overflow-y-auto ${className}`}>
      <div className={`grid ${getGridColumns()} gap-6 max-w-7xl mx-auto`}>
        {books.map((book) => (
          <div
            key={book.id}
            className={`
              flex flex-col items-center
              ${selectedBookId === book.id ? 'ring-2 ring-blue-500 rounded-lg' : ''}
            `}
          >
            {enableEditing ? (
            <EditableBook
              book={book}
              onUpdate={handleBookUpdate}
              onViewWorld={onBookSelect}
              className="w-full"
            />
          ) : (
            <BookCard
              book={book}
              viewMode="grid"
              onSelect={onBookSelect}
              onDelete={onBookDelete}
              showDeleteButton={showDeleteButton}
              className="w-full"
            />
          )}
          </div>
        ))}
      </div>
      
      {/* Add empty slots for visual balance */}
      {books.length > 0 && books.length < 4 && (
        <div className="col-span-full flex justify-center mt-8">
          <p className="text-gray-500 text-sm">
            {books.length} book{books.length !== 1 ? 's' : ''} • Create more to fill the grid
          </p>
        </div>
      )}
    </div>
  );
};

export default BookGridView;
