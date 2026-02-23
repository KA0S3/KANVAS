import { useState } from "react";
import { Button } from "@/components/ui/button";

const Step2bTest = () => {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Step 2b: Button Only</h1>
        <p className="text-xl mb-4">Testing just Button component</p>
        
        <Button onClick={() => setCount(count + 1)} className="mb-4">
          Count: {count}
        </Button>
        
        <p>Button component test</p>
      </div>
    </div>
  );
};

export default Step2bTest;
