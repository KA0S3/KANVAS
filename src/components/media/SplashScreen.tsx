import { useEffect } from 'react';
import splashImage from '@/assets/Splash-i.png';
import { useMediaStore } from '@/stores/mediaStore';
import { audioEngine } from '@/services/AudioEngine';

const SplashScreen = () => {
  const { startIntro } = useMediaStore();

  const handleClick = async () => {
    // Start audio with user interaction to bypass autoplay restrictions
    try {
      await audioEngine.startWithUserInteraction();
    } catch (error) {
      console.log('Audio start attempted, will retry after intro');
    }
    startIntro();
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
        {/* Main Title */}
        <h1 
          className="text-6xl md:text-8xl font-bold mb-8 text-center animate-pulse"
          style={{
            fontFamily: '"MedievalSharp", "Almendra", cursive',
            textShadow: '0 0 20px rgba(255, 255, 255, 0.5), 0 0 40px rgba(255, 255, 255, 0.3)',
            letterSpacing: '0.1em'
          }}
        >
          ENTER THE KANVAS
        </h1>
        
        {/* Subtitle */}
        <p 
          className="text-xl md:text-2xl opacity-75 animate-pulse"
          style={{
            fontFamily: '"MedievalSharp", "Almendra", cursive',
            textShadow: '0 0 10px rgba(255, 255, 255, 0.3)'
          }}
        >
          Click anywhere Enter
        </p>
      </div>
    </div>
  );
};

export default SplashScreen;
