import S1 from '@/assets/S1.mp3';
import S2 from '@/assets/S2.mp3';
import S3 from '@/assets/S3.mp3';
import S4 from '@/assets/S4.mp3';
import { useMediaStore } from '@/stores/mediaStore';

class AudioEngine {
  private audio: HTMLAudioElement | null = null;
  private tracks = [S1, S2, S3, S4];
  private currentTrackIndex = 0;
  private isPlaying = false;
  private volume = 0.3; // Background level set to 30% as requested

  constructor() {
    // Audio will be initialized when needed
  }

  public async startWithUserInteraction(): Promise<void> {
    if (this.isPlaying) return;

    // Check if audio is enabled in settings
    const { audioEnabled } = useMediaStore.getState();
    if (!audioEnabled) {
      console.log('Audio is disabled in settings, skipping playback');
      return;
    }

    try {
      console.log('Starting audio engine with user interaction');
      this.audio = new Audio(this.tracks[this.currentTrackIndex]);
      this.audio.volume = this.volume;
      this.audio.loop = false; // We'll handle looping manually
      
      this.audio.addEventListener('ended', () => {
        console.log('Track ended, playing next track');
        this.playNextTrack();
      });

      this.audio.addEventListener('error', (e) => {
        console.error('Audio error:', e);
        // Prevent error from bubbling up to React
        e.preventDefault?.();
        e.stopPropagation?.();
      });

      await this.audio.play();
      console.log('Audio playing successfully with user interaction');
      this.isPlaying = true;
    } catch (error) {
      console.error('Audio playback failed:', error);
    }
  }

  public async start(): Promise<void> {
    if (this.isPlaying) return;

    // Check if audio is enabled in settings
    const { audioEnabled } = useMediaStore.getState();
    if (!audioEnabled) {
      console.log('Audio is disabled in settings, skipping playback');
      return;
    }

    try {
      console.log('Starting audio engine with track:', this.tracks[this.currentTrackIndex]);
      this.audio = new Audio(this.tracks[this.currentTrackIndex]);
      this.audio.volume = this.volume;
      this.audio.loop = false; // We'll handle looping manually
      
      this.audio.addEventListener('ended', () => {
        console.log('Track ended, playing next track');
        this.playNextTrack();
      });

      this.audio.addEventListener('error', (e) => {
        console.error('Audio error:', e);
        // Prevent error from bubbling up to React
        e.preventDefault?.();
        e.stopPropagation?.();
      });

      this.audio.addEventListener('canplay', () => {
        console.log('Audio can play');
      });

      // Try to play, but handle autoplay policy restrictions
      const playPromise = this.audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log('Audio playing successfully');
          this.isPlaying = true;
        }).catch(error => {
          console.error('Audio autoplay blocked:', error);
          console.log('User interaction required to start audio');
        });
      }
    } catch (error) {
      console.error('Audio playback failed:', error);
    }
  }

  public stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.isPlaying = false;
    }
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audio) {
      this.audio.volume = this.volume;
    }
  }

  private playNextTrack(): void {
    // Check if audio is still enabled before playing next track
    const { audioEnabled } = useMediaStore.getState();
    if (!audioEnabled) {
      console.log('Audio became disabled, stopping playback');
      this.stop();
      return;
    }

    this.currentTrackIndex = (this.currentTrackIndex + 1) % this.tracks.length;
    console.log('Playing next track:', this.currentTrackIndex, this.tracks[this.currentTrackIndex]);
    
    if (this.audio) {
      this.audio.src = this.tracks[this.currentTrackIndex];
      this.audio.play().catch(error => {
        console.error('Next track playback failed:', error);
        // Don't let the error bubble up to React
      });
    }
  }

  public getCurrentTrack(): number {
    return this.currentTrackIndex;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public checkAudioSettings(): void {
    const { audioEnabled } = useMediaStore.getState();
    if (!audioEnabled && this.isPlaying) {
      console.log('Audio disabled in settings, stopping playback');
      this.stop();
    }
  }

  public cleanup(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    this.isPlaying = false;
  }
}

// Singleton instance
export const audioEngine = new AudioEngine();
