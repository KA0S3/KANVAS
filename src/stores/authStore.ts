import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { secureStorage } from '@/utils/secureStorage';
import { dataMigrationService, type MigrationConflict, type MigrationResult } from '@/services/dataMigrationService';
import { getPlanConfig, migrateLegacyPlanId } from '@/lib/plans';
import { getEffectiveLimitsWithFallback, type EffectiveLimits } from '@/services/effectiveLimitsService';
import { updateQuotaBasedOnPlan } from './cloudStore';
import { ownerKeyService } from '@/services/ownerKeyService';
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
  signIn: (email: string, password: string) => Promise<{ error?: string; success?: boolean; provider?: string }>;
  signInWithGoogle: () => Promise<{ error?: string; success?: boolean }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; success?: boolean; provider?: string }>;
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
  
  // Enhanced auth methods for provider conflict resolution
  checkUserExists: (email: string) => Promise<{ exists: boolean; providers: string[]; userId?: string }>;
  linkPasswordToGoogleUser: (email: string, password: string) => Promise<{ error?: string; success?: boolean; message?: string }>;
  createPasswordForGoogleUser: (email: string, newPassword: string, resetToken?: string) => Promise<{ error?: string; success?: boolean; message?: string }>;
  detectAuthProvider: (email: string) => Promise<{ provider: string | null; canUseEmail: boolean; canUseGoogle: boolean }>;
  
  // Data migration methods
  checkForMigrationConflicts: (userId: string) => Promise<MigrationConflict | null>;
  shouldShowGuestImport: () => Promise<boolean>;
  executeDataMigration: (strategy: any, userId: string) => Promise<MigrationResult>;
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
        if (get()._authStateInitialized) {
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
          console.log('[authStore] Starting sign in process for:', email);
          
          // First detect if user exists and their preferred provider
          const providerDetection = await get().detectAuthProvider(email);
          
          if (providerDetection.provider && !providerDetection.canUseEmail) {
            console.log('[authStore] User exists but cannot use email login, provider:', providerDetection.provider);
            
            if (providerDetection.provider === 'google') {
              return { 
                error: 'This email is registered with Google. Please sign in with Google instead.',
                provider: 'google'
              };
            } else {
              return { 
                error: `This email is registered with ${providerDetection.provider}. Please use the correct sign-in method.`,
                provider: providerDetection.provider
              };
            }
          }
          
          // Attempt email sign in
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            console.error('Sign in error:', error);
            
            // Check if this might be a provider conflict
            if (error.message === 'Invalid login credentials') {
              const userCheck = await get().checkUserExists(email);
              if (userCheck.exists && userCheck.providers.includes('google')) {
                return { 
                  error: 'This email is registered with Google. Please sign in with Google instead.',
                  provider: 'google'
                };
              }
            }
            
            return { error: error.message };
          }

          console.log('[authStore] Sign in successful');
          // The onAuthStateChange listener will handle updating the state
          return { success: true };
        } catch (error) {
          console.error('Unexpected sign in error:', error);
          return { error: 'An unexpected error occurred during sign in' };
        }
      },

      // Sign in with Google method
      signInWithGoogle: async () => {
        try {
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${window.location.origin}/auth/callback`,
            },
          });

          if (error) {
            console.error('Google sign in error:', error);
            return { error: error.message };
          }

          // OAuth flow will redirect to Google, then to our callback
          // The onAuthStateChange listener will handle updating the state
          return { success: true };
        } catch (error) {
          console.error('Unexpected Google sign in error:', error);
          return { error: 'An unexpected error occurred during Google sign in' };
        }
      },

      // Sign up method
      signUp: async (email: string, password: string) => {
        try {
          console.log('[authStore] Starting sign up process for:', email);
          
          // First check if user already exists
          const userCheck = await get().checkUserExists(email);
          
          if (userCheck.exists) {
            console.log('[authStore] User already exists with providers:', userCheck.providers);
            
            if (userCheck.providers.includes('google') && userCheck.providers.includes('email')) {
              return { 
                error: 'This email is already registered. Please sign in instead, or if you\'re a Google user, click "Create password" to set up email access.',
                provider: 'conflict'
              };
            } else if (userCheck.providers.includes('google')) {
              return { 
                error: 'This email is already registered with Google. Would you like to sign in with Google, or create a password for your account?',
                provider: 'google'
              };
            } else if (userCheck.providers.includes('email')) {
              return { 
                error: 'An account with this email already exists. Please sign in instead.',
                provider: 'email'
              };
            } else {
              return { 
                error: 'An account with this email already exists. Please sign in with the correct method.',
                provider: userCheck.providers[0] || 'unknown'
              };
            }
          }
          
          // Attempt to sign up the user
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/confirm?redirectTo=${import.meta.env.VITE_APP_URL || window.location.origin}`,
            }
          });

          if (error) {
            console.error('Sign up error:', error);
            
            // Handle specific Supabase errors that might indicate user exists
            if (error.message.includes('user_already_exists') || 
                error.message.includes('duplicate') ||
                error.message.includes('already registered')) {
              
              // Double-check with our own detection
              const doubleCheck = await get().checkUserExists(email);
              if (doubleCheck.exists) {
                if (doubleCheck.providers.includes('google')) {
                  return { 
                    error: 'This email is already registered with Google. Please sign in with Google instead.',
                    provider: 'google'
                  };
                } else {
                  return { 
                    error: 'An account with this email already exists. Please sign in instead.',
                    provider: 'email'
                  };
                }
              }
            }
            
            return { error: error.message };
          }

          console.log('[authStore] Sign up response received:', { 
            user: !!data.user, 
            emailConfirmed: !!data.user?.email_confirmed_at 
          });

          // Handle different sign up scenarios
          if (data.user && !data.user.email_confirmed_at) {
            console.log('[authStore] User created, email confirmation required');
            set({ isVerificationPending: true, verificationEmail: email });
            return { success: true };
          } else if (data.user && data.user.email_confirmed_at) {
            console.log('[authStore] User created and already confirmed');
            // User is already confirmed (might happen if email confirmation is disabled)
            return { success: true };
          } else {
            console.log('[authStore] No user object returned, likely email confirmation required');
            // This is the "fake success" case - Supabase returns success but no user object
            // when email confirmation is enabled and user needs to confirm
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
          
          // Clear all Supabase session storage first
          try {
            // Clear any remaining Supabase session data
            const storageKeys = [
              'supabase.auth.token',
              'supabase.auth.refreshToken',
              'supabase.auth.codeVerifier',
              'supabase.auth.pkceCodeVerifier'
            ];
            
            storageKeys.forEach(key => {
              localStorage.removeItem(key);
              sessionStorage.removeItem(key);
            });
            
            // Clear our auth store persisted data
            localStorage.removeItem('kanvas-auth');
            
            console.log('[authStore] Cleared all session storage');
          } catch (clearError) {
            console.warn('[authStore] Error clearing session storage:', clearError);
          }
          
          // Now sign out from Supabase - the auth state change listener will handle the rest
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
        quotaBytes: 10 * 1024 * 1024 * 1024, // 10GB
        maxBooks: -1, // Unlimited books
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
    
    // Clear all Supabase session storage first
    try {
      const storageKeys = [
        'supabase.auth.token',
        'supabase.auth.refreshToken',
        'supabase.auth.codeVerifier',
        'supabase.auth.pkceCodeVerifier'
      ];
      
      storageKeys.forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
    } catch (clearError) {
      console.warn('[authStore] Error clearing session storage in debug method:', clearError);
    }
    
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

  // Enhanced auth methods for provider conflict resolution
  
  // Check if user exists and what providers they have
  checkUserExists: async (email: string) => {
    try {
      console.log('[authStore] Checking if user exists:', email);
      
      // Method 1: Try to get user by email using admin API (if available)
      // For now, we'll use a client-side approach by attempting sign-in methods
      
      // Check if user exists in auth.users by trying to sign in with a dummy password
      // This is a workaround since we don't have direct admin access
      
      // Try to get current user info to see if email matches
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user?.email === email) {
        console.log('[authStore] User found in current session');
        const providers = Array.isArray(user.app_metadata?.provider) 
          ? user.app_metadata.provider 
          : user.app_metadata?.provider 
            ? [user.app_metadata.provider] 
            : ['email'];
        return { 
          exists: true, 
          providers,
          userId: user.id 
        };
      }
      
      // Try to check via auth.signInWithPassword with a known invalid password
      // This will tell us if the user exists (invalid credentials) vs doesn't exist
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: 'invalid-password-for-checking-existence-only'
      });
      
      if (signInError?.message === 'Invalid login credentials') {
        console.log('[authStore] User exists but wrong password - could be Google or Email user');
        // User exists, but we don't know which provider - return both to trigger conflict detection
        return { 
          exists: true, 
          providers: ['email', 'google'], // Return both to trigger conflict UI
          userId: undefined 
        };
      } else if (signInError?.message.includes('Email not confirmed')) {
        console.log('[authStore] User exists but email not confirmed');
        return { 
          exists: true, 
          providers: ['email'], 
          userId: undefined 
        };
      } else if (signInError?.message.includes('Invalid login credentials')) {
        console.log('[authStore] User does not exist');
        return { exists: false, providers: [] };
      }
      
      // Default fallback - assume user doesn't exist
      console.log('[authStore] Could not determine user existence, assuming false');
      return { exists: false, providers: [] };
      
    } catch (error) {
      console.error('[authStore] Error checking user existence:', error);
      return { exists: false, providers: [] };
    }
  },

  // Detect which auth provider a user can/should use
  detectAuthProvider: async (email: string) => {
    try {
      console.log('[authStore] Detecting auth provider for:', email);
      
      const userCheck = await get().checkUserExists(email);
      
      if (!userCheck.exists) {
        return { 
          provider: null, 
          canUseEmail: true, 
          canUseGoogle: true 
        };
      }
      
      const providers = userCheck.providers || [];
      const canUseEmail = providers.includes('email');
      const canUseGoogle = providers.includes('google');
      
      console.log('[authStore] Provider detection result:', {
        providers,
        canUseEmail,
        canUseGoogle
      });
      
      // If both providers are possible, we need to let the actual sign-in attempt determine
      if (providers.length > 1) {
        return {
          provider: null, // Let the actual sign-in determine
          canUseEmail: true,
          canUseGoogle: true
        };
      }
      
      return {
        provider: providers[0] || null,
        canUseEmail,
        canUseGoogle
      };
      
    } catch (error) {
      console.error('[authStore] Error detecting auth provider:', error);
      return { 
        provider: null, 
        canUseEmail: true, 
        canUseGoogle: true 
      };
    }
  },

  // Link password to existing Google user
  linkPasswordToGoogleUser: async (email: string, password: string) => {
    try {
      console.log('[authStore] Attempting to link password to Google user:', email);
      
      // Method 1: Try to update the user's password directly
      // This requires the user to be authenticated first, so we'll use password reset
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/reset-password?setup=true`
      });
      
      if (error) {
        console.error('[authStore] Error sending password reset:', error);
        return { error: error.message };
      }
      
      console.log('[authStore] Password reset sent successfully');
      return { success: true, message: 'Password setup link sent to your email! Check your inbox to continue.' };
      
    } catch (error) {
      console.error('[authStore] Unexpected error linking password:', error);
      return { error: 'An unexpected error occurred while setting up password access' };
    }
  },

  // Enhanced method to create password for Google users
  createPasswordForGoogleUser: async (email: string, newPassword: string, resetToken?: string) => {
    try {
      console.log('[authStore] Creating password for Google user:', email);
      
      // This would typically be called from the reset password flow
      // For now, we'll use the reset password approach
      
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      
      if (error) {
        console.error('[authStore] Error updating password:', error);
        return { error: error.message };
      }
      
      console.log('[authStore] Password created successfully');
      return { success: true, message: 'Password created successfully! You can now sign in with either Google or your password.' };
      
    } catch (error) {
      console.error('[authStore] Unexpected error creating password:', error);
      return { error: 'An unexpected error occurred while creating your password' };
    }
  },

  // Data migration methods
  checkForMigrationConflicts: async (userId: string) => {
    try {
      console.log('[authStore] Checking for migration conflicts for user:', userId);
      const conflict = await dataMigrationService.checkMigrationConflicts(userId);
      return conflict;
    } catch (error) {
      console.error('[authStore] Error checking migration conflicts:', error);
      return null;
    }
  },

  shouldShowGuestImport: async () => {
    try {
      console.log('[authStore] Checking if guest import should be shown');
      const shouldShow = await dataMigrationService.shouldMigrateLocalData();
      return shouldShow;
    } catch (error) {
      console.error('[authStore] Error checking guest import:', error);
      return false;
    }
  },

  executeDataMigration: async (strategy: any, userId: string) => {
    try {
      console.log('[authStore] Executing data migration with strategy:', strategy);
      const result = await dataMigrationService.executeMigration(strategy, userId);
      return result;
    } catch (error) {
      console.error('[authStore] Error executing data migration:', error);
      return {
        success: false,
        strategy,
        message: 'Migration failed. Please try again.'
      };
    }
  },
    }),
    {
      name: 'kanvas-auth',
      // Use secure storage for sensitive authentication data
      storage: {
        getItem: (name) => secureStorage.getItem(name),
        setItem: (name, value) => secureStorage.setItem(name, value, { encrypt: true }),
        removeItem: (name) => secureStorage.removeItem(name),
      },
      // Only persist minimal state - authentication should be fresh each time
      partialize: (state) => ({
        plan: state.plan || 'guest',
        licenseInfo: state.licenseInfo,
        _lastFetchedUserId: state._lastFetchedUserId || '',
        _authStateInitialized: state._authStateInitialized || false,
      } as any),
      // Don't persist authentication state to avoid sign out issues
      skipHydration: false,
    }
  )
);
