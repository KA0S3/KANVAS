import { useState } from "react";
import cosmicBackground from "@/assets/cosmic-background.png";
import { AssetPort } from "@/components/AssetPort";
import { AssetExplorer } from "@/components/explorer/AssetExplorer";
import { useAssetStore } from "@/stores/assetStore";

const Index = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { currentActiveId } = useAssetStore();

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Cosmic Background */}
      <div 
        className="absolute inset-0 bg-center bg-no-repeat"
        style={{ 
          backgroundImage: `url(${cosmicBackground})`,
          backgroundSize: "95%",
          backgroundPositionY: "-15px",
        }}
      />
      
      {/* Subtle overlay for better glass contrast */}
      <div className="absolute inset-0 bg-background/20" />
      
      {/* Full-screen Asset Port - positioned above the book area */}
      <div className="relative z-10 flex flex-col h-screen p-4 pt-2">
        <div className="flex-1 w-full mx-auto pb-4" style={{ height: "calc(100vh - 120px)" }}>
          <div className="min-h-[420px] h-full max-w-7xl mx-auto relative">
            <AssetPort onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
          </div>
        </div>
      </div>

      <aside className={`fantasy-overlay ${sidebarOpen ? "is-open" : ""}`} aria-hidden={!sidebarOpen}>
        <div className="fantasy-sidebar">
          <div className="fantasy-sidebar-content">
            {/* Use the new AssetExplorer component */}
            <AssetExplorer sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
          </div>
        </div>
      </aside>
    </div>
  );
};

export default Index;
