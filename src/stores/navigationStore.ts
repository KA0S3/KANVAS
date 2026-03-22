import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type NavigationSource = 'settings' | 'payment' | 'direct' | 'other';

interface NavigationState {
  previousSource: NavigationSource;
  previousPath: string | null;
  setNavigationSource: (source: NavigationSource, path?: string) => void;
  clearNavigationSource: () => void;
}

export const useNavigationStore = create<NavigationState>()(
  persist(
    (set, get) => ({
      previousSource: 'direct',
      previousPath: null,
      
      setNavigationSource: (source: NavigationSource, path?: string) => {
        set({
          previousSource: source,
          previousPath: path || null,
        });
      },
      
      clearNavigationSource: () => {
        set({
          previousSource: 'direct',
          previousPath: null,
        });
      },
    }),
    {
      name: 'navigation-storage',
      partialize: (state) => ({
        previousSource: state.previousSource,
        previousPath: state.previousPath,
      }),
    }
  )
);
