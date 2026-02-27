import { useState, useEffect } from "react";
import { BookOpen, ChevronLeft, Database, Trash2 } from "lucide-react";
import cosmicBackground from "@/assets/cosmic-background.png";
import lightBackground from "@/assets/BG-light.png";
import { AssetPort } from "@/components/AssetPort";
import { AssetExplorer } from "@/components/explorer/AssetExplorer";
import { BackgroundControls } from "@/components/asset/BackgroundControls";
import { Button } from "@/components/ui/button";
import WorldCreationDialog from "@/components/WorldCreationDialog";
import DataManager from "@/components/DataManager";
import BookShelf from "@/components/books/BookShelf";
import "@/components/books/leather-styles.css";
import { useAssetStore } from "@/stores/assetStore";
import { useBookStore } from "@/stores/bookStoreSimple";
import { useTagStore } from "@/stores/tagStore";
import { useThemeStore } from "@/stores/themeStore";
import { useBackgroundStore } from "@/stores/backgroundStore";
import { useMediaStore } from "@/stores/mediaStore";
import { audioEngine } from "@/services/AudioEngine";
import SplashScreen from "@/components/media/SplashScreen";
import IntroVideo from "@/components/media/IntroVideo";
import BookEntryAnimation from "@/components/media/BookEntryAnimation";
import type { Book } from "@/types/book";
import { navigationCache } from "@/utils/navigationCache";

