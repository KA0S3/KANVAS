import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./lib/legacyPlanDetection.ts"; // Import to enable legacy plan detection

createRoot(document.getElementById("root")!).render(<App />);
