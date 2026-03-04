import { useAuthStore } from '@/stores/authStore';

const ExternalAdBanner = () => {
  const { plan } = useAuthStore();

  // Only render for free plan users
  if (plan !== 'free') {
    return null;
  }

  return (
    <div className="hidden xl:block fixed top-0 right-0 h-screen w-[200px] bg-card/50 border-l border-border backdrop-blur-sm z-30">
      <div className="h-full flex flex-col items-center justify-center p-4">
        {/* Placeholder for AdSense script - vertical banner */}
        <div className="w-full text-center text-muted-foreground" aria-label="Advertisement">
          <div className="text-xs uppercase tracking-wider mb-4 opacity-60">Advertisement</div>
          <div className="w-full h-[600px] bg-muted/30 border border-border/50 rounded-lg flex items-center justify-center">
            <div className="text-xs opacity-50">
              <div className="mb-2">Ad Space</div>
              <div className="w-16 h-16 bg-muted/50 rounded mx-auto mb-2"></div>
              <div className="text-xs">160×600</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExternalAdBanner;
