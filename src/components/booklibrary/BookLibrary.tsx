import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, BookOpen, User, ChevronDown, ChevronUp, Sparkles, Settings } from 'lucide-react';
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
import { DeleteBookModal } from '@/components/books/DeleteBookModal';
import { EnhancedAccountModal } from '@/components/account/EnhancedAccountModal';
import { UpgradePromptModal } from '@/components/UpgradePromptModal';
import { FeatureTeaserCard } from '@/components/upgrade/FeatureTeaserCard';
import { AutosaveIndicator } from '@/components/autosave/AutosaveIndicator';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
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
  const { user, plan, isAuthenticated, effectiveLimits } = useAuthStore();
  const navigate = useNavigate();

  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [upgradePrompt, setUpgradePrompt] = useState<{
    title: string;
    message: string;
    action: string;
  } | null>(null);
  const [generatorsOpen, setGeneratorsOpen] = useState(false);

  const allBooks = getAllBooks();

  const handleBookSelect = (book: Book) => {
    onBookSelect?.(book);
    onClose();
  };

  const handleBookEdit = (book: Book) => {
    setEditingBook(book);
  };

  const handleBookDelete = (book: Book) => {
    setBookToDelete(book);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (bookToDelete) {
      deleteBook(bookToDelete.id);
      setBookToDelete(null);
      setDeleteModalOpen(false);
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
        title: 'Upgrade Required',
        message: limitUpgradePrompt?.message || 'You need to upgrade your plan to create more books.',
        action: 'Upgrade Now'
      });
      setShowUpgradePrompt(true);
    }
  };

  const handleAccountClick = () => {
    // Check if user is authenticated and is an owner
    if (isAuthenticated && user && plan) {
      const ownerEmail = import.meta.env.VITE_OWNER_EMAIL;
      const isOwner = user.email === ownerEmail && plan === 'owner';
      
      // Always open account modal for all users including owners
      setShowAccountModal(true);
    } else {
      // Open account modal for non-authenticated users
      setShowAccountModal(true);
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

  const openGenerator = (generator: string) => {
    window.open(`/generators/${generator}.html`, '_blank', 'width=1200,height=800');
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl w-full h-[80vh] glass cosmic-glow border-glass-border/40 flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              World Library
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col flex-1 gap-4 min-h-0">
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
                {/* Generators Dropdown */}
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setGeneratorsOpen(!generatorsOpen)}
                    className="gap-2"
                    title="Generators"
                    id="generators-button-library"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span className="hidden sm:inline">Generators</span>
                    {generatorsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                  
                  {generatorsOpen && (
                    <div className="absolute top-full mt-1 right-0 z-50 bg-background border border-border rounded-md shadow-lg min-w-[200px]">
                      <div className="py-1">
                        <button
                          onClick={() => openGenerator('character-generator')}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                        >
                          <span>👤</span> Character Generator
                        </button>
                        <button
                          onClick={() => openGenerator('battle-manager')}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                        >
                          <span>⚔️</span> Battle Manager
                        </button>
                        <button
                          onClick={() => openGenerator('city-generator')}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                        >
                          <span>🏰</span> City Generator
                        </button>
                        <button
                          onClick={() => openGenerator('god-generator')}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                        >
                          <span>✨</span> God Generator
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Account Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAccountClick}
                  className="gap-2"
                  title={isAuthenticated ? "Account" : "Sign In"}
                >
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">{isAuthenticated ? 'Account' : 'Sign In'}</span>
                </Button>
                
                {/* Settings Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettingsPanelOpen(true)}
                  className="gap-2"
                  title="Settings"
                  id="settings-button-library"
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Settings</span>
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
                <div className="flex items-center gap-3">
                  <span>
                    {currentBookId 
                      ? `Current: ${allBooks.find(b => b.id === currentBookId)?.title || 'Unknown'}`
                      : 'No world selected'
                    }
                  </span>
                  <AutosaveIndicator />
                </div>
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          </div>

          {/* Terms and Conditions Notice */}
          <div className="text-center pt-2 border-t border-glass-border/20">
            <p className="text-xs text-muted-foreground opacity-60">
              By interacting with this app you confirm you have read and understood the{' '}
              <a 
                href="/terms-of-service" 
                className="underline hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                Terms & Conditions
              </a>
              {' '}and{' '}
              <a 
                href="/privacy-policy" 
                className="underline hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                Privacy Policy
              </a>
            </p>
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
      <EnhancedAccountModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
      />

      {/* Settings Panel */}
      {settingsPanelOpen && (
        <SettingsPanel
          isOpen={settingsPanelOpen}
          onClose={() => setSettingsPanelOpen(false)}
        />
      )}

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

      {/* Delete Book Modal */}
      <DeleteBookModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setBookToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        book={bookToDelete}
      />

    </>
  );
}
