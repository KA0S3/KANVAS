import { useEffect, useState } from 'react';
import splashImage from '@/assets/Splash-i.png';
import { useMediaStore } from '@/stores/mediaStore';
import { audioEngine } from '@/services/AudioEngine';
import WhatIsKanvasModal from '@/components/WhatIsKanvasModal';

const SplashScreen = () => {
  const { startIntro, audioEnabled, setAudioEnabled, setVideoSoundsEnabled } = useMediaStore();
  const [isModalOpen, setIsModalOpen] = useState(false);


  const handleClick = async () => {
    // Start audio with user interaction to bypass autoplay restrictions
    try {
      await audioEngine.startWithUserInteraction();
    } catch (error) {
      console.log('Audio start attempted, will retry after intro');
    }
    startIntro();
  };

  const handleAudioToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newAudioState = !audioEnabled;
    setAudioEnabled(newAudioState);
    setVideoSoundsEnabled(newAudioState);
  };

  const handleWhatIsKanvasClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsModalOpen(true);
  };

  return (
    <div 
      className="fixed inset-0 w-full h-screen cursor-pointer overflow-hidden bg-black"
      onClick={handleClick}
      style={{ zIndex: 9999 }}
    >
      {/* Background Image */}
      <div 
        className="absolute inset-0 w-full h-full"
        style={{
          backgroundImage: `url(${splashImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      
      {/* Overlay Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full text-white">
        {/* What is KANVAS? Button - Top Left */}
        <button
          onClick={handleWhatIsKanvasClick}
          className="absolute top-6 left-6 px-4 py-2 rounded-lg transition-all hover:scale-105"
          style={{
            fontFamily: '"MedievalSharp", "Almendra", cursive',
            textShadow: '0 0 10px rgba(255, 255, 255, 0.3)'
          }}
        >
          <span className="text-white font-medium">What is KANVAS?</span>
        </button>

        {/* Main Title */}
        <h1 
          className="text-9xl md:text-11xl lg:text-12xl font-bold mb-4 text-center animate-pulse-glow"
          style={{
            fontFamily: '"MedievalSharp", "Almendra", cursive',
            textShadow: '0 0 30px rgba(255, 255, 255, 0.6), 0 0 60px rgba(255, 255, 255, 0.4)',
            letterSpacing: '0.15em'
          }}
        >
          KANVAS
        </h1>
        
        {/* Tagline */}
        <p 
          className="text-xl md:text-2xl opacity-60 mb-8 text-center"
          style={{
            fontFamily: '"MedievalSharp", "Almendra", cursive',
            textShadow: '0 0 10px rgba(255, 255, 255, 0.3)'
          }}
        >
          For the Visual Organizer
        </p>
        
        {/* Subtitle with Audio Toggle */}
        <div className="flex items-center gap-3">
          <p 
            className="text-lg md:text-xl opacity-75"
            style={{
              fontFamily: '"MedievalSharp", "Almendra", cursive',
              textShadow: '0 0 10px rgba(255, 255, 255, 0.3)'
            }}
          >
            Click anywhere to enter
          </p>
          
          {/* Audio Toggle */}
          <div 
            className="flex items-center gap-1 px-2 py-1 rounded-full hover:bg-white/20 transition-all cursor-pointer"
            onClick={handleAudioToggle}
          >
            <span className="text-xs text-white opacity-75">Audio</span>
            <div className="relative w-8 h-4">
              <div 
                className={`absolute inset-0.5 rounded-full transition-colors ${
                  audioEnabled ? 'bg-green-500' : 'bg-gray-500'
                }`}
              />
              <div 
                className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                  audioEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </div>
            <span className="text-xs text-white opacity-60">
              {audioEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        
        {/* Terms and Conditions Notice */}
        <div className="absolute bottom-4 left-0 right-0 text-center">
          <p className="text-xs text-white opacity-60">
            By interacting with this app you confirm you have read and understood the{' '}
            <a 
              href="/terms-of-service" 
              className="underline hover:opacity-100 text-white"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              Terms & Conditions
            </a>
            {' '}and{' '}
            <a 
              href="/privacy-policy" 
              className="underline hover:opacity-100 text-white"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              Privacy Policy
            </a>
          </p>
        </div>
      </div>

      {/* What is KANVAS? Modal */}
      <WhatIsKanvasModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </div>
  );
};

export default SplashScreen;
