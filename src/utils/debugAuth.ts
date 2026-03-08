/**
 * Debug utility for authentication and plan issues
 */

import { useAuthStore } from '@/stores/authStore';

export function debugAuthState() {
  const state = useAuthStore.getState();
  
  console.group('[DEBUG] Auth State');
  console.log('User:', state.user?.email || 'No user');
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
  console.groupEnd();
  
  return state;
}

export function clearAuthDebug() {
  console.log('[DEBUG] Clearing auth data...');
  useAuthStore.getState().clearAllAuthData();
  localStorage.removeItem('kanvas-auth');
}

// Add to window for easy debugging in browser console
if (typeof window !== 'undefined') {
  (window as any).debugAuth = debugAuthState;
  (window as any).clearAuth = clearAuthDebug;
}
