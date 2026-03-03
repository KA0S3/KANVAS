import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { ownerKeyService } from '@/services/ownerKeyService';
import type { User } from '@supabase/supabase-js';

type Plan = 'free' | 'pro' | 'lifetime';

interface OwnerKeyInfo {
  isValid: boolean;
  scopes?: {
    ads: boolean;
    max_storage_bytes?: number;
    import_export: boolean;
    [key: string]: any;
  };
  userId?: string;
}

interface EffectiveLimits {
  effectivePlan: Plan;
  maxStorageBytes: number;
  adsEnabled: boolean;
  importExportEnabled: boolean;
  features: Record<string, any>;
}

interface AuthStore {
  user: User | null;
  plan: Plan;
  isAuthenticated: boolean;
  loading: boolean;
  ownerKeyInfo: OwnerKeyInfo | null;
  effectiveLimits: EffectiveLimits | null;
  
  // Methods
  initializeAuth: () => void;
  signIn: (email: string, password: string) => Promise<{ error?: string; success?: boolean }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; success?: boolean }>;
  signOut: () => Promise<void>;
  setPlan: (plan: Plan) => void;
  fetchUserPlan: (userId: string) => Promise<void>;
  validateOwnerKey: (token: string) => Promise<{ error?: string; success?: boolean }>;
  clearOwnerKey: () => void;
  updateEffectiveLimits: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      plan: 'free',
      isAuthenticated: false,
      loading: true,
      ownerKeyInfo: null,
      effectiveLimits: null,

      // Initialize auth listener
      initializeAuth: () => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            console.log('Auth state changed:', event, session?.user?.id);
            
            if (session?.user) {
              // User is signed in
              set({
                user: session.user,
                isAuthenticated: true,
                loading: false,
                ownerKeyInfo: null, // Clear owner key on sign in
              });
              
              // Fetch user plan from Supabase
              await get().fetchUserPlan(session.user.id);
            } else {
              // User is signed out
              set({
                user: null,
                plan: 'free',
                isAuthenticated: false,
                loading: false,
                ownerKeyInfo: null,
                effectiveLimits: null,
              });
            }
          }
        );

        // Initial session check
        supabase.auth.getSession().then(async ({ data: { session } }) => {
          if (session?.user) {
            set({
              user: session.user,
              isAuthenticated: true,
              loading: false,
              ownerKeyInfo: null, // Clear owner key on session restore
            });
            await get().fetchUserPlan(session.user.id);
          } else {
            set({
              user: null,
              plan: 'free',
              isAuthenticated: false,
              loading: false,
              ownerKeyInfo: null,
              effectiveLimits: null,
            });
          }
        });

        // Return cleanup function
        return () => subscription.unsubscribe();
      },

      // Sign in method
      signIn: async (email: string, password: string) => {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            console.error('Sign in error:', error);
            return { error: error.message };
          }

          // The onAuthStateChange listener will handle updating the state
          return { success: true };
        } catch (error) {
          console.error('Unexpected sign in error:', error);
          return { error: 'An unexpected error occurred during sign in' };
        }
      },

      // Sign up method
      signUp: async (email: string, password: string) => {
        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
          });

          if (error) {
            console.error('Sign up error:', error);
            return { error: error.message };
          }

          // Note: User might need to confirm email depending on Supabase settings
          return { success: true };
        } catch (error) {
          console.error('Unexpected sign up error:', error);
          return { error: 'An unexpected error occurred during sign up' };
        }
      },

      // Sign out method
      signOut: async () => {
        try {
          const { error } = await supabase.auth.signOut();
          
          if (error) {
            console.error('Sign out error:', error);
          }
          
          // The onAuthStateChange listener will handle updating the state
        } catch (error) {
          console.error('Unexpected sign out error:', error);
        }
      },

      // Set plan method
      setPlan: (plan: Plan) => {
        set({ plan });
      },

      // Fetch user plan from Supabase
      fetchUserPlan: async (userId: string) => {
        try {
          const { data, error } = await supabase
            .from('users')
            .select('plan')
            .eq('id', userId)
            .single();

          if (error) {
            console.warn('Failed to fetch user plan, using default:', error);
            // Don't fail the app if we can't fetch the plan
            set({ plan: 'free' });
            get().updateEffectiveLimits();
            return;
          }

          const userPlan = data?.plan as Plan || 'free';
          set({ plan: userPlan });
          get().updateEffectiveLimits();
        } catch (error) {
          console.warn('Unexpected error fetching user plan, using default:', error);
          // Never block the app if auth fails
          set({ plan: 'free' });
          get().updateEffectiveLimits();
        }
      },

      // Validate owner key token
      validateOwnerKey: async (token: string) => {
        try {
          const result = await ownerKeyService.validateOwnerKey(token);
          
          if (result.isValid && result.scopes && result.userId) {
            set({
              ownerKeyInfo: {
                isValid: true,
                scopes: result.scopes,
                userId: result.userId
              }
            });
            get().updateEffectiveLimits();
            return { success: true };
          } else {
            set({ ownerKeyInfo: null });
            get().updateEffectiveLimits();
            return { error: result.error || 'Invalid owner key' };
          }
        } catch (error) {
          console.error('Owner key validation error:', error);
          set({ ownerKeyInfo: null });
          get().updateEffectiveLimits();
          return { error: 'Owner key validation failed' };
        }
      },

      // Clear owner key
      clearOwnerKey: () => {
        set({ ownerKeyInfo: null });
        get().updateEffectiveLimits();
      },

      // Update effective limits based on plan and owner key
      updateEffectiveLimits: () => {
        const { plan, ownerKeyInfo } = get();
        const limits = ownerKeyService.applyOwnerKeyOverrides(
          plan,
          ownerKeyInfo?.scopes
        );
        set({ effectiveLimits: limits });
      },
    }),
    {
      name: 'kanvas-auth',
      // Only persist essential auth state, not the user object (it will be refreshed)
      partialize: (state) => ({
        plan: state.plan,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
