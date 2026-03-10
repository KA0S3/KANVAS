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
  planLoading: boolean;
  ownerKeyInfo: OwnerKeyInfo | null;
  licenseInfo: LicenseInfo | null;
  effectiveLimits: EffectiveLimits | null;
  isVerificationPending: boolean;
  verificationEmail: string | null;
  _lastFetchedUserId?: string; // Prevent duplicate fetches
  _authStateInitialized?: boolean; // Prevent multiple initializations
  
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
  setVerificationPending: (pending: boolean, email?: string) => void; // New method for verification state
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      plan: 'guest',
      isAuthenticated: false,
      loading: true,
      planLoading: true,
      ownerKeyInfo: null,
      licenseInfo: null,
      effectiveLimits: null,
      isVerificationPending: false,
      verificationEmail: null,

      // Initialize auth listener
      initializeAuth: () => {
        // Prevent multiple initializations
        if (get().loading === false || get()._authStateInitialized) {
          console.log('[authStore] Auth store already initialized');
          return;
        }
        
        console.log('[authStore] Initializing auth store');
        set({ _authStateInitialized: true });
        
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            console.log('[authStore] Auth state changed:', event, session?.user?.email);
            
            if (session?.user) {
              // User is signed in
              const currentUserId = session.user.id;
              const lastUserId = get()._lastFetchedUserId;
              
              // Clear verification pending state when user successfully signs in
              if (get().isVerificationPending) {
                set({ isVerificationPending: false, verificationEmail: null });
              }
              
              // Only fetch plan data if user actually changed
              if (currentUserId !== lastUserId) {
                set({
                  user: session.user,
                  isAuthenticated: true,
                  loading: false,
                  planLoading: true,
                  ownerKeyInfo: null,
                });
                
                // Fetch user data
                await Promise.all([
                  get().fetchUserPlan(session.user.id),
                  get().fetchUserLicense(session.user.id),
                  get().fetchOwnerKeys(session.user.id),
                ]);
              } else {
                // Just update user object, don't re-fetch plan
                set({
                  user: session.user,
                  isAuthenticated: true,
                  loading: false,
                  isVerificationPending: false,
                  verificationEmail: null,
                });
              }
            } else {
              // User is signed out
              set({
                user: null,
                plan: 'guest',
                isAuthenticated: false,
                loading: false,
                planLoading: false,
                ownerKeyInfo: null,
                licenseInfo: null,
                effectiveLimits: null,
                isVerificationPending: false,
                verificationEmail: null,
                _lastFetchedUserId: undefined,
                _authStateInitialized: false,
              });
              updateQuotaBasedOnPlan();
            }
          }
        );

        // Simple session check without timeout
        supabase.auth.getSession().then(async ({ data: { session } }) => {
          console.log('[authStore] Initial session:', session?.user?.email);
          if (session?.user) {
            set({
              user: session.user,
              isAuthenticated: true,
              loading: false,
              planLoading: true,
              ownerKeyInfo: null,
            });
            await Promise.all([
              get().fetchUserPlan(session.user.id),
              get().fetchUserLicense(session.user.id),
              get().fetchOwnerKeys(session.user.id),
            ]);
          } else {
            set({
              user: null,
              plan: 'guest',
              isAuthenticated: false,
              loading: false,
              planLoading: false,
              ownerKeyInfo: null,
              licenseInfo: null,
              effectiveLimits: null,
              _lastFetchedUserId: undefined,
            });
          }
        });

        // Return cleanup function
        return () => {
          subscription.unsubscribe();
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
            options: {
              emailRedirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/confirm`,
            }
          });

          if (error) {
            console.error('Sign up error:', error);
            return { error: error.message };
          }

          // Check if user needs email confirmation
          if (data.user && !data.user.email_confirmed_at) {
            set({ isVerificationPending: true, verificationEmail: email });
            return { success: true };
          } else if (data.user && data.user.email_confirmed_at) {
            // User is already confirmed (rare case)
            return { success: true };
          } else {
            // No user returned, likely email confirmation required
            set({ isVerificationPending: true, verificationEmail: email });
            return { success: true };
          }
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
            plan: 'guest',
            isAuthenticated: false,
            loading: false,
            planLoading: false,
            ownerKeyInfo: null,
            licenseInfo: null,
            effectiveLimits: null,
            _lastFetchedUserId: undefined,
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
        // Prevent duplicate fetches for same user
        const lastFetched = get()._lastFetchedUserId;
        if (lastFetched === userId && get().planLoading) {
          console.log(`[authStore] ⏭️ Skipping duplicate fetch for user: ${userId}`);
          return;
        }

        try {
          console.log(`[authStore] Fetching plan for user: ${userId}`);
          set({ planLoading: true, _lastFetchedUserId: userId });
          
          // OWNER CHECK: Immediate owner fallback - Check if this is the owner email first
          const ownerEmail = import.meta.env?.VITE_OWNER_EMAIL;
          const currentUser = get().user;
          if (currentUser?.email === ownerEmail) {
            console.log('[authStore] 🚀 IMMEDIATE OWNER FALLBACK - Setting owner plan');
            set({ plan: 'owner', planLoading: false });
            await get().updateEffectiveLimits();
            return;
          }
          
          // Try multiple approaches with shorter timeouts
          const fetchWithTimeout = async (query: any, timeoutMs: number) => {
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
            });
            return Promise.race([query, timeoutPromise]);
          };

          // Method 1: Direct query to users table
          try {
            console.log('[authStore] Trying direct users table query...');
            const { data, error } = await fetchWithTimeout(
              supabase
                .from('users')
                .select('plan_type')
                .eq('id', userId)
                .single(),
              3000 // 3 second timeout
            ) as any;

            if (!error && data) {
              let userPlan = data?.plan_type as Plan || 'free';
              console.log(`[authStore] Raw plan from DB: ${data?.plan_type}, after migration: ${userPlan}`);
              userPlan = migrateLegacyPlanId(userPlan) as Plan;
              
              console.log(`[authStore] ✅ Successfully fetched plan: ${userPlan} for user: ${userId}`);
              set({ plan: userPlan, planLoading: false });
              await get().updateEffectiveLimits();
              return;
            } else {
              console.log('[authStore] Direct query failed, trying auth.user()...');
            }
          } catch (err) {
            console.log('[authStore] Direct query error:', err);
          }

          // Method 2: Try using auth metadata (fallback)
          try {
            console.log('[authStore] Trying auth metadata fallback...');
            const { data: { user } } = await supabase.auth.getUser();
            
            // Check if plan is in user metadata
            const metadataPlan = user?.user_metadata?.plan_type || user?.app_metadata?.plan_type;
            if (metadataPlan) {
              let userPlan = metadataPlan as Plan;
              userPlan = migrateLegacyPlanId(userPlan) as Plan;
              
              console.log(`[authStore] ✅ Found plan in metadata: ${userPlan} for user: ${userId}`);
              set({ plan: userPlan, planLoading: false });
              await get().updateEffectiveLimits();
              return;
            } else {
              console.log('[authStore] No plan in metadata, trying owner fallback...');
            }
          } catch (err) {
            console.log('[authStore] Metadata fallback failed:', err);
          }

          // Final fallback
          console.log('[authStore] ⚠️ All methods failed, using default plan: guest');
          set({ plan: 'guest', planLoading: false });
          await get().updateEffectiveLimits();
          
        } catch (error) {
          console.error('[authStore] Unexpected error fetching user plan:', error);
          console.log('[authStore] Falling back to default plan: guest');
          // Never block the app if auth fails
          set({ plan: 'guest', planLoading: false });
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

    // OWNER CHECK: Immediate owner detection before server call
    const ownerEmail = import.meta.env?.VITE_OWNER_EMAIL;
    if (user.email === ownerEmail) {
      console.log('[authStore] 🚀 IMMEDIATE OWNER DETECTION - Setting owner limits');
      const ownerLimits: EffectiveLimits = {
        quotaBytes: -1, // Unlimited
        maxBooks: -1, // Unlimited
        adsEnabled: false, // No ads
        importExportEnabled: true, // Full access
        source: {
          plan: 'owner'
        }
      };
      set({ effectiveLimits: ownerLimits, plan: 'owner' });
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

  // Set verification pending state
  setVerificationPending: (pending: boolean, email?: string) => {
    set({
      isVerificationPending: pending,
      verificationEmail: email || null,
    });
  },

  // Debug method to clear all auth data
  clearAllAuthData: () => {
    console.log('[authStore] Clearing all auth data (debug method)');
    set({
      user: null,
      plan: 'guest',
      isAuthenticated: false,
      loading: false,
      planLoading: false,
      ownerKeyInfo: null,
      licenseInfo: null,
      effectiveLimits: null,
      isVerificationPending: false,
      verificationEmail: null,
      _lastFetchedUserId: undefined,
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
