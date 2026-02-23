import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppPhase = 'SPLASH' | 'INTRO_VIDEO' | 'LIBRARY' | 'BOOK_VIEW';

interface MediaState {
  appPhase: AppPhase;
  isAudioPlaying: boolean;
  currentTrack: number;
  isTransitioning: boolean;
  videosEnabled: boolean;
  audioEnabled: boolean;
  videoSoundsEnabled: boolean;
  
  // Actions
  setAppPhase: (phase: AppPhase) => void;
  setAudioPlaying: (playing: boolean) => void;
  setCurrentTrack: (track: number) => void;
  setTransitioning: (transitioning: boolean) => void;
  setVideosEnabled: (enabled: boolean) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setVideoSoundsEnabled: (enabled: boolean) => void;
  
  // Phase transitions
  startIntro: () => void;
  showLibrary: () => void;
  enterBookView: () => void;
  returnToLibrary: () => void;
}

export const useMediaStore = create<MediaState>()(
  persist(
    (set) => ({
      appPhase: 'SPLASH',
      isAudioPlaying: false,
      currentTrack: 0,
      isTransitioning: false,
      videosEnabled: true,
      audioEnabled: true,
      videoSoundsEnabled: true,

      setAppPhase: (phase) => set({ appPhase: phase }),
      setAudioPlaying: (playing) => set({ isAudioPlaying: playing }),
      setCurrentTrack: (track) => set({ currentTrack: track }),
      setTransitioning: (transitioning) => set({ isTransitioning: transitioning }),
      setVideosEnabled: (enabled) => set({ videosEnabled: enabled }),
      setAudioEnabled: (enabled) => set({ audioEnabled: enabled }),
      setVideoSoundsEnabled: (enabled) => set({ videoSoundsEnabled: enabled }),

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
        videoSoundsEnabled: state.videoSoundsEnabled
      }),
    }
  )
);
