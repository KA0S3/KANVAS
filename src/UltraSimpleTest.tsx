import { useState } from "react";

const UltraSimpleTest = () => {
  const [message, setMessage] = useState("Loading...");

  setTimeout(() => {
    setMessage("If you can see this, the app is working!");
  }, 1000);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Ultra Simple Test</h1>
        <p className="text-xl">{message}</p>
      </div>
    </div>
  );
};

export default UltraSimpleTest;
