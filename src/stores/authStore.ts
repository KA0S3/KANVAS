import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { ownerKeyService } from '@/services/ownerKeyService';
import { updateQuotaBasedOnPlan } from '@/stores/cloudStore';
import { getPlanConfig, migrateLegacyPlanId } from '@/lib/plans';
import { getEffectiveLimitsWithFallback, type EffectiveLimits } from '@/services/effectiveLimitsService';
import type { User } from '@supabase/supabase-js';

type Plan = 'guest' | 'free' | 'pro' | 'lifetime' | 'owner';

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

interface LicenseInfo {
  id: string;
  license_type: 'trial' | 'basic' | 'premium' | 'enterprise' | 'custom';
  status: 'active' | 'expired' | 'suspended' | 'cancelled';
  features?: Record<string, any>;
  expires_at?: string;
}

interface AuthStore {
  user: User | null;
  plan: Plan;
  isAuthenticated: boolean;
  loading: boolean;
  ownerKeyInfo: OwnerKeyInfo | null;
  licenseInfo: LicenseInfo | null;
  effectiveLimits: EffectiveLimits | null;
  
  // Methods
  initializeAuth: () => void;
  signIn: (email: string, password: string) => Promise<{ error?: string; success?: boolean }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; success?: boolean }>;
  signOut: () => Promise<void>;
  setPlan: (plan: Plan) => void;
  fetchUserPlan: (userId: string) => Promise<void>;
  fetchUserLicense: (userId: string) => Promise<void>;
  fetchOwnerKeys: (userId: string) => Promise<void>;
  validateOwnerKey: (token: string) => Promise<{ error?: string; success?: boolean }>;
  clearOwnerKey: () => Promise<void>;
  updateEffectiveLimits: () => Promise<void>;
  refreshUserData: () => Promise<void>; // New method for real-time updates
  clearAllAuthData: () => void; // Debug method to clear all auth data
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
      licenseInfo: null,
      effectiveLimits: null,

      // Initialize auth listener
      initializeAuth: () => {
        // Prevent multiple initializations
        if (get().loading === false) {
          console.log('[authStore] Auth store already initialized, skipping');
          return;
        }
        
        console.log('[authStore] Initializing auth store');
        
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            console.log('[authStore] Auth state changed:', event, session?.user?.id);
            
            if (session?.user) {
              // User is signed in
              console.log('[authStore] User signed in:', session.user.email);
              set({
                user: session.user,
                isAuthenticated: true,
                loading: false,
                ownerKeyInfo: null, // Clear owner key on sign in
              });
              
              // Fetch user plan from Supabase
              await get().fetchUserPlan(session.user.id);
              // Fetch license information
              await get().fetchUserLicense(session.user.id);
              // Fetch owner keys
              await get().fetchOwnerKeys(session.user.id);
            } else {
              // User is signed out - this should handle sign out properly
              console.log('[authStore] User signed out, clearing state');
              set({
                user: null,
                plan: 'free',
                isAuthenticated: false,
                loading: false,
                ownerKeyInfo: null,
                licenseInfo: null,
                effectiveLimits: null,
              });
              
              // Update cloud store quota based on free plan
              updateQuotaBasedOnPlan();
            }
          }
        );

        console.log('[authStore] Setting up periodic refresh');
        // Set up periodic refresh for authenticated users
        const refreshInterval = setInterval(async () => {
          const { user, isAuthenticated } = get();
          if (isAuthenticated && user) {
            console.log('[authStore] Periodic plan refresh');
            await get().refreshUserData();
          }
        }, 30000); // Refresh every 30 seconds

        console.log('[authStore] Checking initial session');
        // Initial session check with timeout
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Session check timeout')), 5000);
        });

        Promise.race([sessionPromise, timeoutPromise])
          .then(async ({ data: { session } }) => {
            console.log('[authStore] Initial session check:', session?.user?.email);
            if (session?.user) {
              set({
                user: session.user,
                isAuthenticated: true,
                loading: false,
                ownerKeyInfo: null, // Clear owner key on session restore
              });
              await get().fetchUserPlan(session.user.id);
              await get().fetchUserLicense(session.user.id);
              await get().fetchOwnerKeys(session.user.id);
            } else {
              console.log('[authStore] No initial session, setting user to null');
              set({
                user: null,
                plan: 'free',
                isAuthenticated: false,
                loading: false,
                ownerKeyInfo: null,
                licenseInfo: null,
                effectiveLimits: null,
              });
            }
          })
          .catch((error) => {
            console.error('[authStore] Session check failed:', error);
            // Fallback to no session
            set({
              user: null,
              plan: 'free',
              isAuthenticated: false,
              loading: false,
              ownerKeyInfo: null,
              licenseInfo: null,
              effectiveLimits: null,
            });
          });

        console.log('[authStore] Auth store initialization complete');
        // Return cleanup function
        return () => {
          subscription.unsubscribe();
          clearInterval(refreshInterval);
        };
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
          console.log('[authStore] Starting sign out process');
          
          // Just sign out from Supabase - the auth state change listener will handle the rest
          const { error } = await supabase.auth.signOut();
          
          if (error) {
            console.error('Sign out error:', error);
            throw error;
          }
          
          console.log('[authStore] Sign out initiated successfully');
        } catch (error) {
          console.error('Unexpected sign out error:', error);
          // If Supabase sign out fails, manually clear state
          set({
            user: null,
            plan: 'free',
            isAuthenticated: false,
            loading: false,
            ownerKeyInfo: null,
            licenseInfo: null,
            effectiveLimits: null,
          });
          localStorage.removeItem('kanvas-auth');
          updateQuotaBasedOnPlan();
          throw error;
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
            .select('plan_type')
            .eq('id', userId)
            .single();

          if (error) {
            console.warn('Failed to fetch user plan, using default:', error);
            // Don't fail the app if we can't fetch the plan
            set({ plan: 'free' });
            await get().updateEffectiveLimits();
            return;
          }

          // Migrate legacy plan names if needed
          let userPlan = data?.plan_type as Plan || 'free';
          userPlan = migrateLegacyPlanId(userPlan) as Plan;
          
          set({ plan: userPlan });
          await get().updateEffectiveLimits();
        } catch (error) {
          console.warn('Unexpected error fetching user plan, using default:', error);
          // Never block the app if auth fails
          set({ plan: 'free' });
          await get().updateEffectiveLimits();
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
            await get().updateEffectiveLimits();
            return { success: true };
          } else {
            set({ ownerKeyInfo: null });
            await get().updateEffectiveLimits();
            return { error: result.error || 'Invalid owner key' };
          }
        } catch (error) {
          console.error('Owner key validation error:', error);
          set({ ownerKeyInfo: null });
          await get().updateEffectiveLimits();
          return { error: 'Owner key validation failed' };
        }
      },

      // Clear owner key
      clearOwnerKey: async () => {
        set({ ownerKeyInfo: null });
        await get().updateEffectiveLimits();
      },

      // Fetch user license from Supabase
      fetchUserLicense: async (userId: string) => {
        try {
          const { data, error } = await supabase
            .from('licenses')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (error) {
            console.warn('Failed to fetch user license:', error);
            set({ licenseInfo: null });
            await get().updateEffectiveLimits();
            return;
          }

          set({ licenseInfo: data });
          await get().updateEffectiveLimits();
        } catch (error) {
          console.warn('Unexpected error fetching user license:', error);
          set({ licenseInfo: null });
          await get().updateEffectiveLimits();
        }
      },

      // Fetch owner keys for user
      fetchOwnerKeys: async (userId: string) => {
        try {
          const { data, error } = await supabase
            .from('owner_keys')
            .select('*')
            .eq('user_id', userId)
            .eq('is_revoked', false)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1);

          if (error) {
            console.warn('Failed to fetch owner keys:', error);
            set({ ownerKeyInfo: null });
            await get().updateEffectiveLimits();
            return;
          }

          if (data && data.length > 0) {
            const ownerKey = data[0];
            set({
              ownerKeyInfo: {
                isValid: true,
                scopes: ownerKey.scopes,
                userId: ownerKey.user_id
              }
            });
          } else {
            set({ ownerKeyInfo: null });
          }
          await get().updateEffectiveLimits();
        } catch (error) {
          console.warn('Unexpected error fetching owner keys:', error);
          set({ ownerKeyInfo: null });
          await get().updateEffectiveLimits();
        }
      },

  // Update effective limits using server-side computation
  updateEffectiveLimits: async () => {
    const { user } = get();
    
    if (!user) {
      // For guest users, set minimal limits
      const guestLimits: EffectiveLimits = {
        quotaBytes: 0,
        maxBooks: 1,
        adsEnabled: true,
        importExportEnabled: false,
        source: {
          plan: 'guest'
        }
      };
      set({ effectiveLimits: guestLimits });
      updateQuotaBasedOnPlan();
      return;
    }

    try {
      // Fetch authoritative effective limits from server
      const limits = await getEffectiveLimitsWithFallback();
      set({ effectiveLimits: limits });
      
      // Update cloudStore quota based on new effective limits
      updateQuotaBasedOnPlan();
      
      console.log('[authStore] Updated effective limits from server:', limits);
    } catch (error) {
      console.error('[authStore] Failed to update effective limits:', error);
      
      // Fallback to client-side computation if server fails
      const { plan, ownerKeyInfo, licenseInfo } = get();
      let limits = ownerKeyService.applyOwnerKeyOverrides(plan, ownerKeyInfo?.scopes);
      
      if (licenseInfo && licenseInfo.features) {
        limits = ownerKeyService.applyLicenseOverrides(limits, licenseInfo.features);
      }
      
      // Convert to EffectiveLimits format
      const fallbackLimits: EffectiveLimits = {
        quotaBytes: limits.quotaBytes,
        maxBooks: limits.maxBooks,
        adsEnabled: limits.adsEnabled,
        importExportEnabled: limits.importExportEnabled,
        expiresAt: licenseInfo?.expires_at,
        source: {
          plan: limits.effectivePlan,
          licenseId: licenseInfo?.id,
          ownerKeyId: ownerKeyInfo?.userId ? 'owner-key' : undefined
        }
      };
      
      set({ effectiveLimits: fallbackLimits });
      updateQuotaBasedOnPlan();
    }
  },

  // Refresh user data for real-time updates
  refreshUserData: async () => {
    const { user } = get();
    
    if (!user) {
      console.warn('[authStore] Cannot refresh user data: no authenticated user');
      return;
    }

    console.log('[authStore] Refreshing user data for real-time updates');
    
    try {
      // Refresh all user data in parallel
      await Promise.all([
        get().fetchUserPlan(user.id),
        get().fetchUserLicense(user.id),
        get().fetchOwnerKeys(user.id),
        get().updateEffectiveLimits()
      ]);
      
      console.log('[authStore] Successfully refreshed user data');
    } catch (error) {
      console.error('[authStore] Failed to refresh user data:', error);
    }
  },

  // Debug method to clear all auth data
  clearAllAuthData: () => {
    console.log('[authStore] Clearing all auth data (debug method)');
    set({
      user: null,
      plan: 'free',
      isAuthenticated: false,
      loading: false,
      ownerKeyInfo: null,
      licenseInfo: null,
      effectiveLimits: null,
    });
    localStorage.removeItem('kanvas-auth');
    updateQuotaBasedOnPlan();
  },
    }),
    {
      name: 'kanvas-auth',
      // Only persist minimal state - authentication should be fresh each time
      partialize: (state) => ({
        plan: state.plan,
        licenseInfo: state.licenseInfo,
      }),
      // Don't persist authentication state to avoid sign out issues
      skipHydration: false,
    }
  )
);
