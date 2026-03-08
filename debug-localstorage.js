// Debug script to check LocalStorageWarning state
// Run this in browser console

console.log('🔍 Debugging LocalStorageWarning...');

// Check if we can access the stores
const authStore = window.useAuthStore?.getState?.();
const cloudStore = window.useCloudStore?.getState?.();

if (authStore && cloudStore) {
  console.log('📊 Current State:');
  console.log('  Auth:', {
    isAuthenticated: authStore.isAuthenticated,
    user: authStore.user?.email,
    plan: authStore.plan,
    loading: authStore.loading,
    planLoading: authStore.planLoading
  });
  console.log('  Cloud:', {
    syncEnabled: cloudStore.syncEnabled,
    quota: cloudStore.quota
  });
  
  // Check the exact condition that hides the warning
  const shouldHide = authStore.isAuthenticated && cloudStore.syncEnabled;
  console.log('  Should hide warning?', shouldHide);
  
  if (!shouldHide) {
    console.log('❌ Warning still showing because:');
    if (!authStore.isAuthenticated) console.log('  - User not authenticated');
    if (!cloudStore.syncEnabled) console.log('  - Sync not enabled');
  } else {
    console.log('✅ Warning should be hidden!');
  }
} else {
  console.error('❌ Could not access stores');
  console.log('  authStore available:', !!authStore);
  console.log('  cloudStore available:', !!cloudStore);
}

// Check localStorage dismissal state
const dismissed = localStorage.getItem('kanvas-localstorage-warning-dismissed');
console.log('  Dismissed in localStorage:', dismissed);

// Manual trigger to update auth state (if needed)
console.log('💡 To manually trigger auth state update, run:');
console.log('   window.useAuthStore.getState().initializeAuth()');
console.log('   window.useCloudStore.getState().forceUpdateSync()');
console.log('   window.useCloudStore.getState().toggleSync()');
