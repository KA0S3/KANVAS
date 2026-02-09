import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import cosmicBackground from "@/assets/cosmic-background.png";
import lightBackground from "@/assets/BG-light.png";
import { AssetPort } from "@/components/AssetPort";
import { AssetExplorer } from "@/components/explorer/AssetExplorer";
import { Button } from "@/components/ui/button";
import { useAssetStore } from "@/stores/assetStore";
import { useBookStore } from "@/stores/bookStoreSimple";
import { useThemeStore } from "@/stores/themeStore";
import type { Book } from "@/types/book";

const WorkingBookLibrary = () => {
  const [showLibrary, setShowLibrary] = useState(true);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const { loadWorldData } = useAssetStore();
  const { theme } = useThemeStore();
  const { books, createBook, getAllBooks } = useBookStore();

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  const handleBookSelect = (book: Book) => {
    setCurrentBookId(book.id);
    loadWorldData(book.worldData);
    setShowLibrary(false);
  };

  const handleCreateBook = () => {
    const newBook = {
      title: `World ${getAllBooks().length + 1}`,
      description: 'A new world',
      color: '#3b82f6',
      worldData: { assets: {}, tags: {}, globalCustomFields: [], viewportOffset: { x: -45, y: -20 }, viewportScale: 1 }
    };
    
    createBook(newBook);
  };

  const bookList = getAllBooks();

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Book Library - Simple Div Instead of Dialog */}
      {showLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-8 max-w-4xl max-h-[80vh] overflow-y-auto m-4">
            <h2 className="text-2xl font-bold mb-6 text-center">World Library</h2>
            
            {bookList.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-lg mb-4">No worlds yet. Create your first world!</p>
                <Button onClick={handleCreateBook} className="mb-4">
                  Create First World
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {bookList.map((book) => (
                    <div 
                      key={book.id}
                      className="p-4 border border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors"
                      onClick={() => handleBookSelect(book)}
                    >
                      <h3 className="font-bold text-lg mb-2">{book.title}</h3>
                      <p className="text-sm text-gray-400">{book.description}</p>
                    </div>
                  ))}
                </div>
                
                <div className="flex justify-center">
                  <Button onClick={handleCreateBook}>
                    Create New World
                  </Button>
                </div>
              </>
            )}
            
            <div className="flex justify-end mt-6">
              <Button variant="outline" onClick={() => setShowLibrary(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Only show when book is selected */}
      {currentBookId && (
        <div className="flex h-screen">
          {/* Sidebar */}
          <aside className="w-80 bg-glass/80 border-r border-glass-border/40 backdrop-blur-md">
            <div className="p-4">
              <h2 className="text-xl font-bold mb-4 text-foreground">Assets</h2>
              <AssetExplorer />
            </div>
          </aside>
          
          {/* Main Content */}
          <div className="flex-1 flex flex-col">
            {/* World Library Button */}
            <div className="absolute top-4 right-4 z-20">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLibrary(true)}
                className="gap-2 glass cosmic-glow border-glass-border/40"
              >
                <BookOpen className="w-4 h-4" />
                {bookList.find(b => b.id === currentBookId)?.title || 'Current World'}
              </Button>
            </div>
            
            {/* Asset Port */}
            <div className="flex-1 p-4">
              <AssetPort />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkingBookLibrary;
