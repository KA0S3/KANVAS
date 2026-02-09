import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useBookStore } from "@/stores/bookStoreSimple";

const Step3Test = () => {
  const { books, createBook, getAllBooks } = useBookStore();
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
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Step 3: Book Store</h1>
        <p className="text-xl mb-4">Testing book store functionality</p>
        
        <div className="mb-4">
          <p className="mb-2">Current books: {getAllBooks().length}</p>
          <Button onClick={handleCreateBook}>
            Create Test Book
          </Button>
        </div>
        
        {message && (
          <div className="mt-4 p-4 bg-green-900 border border-green-700 rounded">
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export default Step3Test;
