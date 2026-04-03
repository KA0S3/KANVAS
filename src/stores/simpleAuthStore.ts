import { create } from 'zustand';

interface SimpleAuthStore {
  isAuthenticated: boolean;
  effectiveLimits: { quotaBytes: number; maxBooks?: number } | null;
  plan: string;
  isLoading: boolean;
  user: { email?: string; id?: string } | null;
  signIn: (email: string, password: string) => Promise<{ success?: boolean; error?: string }>;
  signUp: (email: string, password: string) => Promise<{ success?: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshUserData: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  isVerificationPending: boolean;
  verificationEmail: string | null;
  setVerificationPending: (pending: boolean) => void;
  checkUserExists: (email: string) => Promise<{ exists: boolean; provider?: string }>;
  detectAuthProvider: (email: string) => Promise<{ provider?: string; canUseEmail?: boolean }>;
  linkPasswordToGoogleUser: (password: string) => Promise<{ success?: boolean; error?: string }>;
  createPasswordForGoogleUser: (password: string) => Promise<{ success?: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ success?: boolean; error?: string }>;
  checkForMigrationConflicts: (userId: string) => Promise<any>;
  shouldShowGuestImport: () => boolean;
  executeDataMigration: (strategy: any) => Promise<void>;
}

export const useSimpleAuthStore = create<SimpleAuthStore>((set, get) => ({
  isAuthenticated: true, // Simulate authenticated for testing
  effectiveLimits: { quotaBytes: 10 * 1024 * 1024 * 1024, maxBooks: 1000 }, // 10GB, 1000 books
  plan: 'owner',
  isLoading: false,
  user: { email: 'test@example.com', id: 'test-user-id' }, // Mock user with ID
  isVerificationPending: false,
  verificationEmail: null,

  setVerificationPending: (pending: boolean) => {
    set({ isVerificationPending: pending });
  },

  checkUserExists: async (email: string) => {
    // Mock check
    return { exists: false };
  },

  detectAuthProvider: async (email: string) => {
    // Mock detection
    return { canUseEmail: true };
  },

  linkPasswordToGoogleUser: async (password: string) => {
    // Mock linking
    return { success: true };
  },

  createPasswordForGoogleUser: async (password: string) => {
    // Mock creation
    return { success: true };
  },

  signInWithGoogle: async () => {
    // Mock Google sign-in
    set({ isLoading: true });
    await new Promise(resolve => setTimeout(resolve, 1000));
    set({ isLoading: false, isAuthenticated: true });
    return { success: true };
  },

  checkForMigrationConflicts: async (userId: string) => {
    // Mock migration check
    return null;
  },

  shouldShowGuestImport: () => {
    // Mock guest import check
    return false;
  },

  executeDataMigration: async (strategy: any) => {
    // Mock migration
    console.log('Mock data migration executed:', strategy);
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true });
    // Mock sign-in for testing
    await new Promise(resolve => setTimeout(resolve, 1000));
    set({ isAuthenticated: true, isLoading: false, user: { email, id: 'test-user-id' } });
    return { success: true };
  },

  signUp: async (email: string, password: string) => {
    set({ isLoading: true });
    // Mock sign-up for testing
    await new Promise(resolve => setTimeout(resolve, 1000));
    set({ isAuthenticated: true, isLoading: false, user: { email, id: 'test-user-id' } });
    return { success: true };
  },

  signOut: async () => {
    set({ isAuthenticated: false, user: null });
  },

  refreshUserData: async () => {
    // Mock refresh
  },

  initializeAuth: async () => {
    // Mock initialization
    set({ isLoading: false });
  },
}));
