import { useEffect, useState, useRef } from 'react';
import splashImage from '@/assets/Splash-i.png';
import { useMediaStore } from '@/stores/mediaStore';
import { audioEngine } from '@/services/AudioEngine';

const SplashScreen = () => {
  const { startIntro } = useMediaStore();
  const [mouseX, setMouseX] = useState(50);
  const [borderPosition, setBorderPosition] = useState(50);
  const mouseHalfRef = useRef<'left' | 'right'>('left');
  const pulseDirectionRef = useRef(1);
  const isPulsingRef = useRef(false);
  const pulsePhaseRef = useRef(0);
  const mouseOnScreenRef = useRef(false);
  const mountTimeRef = useRef(Date.now());
  const bufferElapsedRef = useRef(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    mouseOnScreenRef.current = true;
    const percentage = (e.clientX / window.innerWidth) * 100;
    setMouseX(percentage);
    const newHalf = percentage < 50 ? 'left' : 'right';
    if (newHalf !== mouseHalfRef.current) {
      mouseHalfRef.current = newHalf;
      isPulsingRef.current = false;
      pulseDirectionRef.current = 1;
      pulsePhaseRef.current = 0;
    }
  };

  const handleMouseLeave = () => {
    mouseOnScreenRef.current = false;
    isPulsingRef.current = false;
    pulsePhaseRef.current = 0;
  };

  const handleClick = async (e: React.MouseEvent) => {
    // Detect which side was clicked based on mouse position
    const clickX = e.clientX;
    const screenWidth = window.innerWidth;
    const launchMode = clickX < screenWidth / 2 ? 'professional' : 'full';

    // Only start audio for full mode
    if (launchMode === 'full') {
      try {
        await audioEngine.startWithUserInteraction();
      } catch (error) {
        console.log('Audio start attempted, will retry after intro');
      }
    }

    startIntro(launchMode);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setBorderPosition((prev) => {
        const speed = 0.05;
        const edgeThreshold = 5;
        const pulseRange = 20;
        const pulseSpeed = 0.02;

        // Check if 7-second buffer has elapsed
        const elapsedTime = Date.now() - mountTimeRef.current;
        if (elapsedTime < 7000) {
          bufferElapsedRef.current = false;
          return 50; // Stay at center during buffer
        }
        bufferElapsedRef.current = true;

        // Return to middle if mouse is off screen
        if (!mouseOnScreenRef.current) {
          if (prev > 50) {
            return Math.max(prev - speed, 50);
          } else if (prev < 50) {
            return Math.min(prev + speed, 50);
          }
          return 50;
        }

        if (mouseHalfRef.current === 'left') {
          // Moving toward right edge (color expanding)
          if (!isPulsingRef.current && prev < 100 - edgeThreshold) {
            return Math.min(prev + speed, 100 - edgeThreshold);
          } else {
            // Start or continue pulsing at the edge with sine wave easing
            isPulsingRef.current = true;
            const center = 100 - edgeThreshold;
            pulsePhaseRef.current += pulseSpeed;
            const sineValue = Math.sin(pulsePhaseRef.current);
            const easedPosition = center + (sineValue * pulseRange);
            return Math.max(0, Math.min(100, easedPosition));
          }
        } else {
          // Moving toward left edge (gray expanding)
          if (!isPulsingRef.current && prev > edgeThreshold) {
            return Math.max(prev - speed, edgeThreshold);
          } else {
            // Start or continue pulsing at the edge with sine wave easing
            isPulsingRef.current = true;
            const center = edgeThreshold;
            pulsePhaseRef.current += pulseSpeed;
            const sineValue = Math.sin(pulsePhaseRef.current);
            const easedPosition = center + (sineValue * pulseRange);
            return Math.max(0, Math.min(100, easedPosition));
          }
        }
      });
    }, 16);

    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      className="fixed inset-0 w-full h-screen cursor-pointer overflow-hidden bg-black"
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ zIndex: 9999 }}
    >
      {/* Background Image - Full (Colored) */}
      <div 
        className="absolute inset-0 w-full h-full"
        style={{
          backgroundImage: `url(${splashImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      
      {/* Grayscale Gradient Overlay */}
      <div 
        className="absolute inset-0 w-full h-full"
        style={{
          background: `linear-gradient(to right, rgba(128, 128, 128, 1) 0%, rgba(128, 128, 128, 0.8) ${borderPosition}%, transparent ${borderPosition + 10}%, transparent 100%)`,
          mixBlendMode: 'saturation',
        }}
      />
      
      {/* KANVAS Text */}
      <div 
        className="absolute inset-0 flex items-start justify-center z-10"
        style={{
          fontFamily: '"MedievalSharp", "Almendra", cursive',
          paddingTop: 'clamp(3rem, 8vh, 8rem)',
        }}
      >
        <div>
          <h1 
            className="text-white font-normal"
            style={{
              fontSize: 'clamp(3rem, 12vw, 10rem)',
              letterSpacing: '0.3em',
              textShadow: '0 0 20px rgba(255, 255, 255, 0.5), 0 0 40px rgba(255, 255, 255, 0.3)',
              marginBottom: '-0.4em',
            }}
          >
            KANVAS
          </h1>
          <p 
            className="text-white font-bold text-center uppercase"
            style={{
              fontSize: 'clamp(0.8rem, 2.5vw, 1.8rem)',
              letterSpacing: '0.3em',
              textShadow: '0 0 20px rgba(255, 255, 255, 0.5), 0 0 40px rgba(255, 255, 255, 0.3)',
              fontFamily: '"MedievalSharp", "Almendra", cursive',
              marginTop: '0.1em',
            }}
          >
            FOR THE VISUAL
          </p>
        </div>
      </div>
      
      {/* Terms and Conditions Notice */}
      <div 
        className="absolute left-0 right-0 text-center z-10"
        style={{
          bottom: 'clamp(1rem, 3vh, 2rem)',
        }}
      >
        <p 
          className="text-white opacity-60"
          style={{
            fontSize: 'clamp(0.6rem, 1.5vw, 0.8rem)',
          }}
        >
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

      {/* Left Text - Professional (Gray side) */}
      <div
        className="absolute z-20 flex items-center gap-2"
        style={{
          left: 'clamp(1rem, 5vw, 4rem)',
          top: 'clamp(55%, 60vh, 65%)',
          transform: 'translateY(-50%)',
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <p
          className="font-normal"
          style={{
            fontSize: 'clamp(1.5rem, 4vw, 3rem)',
            color: 'white',
          }}
        >
          ←
        </p>
        <div>
          <p
            className="font-normal transition-all duration-300"
            style={{
              fontSize: 'clamp(1rem, 3vw, 2.3rem)',
              color: 'white',
              fontFamily: '"Cinzel", "Trajan Pro", serif',
              transform: `scale(${1 + ((borderPosition - 50) / 50) * 0.15})`,
            }}
          >
            Professional
          </p>
          <p
            className="font-normal"
            style={{
              fontSize: 'clamp(0.7rem, 1.8vw, 1.4rem)',
              color: 'white',
              fontFamily: '"Cinzel", "Trajan Pro", serif',
              marginTop: '0.3rem',
            }}
          >
            clean & quiet
          </p>
        </div>
      </div>

      {/* Right Text - Experience (Color side) */}
      <div
        className="absolute z-20 flex items-center gap-2"
        style={{
          right: 'clamp(1rem, 5vw, 4rem)',
          top: 'clamp(55%, 60vh, 65%)',
          transform: 'translateY(-50%)',
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div>
          <p
            className="font-normal transition-all duration-300"
            style={{
              fontSize: 'clamp(1rem, 3vw, 2.3rem)',
              color: 'white',
              fontFamily: '"MedievalSharp", "Uncial Antiqua", cursive',
              transform: `scale(${1 + ((50 - borderPosition) / 50) * 0.15})`,
            }}
          >
            Experience
          </p>
          <p
            className="font-normal"
            style={{
              fontSize: 'clamp(0.7rem, 1.8vw, 1.4rem)',
              color: 'white',
              fontFamily: '"MedievalSharp", "Uncial Antiqua", cursive',
              marginTop: '0.3rem',
            }}
          >
            sound will play
          </p>
        </div>
        <p
          className="font-normal"
          style={{
            fontSize: 'clamp(1.5rem, 4vw, 3rem)',
            color: 'white',
          }}
        >
          →
        </p>
      </div>
    </div>
  );
};

export default SplashScreen;
