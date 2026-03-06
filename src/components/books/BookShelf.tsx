import React, { useState } from 'react';
import { Settings, User } from 'lucide-react';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { AccountModal } from '@/components/account/AccountModal';
import type { Book } from '@/types/book';
import SingleBookFocus from './SingleBookFocus';
import BookSpineView from './BookSpineView';
import ViewModeSelector from './ViewModeSelector';
import BookEditDialog from '@/components/BookEditDialog';

interface BookShelfProps {
  onBookSelect: (book: Book) => void;
  onBookEnter?: (book: Book) => void;
  showDeleteButton?: boolean;
  onBookDelete?: (book: Book) => void;
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
  const { theme } = useThemeStore();
  const { isAuthenticated, plan, effectiveLimits } = useAuthStore();
  const books = getAllBooks();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  // Helper function to get max books display
  const getMaxBooksDisplay = () => {
    // Check effective limits first (owner keys, licenses, etc.)
    if (effectiveLimits?.maxBooks !== undefined) {
      return effectiveLimits.maxBooks === -1 ? '∞' : effectiveLimits.maxBooks;
    }
    
    // Fallback to plan-based limits
    const maxBooksByPlan = {
      free: 1,
      pro: -1, // Unlimited
      lifetime: -1 // Unlimited
    };
    
    const maxBooks = maxBooksByPlan[plan as keyof typeof maxBooksByPlan] || 1;
    return maxBooks === -1 ? '∞' : maxBooks;
  };

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
            onBookEdit={handleEditBook}
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
        backgroundImage: `url(${theme === 'dark' ? '/pedestal-dark.png' : '/pedestal-light.png'})`,
        backgroundSize: '150%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className={`text-xl font-bold drop-shadow-lg ${
                theme === 'dark' ? 'text-white' : 'text-foreground'
              }`}>World Library</h1>
            </div>
            <p className={`text-sm drop-shadow ${
              theme === 'dark' ? 'text-white/80' : 'text-muted-foreground'
            }`}>
              {books.length} book{books.length !== 1 ? 's' : ''} available
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAccountModalOpen(true)}
              className={`${
                theme === 'dark' 
                  ? 'border-white/20 text-white hover:bg-white/10' 
                  : 'border-border text-foreground hover:bg-accent'
              }`}
              title="Account"
            >
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Account</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSettingsOpen(true)}
              className={`${
                theme === 'dark' 
                  ? 'border-white/20 text-white hover:bg-white/10' 
                  : 'border-border text-foreground hover:bg-accent'
              }`}
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>
      </div>

      {/* View Mode Selector - Centered below header */}
      <div className="absolute top-20 left-0 right-0 z-10 flex justify-center">
        <ViewModeSelector
          currentMode={viewMode}
          onModeChange={handleViewModeChange}
          bookCount={books.length}
          enableEditing={enableEditing}
          onEditBook={handleEditBook}
          showEditButton={false}
        />
      </div>

      {/* Main Content Area */}
      <div className="pt-32 h-full">
        <div className="relative h-full transition-all duration-500 ease-in-out">
          {renderViewMode()}
        </div>
      </div>

      {/* Empty State */}
      {books.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">📚</div>
            <h2 className={`text-2xl font-bold mb-2 ${
              theme === 'dark' ? 'text-white' : 'text-foreground'
            }`}>No Books Yet</h2>
            <p className={`mb-6 mt-12 ${
              theme === 'dark' ? 'text-gray-400' : 'text-muted-foreground'
            }`}>
              Create your first book to get started with your library
            </p>
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

      {/* Account Modal */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
      />
    </div>
  );
};

export default BookShelf;
