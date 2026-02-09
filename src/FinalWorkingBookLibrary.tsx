import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBookStore } from "@/stores/bookStoreSimple";
import { useAssetStore } from "@/stores/assetStore";
import { useThemeStore } from "@/stores/themeStore";
import type { Book } from "@/types/book";

const FinalWorkingBookLibrary = () => {
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
      {/* Book Library */}
      {showLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-8 max-w-4xl max-h-[80vh] overflow-y-auto m-4">
            <DialogHeader>
              <DialogTitle>📚 World Library</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {bookList.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-lg mb-4">No worlds yet. Create your first world!</p>
                  <Button onClick={handleCreateBook} className="mb-4">
                    ✨ Create First World
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
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-12 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
                            📖
                          </div>
                        </div>
                        <h3 className="font-bold text-lg">{book.title}</h3>
                        <p className="text-sm text-gray-400">{book.description}</p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex justify-center">
                    <Button onClick={handleCreateBook}>
                      ✨ Create New World
                    </Button>
                  </div>
                </>
              )}
            </div>
            
            <div className="flex justify-end mt-6">
              <Button variant="outline" onClick={() => setShowLibrary(false)}>
                ✖️ Close Library
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Only show when book is selected */}
      {currentBookId && (
        <div className="flex h-screen">
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
          
          {/* Asset View - Simple placeholder for now */}
          <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
            <div className="text-center p-8">
              <div className="mb-6">
                <h1 className="text-4xl font-bold text-white mb-4">🎯 Current World</h1>
                <h2 className="text-2xl text-blue-400 mb-2">
                  {bookList.find(b => b.id === currentBookId)?.title || 'No World Selected'}
                </h2>
              </div>
              
              <div className="bg-gray-800 border border-gray-600 rounded-lg p-8 max-w-2xl">
                <h3 className="text-xl font-bold mb-4 text-green-400">✅ Asset Management Ready!</h3>
                <p className="text-gray-300 mb-4">
                  World "{bookList.find(b => b.id === currentBookId)?.title}" is loaded and ready for asset management.
                </p>
                <p className="text-sm text-gray-400">
                  The original AssetPort and AssetExplorer components will be integrated here.
                </p>
                
                <div className="mt-6 space-y-3">
                  <Button onClick={() => setShowLibrary(true)} className="w-full">
                    📚 Open World Library
                  </Button>
                  
                  <Button variant="outline" onClick={() => alert('Asset features coming soon!')} className="w-full">
                    🎨 Create Asset (Coming Soon)
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinalWorkingBookLibrary;
