/**
 * Debug utility for authentication and plan issues
 */

import { useAuthStore } from '@/stores/authStore';

export function debugAuthState() {
  const state = useAuthStore.getState();
  
  console.group('[DEBUG] Auth State');
  console.log('User:', state.user?.email || 'No user');
  console.log('User ID:', state.user?.id || 'No user ID');
  console.log('Plan:', state.plan);
  console.log('Loading:', state.loading);
  console.log('Plan Loading:', state.planLoading);
  console.log('Authenticated:', state.isAuthenticated);
  console.log('Owner Email Expected:', import.meta.env.VITE_OWNER_EMAIL);
  console.log('Has Owner Email:', state.user?.email === import.meta.env.VITE_OWNER_EMAIL);
  console.log('Has Owner Plan:', state.plan === 'owner');
  console.log('Can Access Owner Dashboard:', 
    state.user?.email === import.meta.env.VITE_OWNER_EMAIL && state.plan === 'owner'
  );
  console.log('User Metadata:', state.user?.user_metadata);
  console.log('App Metadata:', state.user?.app_metadata);
  console.log('Email Confirmed:', !!state.user?.email_confirmed_at);
  console.log('Created At:', state.user?.created_at);
  console.log('Last Sign In:', state.user?.last_sign_in_at);
  console.groupEnd();
  
  return state;
}

export function clearAuthDebug() {
  console.log('[DEBUG] Clearing auth data...');
  useAuthStore.getState().clearAllAuthData();
  localStorage.removeItem('kanvas-auth');
}

// Enhanced debugging functions for provider conflicts
export async function debugUserProviders(email: string) {
  console.group(`[DEBUG] Checking user providers for: ${email}`);
  
  try {
    const authStore = useAuthStore.getState();
    
    // Check if user exists
    const userCheck = await authStore.checkUserExists(email);
    console.log('User exists:', userCheck.exists);
    console.log('Providers:', userCheck.providers);
    console.log('User ID:', userCheck.userId);
    
    // Detect auth provider
    const providerDetection = await authStore.detectAuthProvider(email);
    console.log('Primary provider:', providerDetection.provider);
    console.log('Can use email:', providerDetection.canUseEmail);
    console.log('Can use Google:', providerDetection.canUseGoogle);
    
    console.groupEnd();
    return { userCheck, providerDetection };
  } catch (error) {
    console.error('Error debugging user providers:', error);
    console.groupEnd();
    return null;
  }
}

export function debugAuthFlow() {
  console.group('[DEBUG] Auth Flow Analysis');
  
  const state = useAuthStore.getState();
  
  // Check current session
  console.log('Current session state:');
  console.log('- User exists:', !!state.user);
  console.log('- Is authenticated:', state.isAuthenticated);
  console.log('- Is loading:', state.loading);
  console.log('- Verification pending:', state.isVerificationPending);
  
  // Check provider info
  if (state.user) {
    console.log('User provider info:');
    console.log('- App metadata provider:', state.user.app_metadata?.provider);
    console.log('- User metadata:', state.user.user_metadata);
    console.log('- Email confirmed:', !!state.user.email_confirmed_at);
    
    // Check if this looks like a Google user
    const isGoogleUser = state.user.app_metadata?.provider === 'google' ||
                        state.user.email?.includes('gmail.com') ||
                        state.user.identities?.some(id => id.provider === 'google');
    
    console.log('- Likely Google user:', isGoogleUser);
    
    if (isGoogleUser) {
      console.log('Google user identities:', state.user.identities?.filter(id => id.provider === 'google'));
    }
  }
  
  // Check local storage
  console.log('Local storage state:');
  console.log('- Auth store persisted:', localStorage.getItem('kanvas-auth'));
  console.log('- Supabase auth token:', localStorage.getItem('supabase.auth.token'));
  
  console.groupEnd();
}

export function simulateProviderConflict(email: string) {
  console.group(`[DEBUG] Simulating provider conflict for: ${email}`);
  
  // This helps test the UI without actually hitting auth errors
  console.log('Simulating Google provider conflict...');
  console.log('This would show the provider conflict UI in production.');
  
  console.groupEnd();
}

// Add to window for easy debugging in browser console
if (typeof window !== 'undefined') {
  (window as any).debugAuth = debugAuthState;
  (window as any).clearAuth = clearAuthDebug;
  (window as any).debugUserProviders = debugUserProviders;
  (window as any).debugAuthFlow = debugAuthFlow;
  (window as any).simulateProviderConflict = simulateProviderConflict;
  
  console.log('[DEBUG] Auth debugging tools available:');
  console.log('- debugAuth() - Show current auth state');
  console.log('- clearAuth() - Clear all auth data');
  console.log('- debugUserProviders(email) - Check user providers');
  console.log('- debugAuthFlow() - Analyze auth flow');
  console.log('- simulateProviderConflict(email) - Simulate conflict');
}
