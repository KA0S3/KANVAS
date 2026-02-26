import { localCache } from './localCache';
import type { AppPhase } from '@/stores/mediaStore';
import type { Asset } from '@/components/AssetItem';

const CACHE_KEY = 'navigation-state';
const CACHE_TTL_HOURS = 24; // 24 hour expiration

export interface NavigationState {
  appPhase: AppPhase;
  currentBookId: string | null;
  currentViewportId: string | null;
  currentActiveId: string | null;
  bookLibraryOpen: boolean;
  sidebarOpen: boolean;
  isEditingBackground: boolean;
  // Store minimal asset data for restoration
  viewportAsset?: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    viewportConfig: Asset['viewportConfig'];
  };
}

export const navigationCache = {
  // Save the current navigation state
  saveState: (state: NavigationState) => {
    try {
      localCache.set(CACHE_KEY, state, CACHE_TTL_HOURS * 60); // Convert hours to minutes
    } catch (error) {
      console.warn('Failed to save navigation state:', error);
    }
  },

  // Get cached navigation state
  getState: (): NavigationState | null => {
    try {
      return localCache.get<NavigationState>(CACHE_KEY);
    } catch (error) {
      console.warn('Failed to get navigation state:', error);
      return null;
    }
  },

  // Clear cached navigation state
  clearState: () => {
    try {
      localCache.remove(CACHE_KEY);
    } catch (error) {
      console.warn('Failed to clear navigation state:', error);
    }
  },

  // Check if cached state is valid
  hasValidState: (): boolean => {
    try {
      return localCache.isValid(CACHE_KEY);
    } catch (error) {
      console.warn('Failed to check navigation state validity:', error);
      return false;
    }
  }
};
