import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { useBookStore } from '@/stores/bookStoreSimple';
import { Button } from '@/components/ui/button';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import type { Book } from '@/types/book';
import SingleBookFocus from './SingleBookFocus';
import BookSpineView from './BookSpineView';
import ViewModeSelector from './ViewModeSelector';
import BookEditDialog from '@/components/BookEditDialog';

interface BookShelfProps {
  onBookSelect: (book: Book) => void;
  onBookEnter?: (book: Book) => void;
  showDeleteButton?: boolean;
  onBookDelete?: (bookId: string, event: React.MouseEvent) => void;
  className?: string;
  enableEditing?: boolean; // New prop to enable editing functionality
}

const BookShelf: React.FC<BookShelfProps> = ({
  onBookSelect,
  onBookEnter,
  showDeleteButton = false,
  onBookDelete,
  className = '',
  enableEditing = false
}) => {
  const { viewMode, setViewMode, getAllBooks, currentBookId, setCurrentBook, getCurrentBook } = useBookStore();
  const books = getAllBooks();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleBookSelect = (book: Book) => {
    // Set the current book in store
    setCurrentBook(book.id);
    // If selecting from spine view, switch to single view mode
    if (viewMode === 'spine') {
      setViewMode('single');
    }
    onBookSelect(book);
  };

  const handleViewModeChange = (newMode: 'single' | 'spine') => {
    setViewMode(newMode);
  };

  const handleEditBook = () => {
    const currentBook = getCurrentBook();
    if (currentBook) {
      setIsEditDialogOpen(true);
    }
  };

  const renderViewMode = () => {
    switch (viewMode) {
      case 'single':
        return (
          <SingleBookFocus
            books={books}
            selectedBookId={currentBookId}
            onBookSelect={handleBookSelect}
            onBookEnter={onBookEnter}
            onBookDelete={onBookDelete}
            showDeleteButton={showDeleteButton}
            enableEditing={enableEditing}
          />
        );
      case 'spine':
        return (
          <BookSpineView
            books={books}
            selectedBookId={currentBookId}
            onBookSelect={handleBookSelect}
            onBookDelete={onBookDelete}
            showDeleteButton={showDeleteButton}
            enableEditing={enableEditing}
          />
        );
      default:
        return (
          <SingleBookFocus
            books={books}
            selectedBookId={currentBookId}
            onBookSelect={handleBookSelect}
            onBookDelete={onBookDelete}
            showDeleteButton={showDeleteButton}
            enableEditing={enableEditing}
          />
        );
    }
  };

  return (
    <div 
      className={`relative h-full ${className}`}
      style={{
        backgroundImage: 'url(/src/assets/pedestal-dark.png)',
        backgroundSize: '150%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Header with View Mode Selector */}
      <div className="absolute top-0 left-0 right-0 z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-white drop-shadow-lg">World Library</h1>
            <p className="text-sm text-white/80 drop-shadow">
              {books.length} book{books.length !== 1 ? 's' : ''} available
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSettingsOpen(true)}
              className="border-white/20 text-white hover:bg-white/10"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
            
            <ViewModeSelector
              currentMode={viewMode}
              onModeChange={handleViewModeChange}
              bookCount={books.length}
              enableEditing={enableEditing}
              onEditBook={handleEditBook}
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="pt-20 h-full">
        {renderViewMode()}
      </div>

      {/* Empty State */}
      {books.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">📚</div>
            <h2 className="text-2xl font-bold text-white mb-2">No Books Yet</h2>
            <p className="text-gray-400 mb-6">
              Create your first book to get started with your library
            </p>
            <div className="text-sm text-gray-500">
              Your books will appear here once you create them
            </div>
          </div>
        </div>
      )}

      {/* Book Edit Dialog */}
      <BookEditDialog
        book={getCurrentBook()}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};

export default BookShelf;
