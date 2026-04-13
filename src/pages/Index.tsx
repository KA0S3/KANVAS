import { useState, useEffect, useRef } from "react";
import { BookOpen, ChevronLeft, Database, Trash2, Edit } from "lucide-react";
import { ConflictStatusIndicator } from "@/components/ConflictStatusIndicator";
import cosmicBackground from "@/assets/cosmic-background.png";
import lightBackground from "@/assets/BG-light.png";
import { AssetPort } from "@/components/AssetPort";
import { AssetExplorer } from "@/components/explorer/AssetExplorer";
import { BackgroundControls } from "@/components/asset/BackgroundControls";
import { Button } from "@/components/ui/button";
import WorldCreationDialog from "@/components/WorldCreationDialog";
import DataManager from "@/components/DataManager";
import BookShelf from "@/components/books/BookShelf";
import BookEditDialog from "@/components/BookEditDialog";
import "@/components/books/leather-styles.css";
import SideAdBanner from "@/components/SideAdBanner";
import { QuotaWarningBar } from "@/components/QuotaWarningBar";
import { EnhancedAccountModal } from "@/components/account/EnhancedAccountModal";
import { useAssetStore } from "@/stores/assetStore";
import { useAuthStore } from '@/stores/authStore';
import { useTagStore } from "@/stores/tagStore";
import { useThemeStore } from "@/stores/themeStore";
import { useBackgroundStore } from "@/stores/backgroundStore";
import type { BackgroundConfig } from "@/types/background";
import { useMediaStore } from "@/stores/mediaStore";
import { useBookStore } from "@/stores/bookStoreSimple";
import { audioEngine } from "@/services/AudioEngine";
import { autosaveService } from '@/services/autosaveService';
import { documentMutationService } from '@/services/DocumentMutationService';
import SplashScreen from "@/components/media/SplashScreen";
import IntroVideo from "@/components/media/IntroVideo";
import BookEntryAnimation from "@/components/media/BookEntryAnimation";
import OnboardingPopup from "@/components/OnboardingPopup";
import type { Book } from "@/types/book";
import { navigationCache } from "@/utils/navigationCache";

