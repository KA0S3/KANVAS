import React from 'react';

const SideAdBanner = () => {
  return (
    <div className="fixed right-0 top-0 h-full w-[160px] bg-background/95 backdrop-blur-sm border-l border-border/20 flex items-center justify-center z-40 shadow-lg">
      <div className="text-center text-muted-foreground text-xs p-4">
        <div className="text-xs mb-2 opacity-60">Advertisement</div>
        <div className="w-[120px] h-[600px] bg-muted/30 rounded-lg flex items-center justify-center border border-border/10">
          <div className="text-center">
            <div className="text-xs font-medium mb-1">AdSense</div>
            <div className="text-[10px] opacity-50">160x600</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SideAdBanner;
