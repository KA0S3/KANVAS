import { useEffect } from 'react';
import splashImage from '@/assets/Splash-i.png';
import { useMediaStore } from '@/stores/mediaStore';
import { audioEngine } from '@/services/AudioEngine';
import { Users, Building, Sparkles, Swords } from 'lucide-react';

const SplashScreen = () => {
  const { startIntro } = useMediaStore();

  const handleGeneratorClick = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('Opening generator:', url);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

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
          className="text-6xl md:text-8xl font-bold mb-8 text-center animate-pulse-glow"
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
          className="text-xl md:text-2xl opacity-75 animate-pulse -mt-4"
          style={{
            fontFamily: '"MedievalSharp", "Almendra", cursive',
            textShadow: '0 0 10px rgba(255, 255, 255, 0.3)'
          }}
        >
          Click anywhere to enter
        </p>

        {/* Generator Buttons */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={(e) => handleGeneratorClick(e, '/generators/character-generator.html')}
            className="group relative p-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all duration-300 hover:scale-105"
            title="Character Generator"
          >
            <Users className="w-4 h-4" />
            <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              Characters
            </span>
          </button>
          
          <button
            onClick={(e) => handleGeneratorClick(e, '/generators/city-generator.html')}
            className="group relative p-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all duration-300 hover:scale-105"
            title="City Generator"
          >
            <Building className="w-4 h-4" />
            <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              Cities
            </span>
          </button>
          
          <button
            onClick={(e) => handleGeneratorClick(e, '/generators/god-generator.html')}
            className="group relative p-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all duration-300 hover:scale-105"
            title="God Generator"
          >
            <Sparkles className="w-4 h-4" />
            <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              Gods
            </span>
          </button>
          
          <button
            onClick={(e) => handleGeneratorClick(e, '/generators/battle-manager.html')}
            className="group relative p-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all duration-300 hover:scale-105"
            title="Battle Manager"
          >
            <Swords className="w-4 h-4" />
            <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              Battles
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
