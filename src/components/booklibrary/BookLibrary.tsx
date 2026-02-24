import { useState } from 'react';
import { X, Plus, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useThemeStore } from '@/stores/themeStore';
import { BookCarousel } from './BookCarousel';
import { BookEditor } from './BookEditor';
import type { Book } from '@/types/book';

interface BookLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onBookSelect?: (book: Book) => void;
}

export function BookLibrary({ isOpen, onClose, onBookSelect }: BookLibraryProps) {
  const { 
    books, 
    currentBookId, 
    viewMode, 
    setViewMode, 
    deleteBook,
    getAllBooks 
  } = useBookStore();
  const { theme } = useThemeStore();

  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [isCreatingBook, setIsCreatingBook] = useState(false);

  const allBooks = getAllBooks();

  const handleBookSelect = (book: Book) => {
    onBookSelect?.(book);
    onClose();
  };

  const handleBookEdit = (book: Book) => {
    setEditingBook(book);
  };

  const handleBookDelete = (book: Book) => {
    if (confirm(`Are you sure you want to delete "${book.title}"? This will permanently remove this world and all its assets.`)) {
      deleteBook(book.id);
    }
  };

  const handleCreateBook = () => {
    setIsCreatingBook(true);
  };

  const handleCloseEditor = () => {
    setEditingBook(null);
    setIsCreatingBook(false);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl w-full h-[80vh] glass cosmic-glow border-glass-border/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              World Library
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col h-full gap-4">
            {/* Header Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Book Count */}
                <span className="text-sm text-muted-foreground">
                  {allBooks.length} {allBooks.length === 1 ? 'world' : 'worlds'}
                </span>
              </div>

              {/* Create Book Button */}
              <Button onClick={handleCreateBook} className="gap-2">
                <Plus className="w-4 h-4" />
                New World
              </Button>
            </div>

            {/* Book Display Area */}
            <div className="flex-1 min-h-0">
              <BookCarousel
                books={allBooks}
                selectedBookId={currentBookId}
                onBookSelect={handleBookSelect}
                onBookEdit={handleBookEdit}
                onBookDelete={handleBookDelete}
              />
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-glass-border/30">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {currentBookId 
                    ? `Current: ${allBooks.find(b => b.id === currentBookId)?.title || 'Unknown'}`
                    : 'No world selected'
                  }
                </span>
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Book Editor Modal */}
      <BookEditor
        isOpen={isCreatingBook || !!editingBook}
        onClose={handleCloseEditor}
        book={editingBook}
      />
    </>
  );
}
