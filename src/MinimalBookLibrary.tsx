import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBookStore } from '@/stores/bookStoreSimple';
import type { Book } from '@/types/book';

interface MinimalBookLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onBookSelect?: (book: Book) => void;
}

export function MinimalBookLibrary({ isOpen, onClose, onBookSelect }: MinimalBookLibraryProps) {
  const { books, createBook } = useBookStore();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateBook = () => {
    const newBook = {
      title: 'Test World',
      description: 'A test world',
      color: '#3b82f6',
      worldData: { assets: {}, tags: {}, globalCustomFields: [], viewportOffset: { x: -45, y: -20 }, viewportScale: 1 }
    };
    
    const bookId = createBook(newBook);
    onBookSelect?.(books[bookId]);
    onClose();
  };

  const bookList = Object.values(books);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>World Library</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {bookList.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-lg mb-4">No worlds yet. Create your first world!</p>
              <Button onClick={handleCreateBook}>
                Create First World
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bookList.map((book) => (
                <div 
                  key={book.id}
                  className="p-4 border rounded-lg cursor-pointer hover:bg-gray-100"
                  onClick={() => onBookSelect?.(book)}
                >
                  <h3 className="font-bold">{book.title}</h3>
                  <p className="text-sm text-gray-600">{book.description}</p>
                </div>
              ))}
            </div>
          )}
          
          {bookList.length > 0 && (
            <div className="flex justify-center">
              <Button onClick={handleCreateBook}>
                Create New World
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
