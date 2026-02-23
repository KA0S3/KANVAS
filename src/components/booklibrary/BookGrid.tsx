import { BookItem } from './BookItem';
import type { Book } from '@/types/book';

interface BookGridProps {
  books: Book[];
  selectedBookId?: string | null;
  onBookSelect?: (book: Book) => void;
  onBookEdit?: (book: Book) => void;
  onBookDelete?: (book: Book) => void;
}

export function BookGrid({ 
  books, 
  selectedBookId, 
  onBookSelect, 
  onBookEdit, 
  onBookDelete 
}: BookGridProps) {
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
    <div className="relative w-full">
      {/* Grid Container */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 p-6">
        {books.map((book) => (
          <div key={book.id} className="flex justify-center">
            <BookItem
              book={book}
              isSelected={book.id === selectedBookId}
              onClick={() => onBookSelect?.(book)}
              onEdit={() => onBookEdit?.(book)}
              onDelete={() => onBookDelete?.(book)}
            />
          </div>
        ))}
      </div>

      {/* Grid Floor Effect */}
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-foreground/10 to-transparent pointer-events-none" />
    </div>
  );
}
