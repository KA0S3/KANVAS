import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const Step2Test = () => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Step 2: UI Components</h1>
        <p className="text-xl mb-4">Testing Button and Dialog components</p>
        
        <Button onClick={() => alert('Button works!')} className="mb-4">
          Test Button
        </Button>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Test Dialog</DialogTitle>
            </DialogHeader>
            <p>Dialog content works!</p>
            <Button onClick={() => setIsOpen(false)}>Close</Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Step2Test;
