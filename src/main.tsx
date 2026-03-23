import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./lib/legacyPlanDetection.ts"; // Import to enable legacy plan detection
import { ConsoleFilter } from "./utils/consoleFilter";
import { silentConsole } from "./utils/silentConsole"; // Import silent console
import "./utils/debugBackgroundStorage"; // Import debug utility
import "./utils/localStorageCleanup"; // Import cleanup utility

// Enable console filtering to reduce log spam
ConsoleFilter.enableFiltering();

// Enable silent console to stop infinite background logs
silentConsole.enable();

createRoot(document.getElementById("root")!).render(<App />);
