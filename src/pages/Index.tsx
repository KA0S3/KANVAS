import { useState, useEffect } from "react";
import { BookOpen, ChevronLeft, Database, Trash2 } from "lucide-react";
import cosmicBackground from "@/assets/cosmic-background.png";
import lightBackground from "@/assets/BG-light.png";
import { AssetPort } from "@/components/AssetPort";
import { AssetExplorer } from "@/components/explorer/AssetExplorer";
import { Button } from "@/components/ui/button";
import WorldCreationDialog from "@/components/WorldCreationDialog";
import DataManager from "@/components/DataManager";
import { useAssetStore } from "@/stores/assetStore";
import { useBookStore } from "@/stores/bookStoreSimple";
import { useThemeStore } from "@/stores/themeStore";
import type { Book } from "@/types/book";

const Index = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bookLibraryOpen, setBookLibraryOpen] = useState(true);
  const { currentActiveId, loadWorldData } = useAssetStore();
  const { currentBookId, setCurrentBook, getAllBooks, deleteBook } = useBookStore();
  const { theme } = useThemeStore();

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  const handleBookSelect = (book: Book) => {
    setCurrentBook(book.id);
    loadWorldData(book.worldData);
    setBookLibraryOpen(false);
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

  const backgroundStyle = {
    backgroundImage: `url(${theme === 'dark' ? cosmicBackground : lightBackground})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  return (
    <div className="min-h-screen bg-background text-foreground" style={backgroundStyle}>
      {/* Simple Book Library */}
      {bookLibraryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-8 max-w-4xl max-h-[80vh] overflow-y-auto m-4">
            <h2 className="text-2xl font-bold text-white mb-6">📚 World Library</h2>
            
            <div className="space-y-4">
              {getAllBooks().length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-lg text-white mb-4">No worlds yet. Create your first world!</p>
                  <WorldCreationDialog onWorldCreated={(worldId) => setCurrentBook(worldId)}>
                    <Button className="mb-4">
                      ✨ Create First World
                    </Button>
                  </WorldCreationDialog>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {getAllBooks().map((book) => (
                      <div 
                        key={book.id}
                        className="p-4 border border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors relative group"
                        onClick={() => handleBookSelect(book)}
                      >
                        <button
                          onClick={(e) => handleDeleteWorld(book.id, e)}
                          className="absolute top-2 right-2 p-2 rounded-md bg-red-600/80 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete world"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        
                        <div className="pr-8">
                          <h3 className="font-bold text-lg text-white">{book.title}</h3>
                          <p className="text-sm text-gray-400">{book.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex justify-center">
                    <WorldCreationDialog>
                      <Button>
                        ✨ Create New World
                      </Button>
                    </WorldCreationDialog>
                  </div>
                </>
              )}
            </div>
            
            <div className="flex justify-between items-center mt-6">
              <DataManager>
                <Button variant="outline" size="sm" className="border-gray-600 text-gray-200 hover:bg-gray-800">
                  <Database className="w-4 h-4 mr-2" />
                  Backup/Restore
                </Button>
              </DataManager>
              
              <Button variant="outline" onClick={() => setBookLibraryOpen(false)}>
                ✖️ Close Library
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main App Content */}
      {currentBookId && (
        <div className="flex h-screen">
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col relative">
            {/* Asset Port */}
            <div className="flex-1 p-4">
              <AssetPort 
                onToggleSidebar={() => setSidebarOpen(prev => !prev)} 
                currentWorldTitle={getAllBooks().find(b => b.id === currentBookId)?.title || 'Current World'}
                onOpenWorldLibrary={handleOpenBookLibrary}
              />
            </div>
          </div>

          {/* Fantasy Sidebar */}
      <aside className={`fantasy-overlay ${sidebarOpen ? "is-open" : ""}`} aria-hidden={!sidebarOpen}>
        <div className="fantasy-sidebar">
          <div className="fantasy-sidebar-content">
            {/* Use the new AssetExplorer component */}
            <AssetExplorer sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
          </div>
        </div>
      </aside>
        </div>
      )}
    </div>
  );
};

export default Index;
