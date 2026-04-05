import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./lib/legacyPlanDetection.ts"; // Import to enable legacy plan detection
import { ConsoleFilter } from "./utils/consoleFilter";

// Enable console filtering to reduce log spam
ConsoleFilter.enableFiltering();

createRoot(document.getElementById("root")!).render(<App />);
