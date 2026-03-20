// Debug script to test API endpoints
// Run this in browser console after you're authenticated

console.log('=== API DEBUG ===');

// Test admin API endpoints
(async () => {
  try {
    // Get current session
    const { data: { session } } = await window.supabase.auth.getSession();
    
    if (!session?.access_token) {
      console.error('❌ No access token - please sign in first');
      return;
    }
    
    console.log('✅ Found access token');
    
    const headers = {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    };
    
    // Test 1: Check Supabase Functions URL
    const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
    const functionsUrl = `${supabaseUrl}/functions/v1`;
    console.log('Testing functions URL:', functionsUrl);
    
    // Test 2: admin-users endpoint
    console.log('Testing admin-users endpoint...');
    try {
      const usersResponse = await fetch(`${functionsUrl}/admin-users?page=1`, {
        method: 'GET',
        headers
      });
      
      console.log('admin-users status:', usersResponse.status);
      const usersData = await usersResponse.json();
      console.log('admin-users response:', usersData);
    } catch (err) {
      console.error('admin-users error:', err);
    }
    
    // Test 3: admin-promo-codes endpoint
    console.log('Testing admin-promo-codes endpoint...');
    try {
      const promoResponse = await fetch(`${functionsUrl}/admin-promo-codes`, {
        method: 'GET',
        headers
      });
      
      console.log('admin-promo-codes status:', promoResponse.status);
      const promoData = await promoResponse.json();
      console.log('admin-promo-codes response:', promoData);
    } catch (err) {
      console.error('admin-promo-codes error:', err);
    }
    
    // Test 4: admin-owner-keys endpoint
    console.log('Testing admin-owner-keys endpoint...');
    try {
      const keysResponse = await fetch(`${functionsUrl}/admin-owner-keys`, {
        method: 'GET',
        headers
      });
      
      console.log('admin-owner-keys status:', keysResponse.status);
      const keysData = await keysResponse.json();
      console.log('admin-owner-keys response:', keysData);
    } catch (err) {
      console.error('admin-owner-keys error:', err);
    }
    
  } catch (err) {
    console.error('API test setup error:', err);
  }
})();

console.log('=== END API DEBUG ===');
