import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBookStore } from "@/stores/bookStoreSimple";
import type { Book } from "@/types/book";

const Step5Working = () => {
  const { books, createBook, getAllBooks } = useBookStore();
  const [isOpen, setIsOpen] = useState(true);
  const [message, setMessage] = useState("");

  const handleCreateBook = () => {
    try {
      const newBook = {
        title: `World ${getAllBooks().length + 1}`,
        description: 'A new world',
        color: '#3b82f6',
        worldData: { assets: {}, tags: {}, globalCustomFields: [], viewportOffset: { x: -45, y: -20 }, viewportScale: 1 }
      };
      
      createBook(newBook);
      setMessage(`Success! Created book. Total books: ${getAllBooks().length}`);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const bookList = getAllBooks();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="p-8">
        <h1 className="text-4xl font-bold mb-4">Step 5: Simple Integration</h1>
        <p className="text-xl mb-4">Testing book store + UI components together</p>
        
        {message && (
          <div className="mb-4 p-4 bg-green-900 border border-green-700 rounded">
            {message}
          </div>
        )}
        
        <div className="space-y-4">
          <Button onClick={() => setMessage('Button clicked!')}>
            Test Button
          </Button>
          
          <Button onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? 'Close Dialog' : 'Open Dialog'}
          </Button>
          
          <p className="text-sm text-gray-400">Books: {bookList.length}</p>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Simple Book Library</DialogTitle>
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
                <div className="space-y-2">
                  {bookList.map((book) => (
                    <div key={book.id} className="p-4 border border-gray-600 rounded">
                      <h4 className="font-bold">{book.title}</h4>
                      <p className="text-sm text-gray-400">{book.description}</p>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex justify-center">
                <Button onClick={handleCreateBook}>
                  Create New World
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Step5Working;
