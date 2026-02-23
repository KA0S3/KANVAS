import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBookStore } from "@/stores/bookStoreSimple";
import type { Book } from "@/types/book";

const Step4Working = () => {
  const { books, createBook, getAllBooks } = useBookStore();
  const [isOpen, setIsOpen] = useState(true);
  const [message, setMessage] = useState("");

  const handleCreateBook = () => {
    try {
      const newBook = {
        title: 'Test World',
        description: 'A test world',
        color: '#3b82f6',
        worldData: { assets: {}, tags: {}, globalCustomFields: [], viewportOffset: { x: -45, y: -20 }, viewportScale: 1 }
      };
      
      createBook(newBook);
      setMessage(`Success! Created book. Total books: ${getAllBooks().length}`);
      setIsOpen(false);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const handleBookSelect = (book: Book) => {
    setMessage(`Selected: ${book.title}`);
    setIsOpen(false);
  };

  const bookList = getAllBooks();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="p-8">
        <h1 className="text-4xl font-bold mb-4">Step 4: Book Library</h1>
        <p className="text-xl mb-4">Testing book library interface</p>
        
        {message && (
          <div className="mb-4 p-4 bg-green-900 border border-green-700 rounded">
            {message}
          </div>
        )}
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
                      className="p-4 border rounded-lg cursor-pointer hover:bg-gray-700"
                      onClick={() => handleBookSelect(book)}
                    >
                      <h3 className="font-bold">{book.title}</h3>
                      <p className="text-sm text-gray-400">{book.description}</p>
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
      </div>
    </div>
  );
};

export default Step4Working;
