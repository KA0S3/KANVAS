import { useState } from 'react';
import { X, Plus, BookOpen, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { useCanCreateBook } from '@/lib/limits';
import { BookCarousel } from './BookCarousel';
import { BookEditor } from './BookEditor';
import { AccountModal } from '@/components/account/AccountModal';
import { UpgradePromptModal } from '@/components/UpgradePromptModal';
import { FeatureTeaserCard } from '@/components/upgrade/FeatureTeaserCard';
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
  const { canCreate: canCreateBook, reason, upgradePrompt: limitUpgradePrompt } = useCanCreateBook();
  const { isAuthenticated, effectiveLimits } = useAuthStore();

  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState<{
    title: string;
    message: string;
    action: string;
  } | null>(null);

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
    // Check if user can create a new book
    if (!canCreateBook) {
      if (limitUpgradePrompt) {
        setUpgradePrompt(limitUpgradePrompt);
      }
      setShowUpgradePrompt(true);
      return;
    }
    
    setIsCreatingBook(true);
  };

  const handleUpgradeAction = () => {
    if (reason === 'guest_limit') {
      // Open account modal for sign in
      setShowAccountModal(true);
    } else if (reason === 'plan_limit') {
      // Open upgrade prompt
      setUpgradePrompt({
        title: 'World Limit Reached',
        message: `You've reached your limit of books. Upgrade to create unlimited worlds and access premium features.`,
        action: 'Upgrade Now'
      });
      setShowUpgradePrompt(true);
    }
  };

  const handleFeatureTeaserUpgrade = (feature: string) => {
    const upgradeMessages = {
      'backup': {
        title: 'Cloud Backup Required',
        message: 'Cloud backup and sync are available for Pro users. Upgrade your plan to automatically backup your work and access it from any device.',
        action: 'Upgrade to Pro'
      },
      'storage': {
        title: 'Storage Quota Exceeded',
        message: 'You need more storage to upload additional files. Upgrade your plan to get 10GB of cloud storage with automatic backups.',
        action: 'Buy Storage'
      },
      'max-books': {
        title: 'World Limit Reached',
        message: `You've reached your limit of books. Upgrade to create unlimited worlds and access premium features.`,
        action: 'Upgrade Now'
      }
    };

    const message = upgradeMessages[feature as keyof typeof upgradeMessages];
    if (message) {
      setUpgradePrompt(message);
      setShowUpgradePrompt(true);
    }
  };

  const handleCloseEditor = () => {
    setEditingBook(null);
    setIsCreatingBook(false);
  };

  const getMaxBooksDisplay = () => {
    const { isAuthenticated, effectiveLimits, plan } = useAuthStore.getState();
    
    if (!isAuthenticated) {
      return 1; // Guest limit
    }
    
    // Check effective limits first
    if (effectiveLimits?.maxBooks !== undefined) {
      return effectiveLimits.maxBooks === -1 ? '∞' : effectiveLimits.maxBooks;
    }
    
    // Fallback to plan-based limits
    const maxBooksByPlan = {
      free: 2,
      pro: -1, // Unlimited
      lifetime: -1 // Unlimited
    };
    
    const maxBooks = maxBooksByPlan[plan as keyof typeof maxBooksByPlan] || 2;
    return maxBooks === -1 ? '∞' : maxBooks;
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
                <span className="text-sm text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                  Books: {allBooks.length} / {getMaxBooksDisplay()}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Account Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAccountModal(true)}
                  className="gap-2"
                  title="Account"
                >
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">Account</span>
                </Button>
                
                {/* Create Book Button */}
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={handleCreateBook} 
                    className="gap-2"
                    disabled={!canCreateBook}
                    title={!canCreateBook ? upgradePrompt?.title : undefined}
                  >
                    <Plus className="w-4 h-4" />
                    New World
                  </Button>
                  
                  {/* Inline CTA for unauthenticated users */}
                  {!isAuthenticated && allBooks.length >= 1 && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      Sign in to save more than 1 world
                    </span>
                  )}
                </div>
              </div>
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
              {/* Feature Teaser Cards for Free Users */}
              {isAuthenticated && effectiveLimits?.source.plan === 'free' && (
                <div className="mb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FeatureTeaserCard 
                      feature="unlimited-worlds" 
                      compact={true}
                      onUpgrade={() => handleFeatureTeaserUpgrade('max-books')}
                    />
                    <FeatureTeaserCard 
                      feature="backup" 
                      compact={true}
                      onUpgrade={() => handleFeatureTeaserUpgrade('storage')}
                    />
                  </div>
                </div>
              )}
              
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

      {/* Account Modal */}
      <AccountModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
      />

      {/* Upgrade Prompt Modal */}
      {upgradePrompt && (
        <UpgradePromptModal
          isOpen={showUpgradePrompt}
          onClose={() => setShowUpgradePrompt(false)}
          title={upgradePrompt.title}
          message={upgradePrompt.message}
          action={upgradePrompt.action}
          onAction={handleUpgradeAction}
          type={reason === 'guest_limit' ? 'guest' : 'plan_limit'}
        />
      )}

    </>
  );
}
