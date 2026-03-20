// Debug script to check authentication state
// Run this in browser console to debug auth issues

console.log('=== AUTHENTICATION DEBUG ===');

// Check Supabase client
if (window.supabase) {
  console.log('✅ Supabase client found');
} else {
  console.log('❌ Supabase client not found');
}

// Check current session
(async () => {
  try {
    const { data: { session }, error } = await window.supabase.auth.getSession();
    console.log('Current session:', session);
    console.log('Session error:', error);
    
    if (session?.user) {
      console.log('✅ User authenticated:', session.user.email);
      console.log('User ID:', session.user.id);
      console.log('User metadata:', session.user.user_metadata);
      console.log('App metadata:', session.user.app_metadata);
    } else {
      console.log('❌ No authenticated user');
    }
  } catch (err) {
    console.error('Error checking session:', err);
  }
})();

// Check auth store state (if available)
if (window.useAuthStore) {
  const authStore = window.useAuthStore.getState();
  console.log('Auth store state:', {
    user: authStore.user?.email,
    plan: authStore.plan,
    isAuthenticated: authStore.isAuthenticated,
    loading: authStore.loading,
    planLoading: authStore.planLoading
  });
} else {
  console.log('❌ Auth store not available');
}

// Check environment variables
console.log('Environment variables:', {
  VITE_SUPABASE_URL: import.meta.env?.VITE_SUPABASE_URL,
  VITE_OWNER_EMAIL: import.meta.env?.VITE_OWNER_EMAIL,
  VITE_SUPABASE_ANON_KEY: import.meta.env?.VITE_SUPABASE_ANON_KEY ? '***' : 'MISSING'
});

// Test API connectivity
(async () => {
  try {
    console.log('Testing API connectivity...');
    const response = await fetch('/api/health');
    console.log('API health check:', response.status, response.statusText);
  } catch (err) {
    console.error('API health check failed:', err);
  }
})();

console.log('=== END AUTH DEBUG ===');