const Index = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bookLibraryOpen, setBookLibraryOpen] = useState(true);
  const [backgroundRefreshTrigger, setBackgroundRefreshTrigger] = useState(0);
  const [showBookEntryAnimation, setShowBookEntryAnimation] = useState(false);
  const { currentActiveId, loadWorldData, isEditingBackground, setIsEditingBackground, currentViewportId, setActiveAsset, assets, setCurrentViewportId } = useAssetStore();
  const { loadWorldData: loadTagWorldData } = useTagStore();
  const { currentBookId, setCurrentBook, getAllBooks, deleteBook } = useBookStore();
  const { theme } = useThemeStore();
  const { getBackground } = useBackgroundStore(); // Initialize background store
  const { appPhase, showLibrary, setTransitioning, setAppPhase } = useMediaStore();

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  // Audio is now started from splash screen with user interaction
  // useEffect(() => {
  //   if (appPhase === 'LIBRARY') {
  //     audioEngine.start();
  //   }
  // }, [appPhase]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioEngine.cleanup();
    };
  }, []);

  // Restore cached navigation state on mount (non-intrusive)
  useEffect(() => {
    // Only attempt restoration if we're not already in a specific phase
    // This prevents interfering with normal app flow
    if (appPhase !== 'SPLASH') {
      return;
    }

    const cachedState = navigationCache.getState();
    if (!cachedState) {
      return;
    }

    // Only restore if we have meaningful state to restore
    if (cachedState.appPhase !== 'SPLASH' && cachedState.currentBookId) {
      // Restore app phase
      setAppPhase(cachedState.appPhase);

      // Restore current book if it still exists
      const book = getAllBooks().find(b => b.id === cachedState.currentBookId);
      if (book) {
        setCurrentBook(cachedState.currentBookId);
        
        // Load world data if we were in a book view and the book has world data
        if (cachedState.appPhase === 'BOOK_VIEW' && book.worldData) {
          loadWorldData(book.worldData);
          loadTagWorldData(book.worldData);
        }
      }

      // Restore viewport state if it exists
      if (cachedState.currentViewportId) {
        setCurrentViewportId(cachedState.currentViewportId);
      }

      // Restore active asset if it exists
      if (cachedState.currentActiveId) {
        setActiveAsset(cachedState.currentActiveId);
      }

      // Restore UI states
      setSidebarOpen(cachedState.sidebarOpen);
      setBookLibraryOpen(cachedState.bookLibraryOpen);
      setIsEditingBackground(cachedState.isEditingBackground);
    }
  }, []); // Empty dependency array - only run once on mount

  // Save navigation state when relevant state changes (non-intrusive)
  useEffect(() => {
    // Don't save state during splash screen - let users have fresh starts
    if (appPhase === 'SPLASH') {
      navigationCache.clearState();
      return;
    }

    // Only save if we have meaningful state to preserve
    if (!currentBookId && appPhase === 'LIBRARY') {
      return;
    }

    const currentState: import('@/utils/navigationCache').NavigationState = {
      appPhase,
      currentBookId,
      currentViewportId,
      currentActiveId,
      bookLibraryOpen,
      sidebarOpen,
      isEditingBackground,
    };

    // Add viewport asset data if we're in a viewport
    if (currentViewportId && assets[currentViewportId]) {
      const viewportAsset = assets[currentViewportId];
      currentState.viewportAsset = {
        id: viewportAsset.id,
        x: viewportAsset.x,
        y: viewportAsset.y,
        width: viewportAsset.width,
        height: viewportAsset.height,
        viewportConfig: viewportAsset.viewportConfig,
      };
    }

    navigationCache.saveState(currentState);
  }, [
    appPhase,
    currentBookId,
    currentViewportId,
    currentActiveId,
    bookLibraryOpen,
    sidebarOpen,
    isEditingBackground,
    assets, // Include assets to capture viewport changes
  ]);

  const handleBackgroundSave = () => {
    // Force re-render of components that depend on background config
    setBackgroundRefreshTrigger(prev => prev + 1);
  };

  const handleBookSelect = (book: Book) => {
    setCurrentBook(book.id);
    // Don't load world data here - only load when entering viewport from single view
    // Don't close library here - let user stay in book library
  };

  const handleEnterBook = (book: Book) => {
    // Start book entry animation instead of direct entry
    setShowBookEntryAnimation(true);
    setBookLibraryOpen(false);
    
    // Store the book data for after animation
    setTimeout(() => {
      setCurrentBook(book.id);
      loadWorldData(book.worldData);
      loadTagWorldData(book.worldData);
    }, 100);
  };

  const handleBookEntryComplete = () => {
    setShowBookEntryAnimation(false);
  };

  const handleOpenBookLibrary = () => {
    setBookLibraryOpen(true);
  };

  const handleDeleteWorld = (bookId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (window.confirm('Are you sure you want to delete this world? This action cannot be undone.')) {
      deleteBook(bookId);
    }
  };

  const handleWorldCreated = (newBookId: string) => {
    // Find the newly created book
    const allBooks = getAllBooks();
    const newBook = allBooks.find(book => book.id === newBookId);
    
    if (newBook) {
      // Select the new book and focus on it in single view mode
      handleBookSelect(newBook);
    }
  };

  const backgroundStyle = {
    backgroundImage: `url(${theme === 'dark' ? cosmicBackground : lightBackground})`,
    backgroundSize: '300%',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Media Experience Layers */}
      {appPhase === 'SPLASH' && <SplashScreen />}
      {appPhase === 'INTRO_VIDEO' && <IntroVideo />}
      {showBookEntryAnimation && (
        <BookEntryAnimation onEntryComplete={handleBookEntryComplete} />
      )}

      {/* Background Layer */}
      <div
        className={`absolute inset-0 w-full h-full transition-opacity duration-2000 ${
          appPhase === 'LIBRARY' || appPhase === 'BOOK_VIEW' ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          backgroundImage: `url(${theme === 'dark' ? cosmicBackground : lightBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      
      {/* Content Overlay */}
      <div className={`relative z-10 min-h-screen transition-opacity duration-2000 ${
        appPhase === 'LIBRARY' || appPhase === 'BOOK_VIEW' ? 'opacity-100' : 'opacity-0'
      }`}>
      {/* New Book Shelf */}
      {bookLibraryOpen && (
        <div className={`fixed inset-0 z-50 ${
          theme === 'dark' ? 'bg-black/95' : 'bg-background/95'
        }`}>
          <div className="relative h-full">
            {/* Close Button */}
            <button
              onClick={() => setBookLibraryOpen(false)}
              className={`absolute top-4 right-4 z-10 p-2 rounded-lg transition-colors ${
                theme === 'dark'
                  ? 'bg-gray-800 hover:bg-gray-700 text-white'
                  : 'bg-card hover:bg-accent text-foreground border border-border'
              }`}
              title="Close library"
            >
              ✖️
            </button>

            {/* Book Shelf Component */}
            <BookShelf
              onBookSelect={handleBookSelect}
              onBookEnter={handleEnterBook}
              showDeleteButton={true}
              onBookDelete={handleDeleteWorld}
              className="h-full"
              enableEditing={true}
            />

            {/* Create Book Button */}
            <div className="absolute bottom-6 left-6 z-10">
              <WorldCreationDialog onWorldCreated={handleWorldCreated}>
                <Button className={`${
                  theme === 'dark' 
                    ? 'bg-blue-600 hover:bg-blue-700' 
                    : 'bg-primary hover:bg-primary/90'
                }`}>
                  ✨ Create New World
                </Button>
              </WorldCreationDialog>
            </div>

            {/* Backup/Restore Button */}
            <div className="absolute bottom-6 right-6 z-10">
              <DataManager>
                <Button variant="outline" size="sm" className={`${
                  theme === 'dark'
                    ? 'border-gray-600 text-gray-200 hover:bg-gray-800'
                    : 'border-border text-foreground hover:bg-accent'
                }`}>
                  <Database className="w-4 h-4 mr-2" />
                  Backup/Restore
                </Button>
              </DataManager>
            </div>
          </div>
        </div>
      )}

      {/* Main App Content */}
      {currentBookId && (
        <div className="flex h-screen flex-col md:flex-row">
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col relative min-h-0">
            {/* Asset Port */}
            <div className="flex-1 p-2 md:p-4 overflow-hidden">
              <AssetPort 
                onToggleSidebar={() => setSidebarOpen(prev => !prev)} 
                currentWorldTitle={getAllBooks().find(b => b.id === currentBookId)?.title || 'Current World'}
                onOpenWorldLibrary={handleOpenBookLibrary}
              />
            </div>
          </div>

          {/* Fantasy Sidebar - Mobile Overlay */}
          <aside className={`fantasy-overlay ${sidebarOpen ? "is-open" : ""}`} aria-hidden={!sidebarOpen}>
            <div className="fantasy-sidebar">
              <div className="fantasy-sidebar-content">
                {/* Use the new AssetExplorer component */}
                <AssetExplorer sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
              </div>
            </div>
          </aside>

          {/* Background Editor - Independent of sidebar */}
          {isEditingBackground && (
            <BackgroundControls 
              assetId={currentViewportId} 
              onSave={handleBackgroundSave} 
              onToggleSidebar={() => setSidebarOpen(prev => !prev)}
            />
          )}
        </div>
      )}
      </div>
    </div>
  );
};

export default Index;
