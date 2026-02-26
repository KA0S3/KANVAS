import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { localCache } from '@/utils/localCache';

export type AppPhase = 'SPLASH' | 'INTRO_VIDEO' | 'LIBRARY' | 'BOOK_VIEW';

const CACHE_KEY = 'last-app-phase';
const CACHE_TTL_MINUTES = 60; // Cache expires after 1 hour

// Get initial phase from cache or default to SPLASH
const getInitialPhase = (): AppPhase => {
  const cachedPhase = localCache.get<AppPhase>(CACHE_KEY);
  return cachedPhase || 'SPLASH';
};

interface MediaState {
  appPhase: AppPhase;
  isAudioPlaying: boolean;
  currentTrack: number;
  isTransitioning: boolean;
  videosEnabled: boolean;
  audioEnabled: boolean;
  videoSoundsEnabled: boolean;
  audioVolume: number;
  
  // Actions
  setAppPhase: (phase: AppPhase) => void;
  setAudioPlaying: (playing: boolean) => void;
  setCurrentTrack: (track: number) => void;
  setTransitioning: (transitioning: boolean) => void;
  setVideosEnabled: (enabled: boolean) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setVideoSoundsEnabled: (enabled: boolean) => void;
  setAudioVolume: (volume: number) => void;
  
  // Phase transitions
  startIntro: () => void;
  showLibrary: () => void;
  enterBookView: () => void;
  returnToLibrary: () => void;
}

export const useMediaStore = create<MediaState>()(
  persist(
    (set, get) => ({
      appPhase: getInitialPhase(),
      isAudioPlaying: false,
      currentTrack: 0,
      isTransitioning: false,
      videosEnabled: true,
      audioEnabled: true,
      videoSoundsEnabled: true,
      audioVolume: 0.08, // Default to 8% for background music

      setAppPhase: (phase) => {
        set({ appPhase: phase });
        // Save to cache whenever phase changes (except SPLASH)
        if (phase !== 'SPLASH') {
          localCache.set(CACHE_KEY, phase, CACHE_TTL_MINUTES);
        } else {
          // Clear cache when returning to splash
          localCache.remove(CACHE_KEY);
        }
      },
      setAudioPlaying: (playing) => set({ isAudioPlaying: playing }),
      setCurrentTrack: (track) => set({ currentTrack: track }),
      setTransitioning: (transitioning) => set({ isTransitioning: transitioning }),
      setVideosEnabled: (enabled) => set({ videosEnabled: enabled }),
      setAudioEnabled: (enabled) => set({ audioEnabled: enabled }),
      setVideoSoundsEnabled: (enabled) => set({ videoSoundsEnabled: enabled }),
      setAudioVolume: (volume) => set({ audioVolume: Math.max(0, Math.min(1, volume)) }),

      startIntro: () => set({ appPhase: 'INTRO_VIDEO' }),
      showLibrary: () => set({ appPhase: 'LIBRARY' }),
      enterBookView: () => set({ appPhase: 'BOOK_VIEW' }),
      returnToLibrary: () => set({ appPhase: 'LIBRARY' }),
    }),
    {
      name: 'kanvas-media-storage',
      partialize: (state) => ({ 
        videosEnabled: state.videosEnabled,
        audioEnabled: state.audioEnabled,
        videoSoundsEnabled: state.videoSoundsEnabled,
        audioVolume: state.audioVolume
      }),
    }
  )
);
