import { useAuthStore } from '@/stores/authStore';

interface AdBannerProps {
  className?: string;
}

const AdBanner = ({ className = '' }: AdBannerProps) => {
  const { plan } = useAuthStore();

  // Only render for free plan users
  if (plan !== 'free') {
    return null;
  }

  return (
    <div 
      className={`w-full h-[250px] bg-muted/50 border border-border rounded-lg flex items-center justify-center text-muted-foreground text-sm ${className}`}
      aria-label="Advertisement"
    >
      {/* Placeholder for AdSense - future ready for script injection */}
      <div className="text-center">
        <div className="text-xs uppercase tracking-wider mb-2">Advertisement</div>
        <div className="text-xs">Ad Space</div>
      </div>
    </div>
  );
};

export default AdBanner;
