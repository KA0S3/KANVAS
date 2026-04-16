import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./lib/legacyPlanDetection.ts"; // Import to enable legacy plan detection
import { ConsoleFilter } from "./utils/consoleFilter";

// Enable console filtering to reduce log spam
ConsoleFilter.enableFiltering();

// Request persistent storage to prevent data eviction under storage pressure
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((persisted) => {
    console.log(`[Main] Persistent storage ${persisted ? 'granted' : 'denied'}`);
  }).catch((err) => {
    console.warn('[Main] Failed to request persistent storage:', err);
  });
}

createRoot(document.getElementById("root")!).render(<App />);