const Index = () => {
  // FEATURE FLAG: Change to true to re-enable ads for all users
  const ADS_ENABLED_FOR_ALL_USERS = false;
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bookLibraryOpen, setBookLibraryOpen] = useState(true);
  const [backgroundRefreshTrigger, setBackgroundRefreshTrigger] = useState(0);
  const [showBookEntryAnimation, setShowBookEntryAnimation] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [lastCloudLoadTime, setLastCloudLoadTime] = useState(0);
  const createWorldButtonRef = useRef<HTMLButtonElement>(null);
  const { currentActiveId, loadWorldData, isEditingBackground, setIsEditingBackground, currentViewportId, setActiveAsset, getCurrentBookAssets, setCurrentViewportId } = useAssetStore(); // Using getCurrentBookAssets method
  // const { loadWorldData: loadTagWorldData } = useTagStore(); // Temporarily disabled to debug
  const { currentBookId, setCurrentBook, getAllBooks, deleteBook } = useBookStore(); // Adding back book store - confirmed working
  const { theme } = useThemeStore(); // Adding back theme store - confirmed working
  // const { getBackground } = useBackgroundStore(); // Temporarily disabled to debug
  const { appPhase, showLibrary, setTransitioning, setAppPhase } = useMediaStore(); // Adding back media store - confirmed working
  // Simple auth state for storage quota functionality
  const { effectiveLimits, isAuthenticated, initializeAuth } = useAuthStore(); // Using working auth store
  const showAds = false; // Temporarily disabled

  // Fallback functions and values
  const loadTagWorldData = (data: any) => {};
  const getBackground = () => null;

  // Initialize auth on mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Load data from cloud when user authenticates - OPTIMIZED
  useEffect(() => {
    if (isAuthenticated && !isCloudLoading) {
      const now = Date.now();
      const debounceTime = 2000; // 2 second debounce for cloud loading
      
      // Prevent rapid successive cloud loads
      if (now - lastCloudLoadTime < debounceTime) {
        console.log('[Index] Cloud loading debounced, too soon since last load');
        return;
      }
      
      console.log('[Index] User authenticated, loading books from cloud...');
      setIsCloudLoading(true);
      setLastCloudLoadTime(now);
      
      // Add a small delay to ensure auth state is fully settled
      const loadTimeout = setTimeout(async () => {
        try {
          // Get current books to check for duplicates
          const currentBooks = getAllBooks();
          const existingBookIds = new Set(Object.keys(currentBooks));
          
          // Load from cloud using DocumentMutationService
          // Note: Book list loading happens separately - this is for world data
          const currentBook = currentBookId;
          let success = false;
          
          if (currentBook) {
            const result = await documentMutationService.loadDocument(currentBook);
            success = result.success;
            if (result.success && result.data) {
              loadWorldData(result.data.world_document);

              // Restore backgrounds from world_document.backgrounds
              if (result.data.world_document?.backgrounds) {
                const backgroundStore = useBackgroundStore.getState();
                const backgrounds = result.data.world_document.backgrounds;
                console.log('[Index] Restoring', Object.keys(backgrounds).length, 'backgrounds for current book');

                Object.entries(backgrounds).forEach(([key, config]) => {
                  const clonedConfig = backgroundStore.cloneConfig(config as BackgroundConfig);
                  backgroundStore.setBackground(key, clonedConfig);
                });
              }
            }
          } else {
            // No current book, just mark as success for now
            success = true;
          }
          
          if (success) {
            console.log('[Index] Books restored from cloud successfully');
            
            // Get updated books after cloud restore
            const updatedBooks = getAllBooks();
            console.log(`[Index] Loading world data for ${updatedBooks.length} books`);
            
            // Only load world data for new books to prevent duplicates
            const newBooks = updatedBooks.filter(book => !existingBookIds.has(book.id));
            
            if (newBooks.length > 0) {
              console.log(`[Index] Found ${newBooks.length} new books to load`);
              
              // Load new books sequentially with longer stagger to reduce load
              const maxConcurrentLoads = 3;
              const batches = [];
              
              for (let i = 0; i < newBooks.length; i += maxConcurrentLoads) {
                batches.push(newBooks.slice(i, i + maxConcurrentLoads));
              }
              
              // Process batches sequentially
              for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex];
                
                const batchPromises = batch.map((book, index) => {
                  return new Promise<void>((resolve) => {
                    setTimeout(() => {
                      documentMutationService.loadDocument(book.id).then(({ success: bookSuccess, data }) => {
                        if (bookSuccess && data) {
                          loadWorldData(data.world_document);

                          // Restore backgrounds for this book
                          if (data.world_document?.backgrounds) {
                            const backgroundStore = useBackgroundStore.getState();
                            const backgrounds = data.world_document.backgrounds;
                            console.log(`[Index] Restoring ${Object.keys(backgrounds).length} backgrounds for book: ${book.title}`);

                            Object.entries(backgrounds).forEach(([key, config]) => {
                              const clonedConfig = backgroundStore.cloneConfig(config as BackgroundConfig);
                              backgroundStore.setBackground(key, clonedConfig);
                            });
                          }
                        }
                        if (bookSuccess) {
                          console.log(`[Index] Loaded world data for new book: ${book.title}`);
                        } else {
                          console.warn(`[Index] Failed to load world data for new book: ${book.title}`);
                        }
                        resolve();
                      }).catch(err => {
                        console.error(`[Index] Error loading new book ${book.title}:`, err);
                        resolve();
                      });
                    }, index * 200); // Stagger loads by 200ms within batch
                  });
                });
                
                // Wait for current batch to complete before starting next
                await Promise.all(batchPromises);
                
                // Add delay between batches
                if (batchIndex < batches.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 500));
                }
              }
              
              console.log('[Index] All new book data loading completed');
            } else {
              console.log('[Index] No new books to load, all books already exist locally');
            }
          } else {
            console.warn('[Index] Failed to restore books from cloud');
          }
        } catch (err) {
          console.error('[Index] Cloud loading failed:', err);
        } finally {
          setIsCloudLoading(false);
        }
      }, 1000); // Increased delay to 1 second for auth state settlement
      
      return () => {
        clearTimeout(loadTimeout);
        setIsCloudLoading(false);
      };
    }
  }, [isAuthenticated, isCloudLoading, lastCloudLoadTime]); // Added loading dependencies

  // Initialize autosave service when authenticated
  // useEffect(() => {
  //   if (isAuthenticated) {
  //     console.log('[Index] User authenticated, autosave will be handled by autosaveService');
  //   } else {
  //     console.log('[Index] User not authenticated, local save only');
  //   }
  // }, [isAuthenticated]); // Temporarily disabled to debug


  // useEffect(() => {
  //   document.documentElement.className = theme;
  // }, [theme]); // Temporarily disabled to debug

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

      // Note: Viewport restoration is now handled by assetStore.initFromBookStore()
      // which runs after assets are loaded, ensuring the viewport asset exists
      // before attempting to restore. This prevents race conditions.

      // Restore active asset if it exists
      if (cachedState.currentActiveId) {
        setActiveAsset(cachedState.currentActiveId);
      }

      // Restore UI states
      setSidebarOpen(cachedState.sidebarOpen);
      setBookLibraryOpen(cachedState.bookLibraryOpen);
      setIsEditingBackground(cachedState.isEditingBackground ?? false);
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
    // Must have a book ID to save - otherwise we save null bookId which breaks viewport restoration
    if (!currentBookId) {
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
    const currentBookAssets = getCurrentBookAssets();
    if (currentViewportId && currentBookAssets[currentViewportId]) {
      const viewportAsset = currentBookAssets[currentViewportId];
      currentState.viewportAsset = {
        id: viewportAsset.id,
        x: viewportAsset.x ?? 0,
        y: viewportAsset.y ?? 0,
        width: viewportAsset.width ?? 100,
        height: viewportAsset.height ?? 100,
        viewportConfig: viewportAsset.viewportConfig ?? {
          zoom: 1,
          panX: 0,
          panY: 0
        },
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
    getCurrentBookAssets, // Include getCurrentBookAssets to capture viewport changes
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

  const handleEnterBook = async (book: Book) => {
    // Start book entry animation instead of direct entry
    setShowBookEntryAnimation(true);
    setBookLibraryOpen(false);
    
    // Load document from server to set currentProjectId for sync
    // This is critical - without it, asset operations won't sync
    const { isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated) {
      const result = await documentMutationService.loadDocument(book.id);
      if (result.success && result.data) {
        console.log('[Index] Loaded document for sync:', result.data.version);
      } else if (result.error === 'Project not found') {
        // Book doesn't exist on server yet - create it
        console.log('[Index] Book not found on server, creating project...');
        const created = await documentMutationService.createProject(
          book.id, 
          book.title,
          book.coverPageSettings
        );
        if (created) {
          console.log('[Index] Created project on server for book:', book.title);
        } else {
          console.warn('[Index] Failed to create project on server');
        }
      } else {
        console.warn('[Index] Could not load document from server:', result.error);
      }
      
      // Sync any backgrounds that were saved locally before entering the book
      // These weren't queued for cloud sync because no project was loaded at the time
      const backgroundStore = useBackgroundStore.getState();
      const allConfigs = backgroundStore.configs;
      if (Object.keys(allConfigs).length > 0) {
        console.log('[Index] Syncing', Object.keys(allConfigs).length, 'backgrounds to cloud');
        documentMutationService.queueOperation({
          op: 'UPDATE_GLOBAL_BACKGROUNDS',
          backgrounds: allConfigs
        });
      }
    }
    
    // Store the book data for after animation
    setTimeout(() => {
      setCurrentBook(book.id);
      loadWorldData(book.worldData);
      loadTagWorldData(book.worldData);

      // Restore backgrounds from book's worldData if present
      if (book.worldData?.backgrounds) {
        const backgroundStore = useBackgroundStore.getState();
        const backgrounds = book.worldData.backgrounds;
        console.log('[Index] Restoring', Object.keys(backgrounds).length, 'backgrounds from book worldData');

        Object.entries(backgrounds).forEach(([key, config]) => {
          const clonedConfig = backgroundStore.cloneConfig(config as BackgroundConfig);
          backgroundStore.setBackground(key, clonedConfig);
        });
      }
    }, 100);
  };

  const handleBookEntryComplete = () => {
    setShowBookEntryAnimation(false);
  };

  const handleOpenBookLibrary = () => {
    setBookLibraryOpen(true);
  };

  const handleDeleteWorld = (book: Book) => {
    deleteBook(book.id);
  };

  const handleWorldCreated = async (newBookId: string) => {
    // Find the newly created book
    const allBooks = getAllBooks();
    const newBook = allBooks.find(book => book.id === newBookId);
    
    if (newBook) {
      // Select the new book and focus on it in single view mode
      handleBookSelect(newBook);
      
      // Immediately create project on server for cloud sync
      const { isAuthenticated } = useAuthStore.getState();
      if (isAuthenticated) {
        console.log('[Index] Creating server project for new book:', newBook.title);
        const created = await documentMutationService.createProject(
          newBook.id,
          newBook.title,
          newBook.coverPageSettings
        );
        if (created) {
          console.log('[Index] Server project created for new book:', newBook.title);
        } else {
          console.warn('[Index] Failed to create server project for new book');
        }
      }
    }
  };

  const handleEditBook = () => {
    const currentBook = getAllBooks().find(b => b.id === currentBookId);
    if (currentBook) {
      setIsEditDialogOpen(true);
    }
  };

  const backgroundStyle = {
    backgroundImage: `url(${theme === 'dark' ? cosmicBackground : lightBackground})`,
    backgroundSize: '300%',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  return (
    <div className="h-screen bg-background text-foreground relative overflow-hidden">
      {/* Quota Warning Bar */}
      <QuotaWarningBar />
      
      {/* Conflict Resolution Status */}
      <div className="absolute top-12 right-4 z-50">
        <ConflictStatusIndicator />
      </div>
      
            
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
      
      {/* Content Overlay with Flex Container */}
      <div className={`relative z-10 h-screen transition-opacity duration-2000 flex w-full overflow-hidden ${
        appPhase === 'LIBRARY' || appPhase === 'BOOK_VIEW' ? 'opacity-100' : 'opacity-0'
      }`}>
        {/* Main App Content - with dynamic max-width based on ad visibility */}
        <div className="flex-1 h-screen overflow-hidden" style={{ maxWidth: `calc(100vw - ${showAds ? '160px' : '0px'})` }}>
      {/* New Book Shelf */}
      {bookLibraryOpen && (
        <div className={`fixed inset-0 z-50 h-screen overflow-hidden ${
          theme === 'dark' ? 'bg-black/95' : 'bg-background/95'
        }`}>
          <div className="relative h-full">
            
            {/* Book Shelf Component */}
            <BookShelf
              onBookSelect={handleBookSelect}
              onBookEnter={handleEnterBook}
              showDeleteButton={true}
              onBookDelete={handleDeleteWorld}
              className="h-full"
              enableEditing={true}
            />

            {/* Edit Book Button */}
            <div className="absolute bottom-20 left-6 z-10">
              <Button
                onClick={handleEditBook}
                disabled={!currentBookId}
                className={`${
                  theme === 'dark' 
                    ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50' 
                    : 'bg-primary hover:bg-primary/90 disabled:bg-gray-400 disabled:opacity-50'
                }`}
                title="Edit current book"
              >
                <Edit className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">Edit</span>
              </Button>
            </div>

            {/* Create Book Button */}
            <div className="absolute bottom-6 left-6 z-10">
              <WorldCreationDialog onWorldCreated={handleWorldCreated}>
                <Button 
                  id="create-world-button"
                  ref={createWorldButtonRef}
                  className={`${
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
                <Button 
                  id="backup-restore-button"
                  variant="outline" 
                  size="sm" 
                  className={`${
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
        <div className="flex h-screen flex-col md:flex-row overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col relative min-h-0 overflow-hidden">
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
          <aside className={`fantasy-overlay ${sidebarOpen ? "is-open" : ""} ${!showAds ? "no-ads" : ""}`} aria-hidden={!sidebarOpen}>
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
        
        {/* Side Ad Banner */}
        <SideAdBanner />
      </div>
      
      {/* Account Modal */}
      <EnhancedAccountModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
      />

      {/* Book Edit Dialog */}
      <BookEditDialog
        book={getAllBooks().find(b => b.id === currentBookId)}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />

      {/* Onboarding Helper Popup */}
      <OnboardingPopup anchorElement={createWorldButtonRef.current} />

    </div>
  );
};

export default Index;
