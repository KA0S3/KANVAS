-- STEP 2: FIX USER AUTHENTICATION
-- Check and fix authentication issues

-- Test if user is actually authenticated
SELECT '=== AUTHENTICATION TEST ===' as section;
SELECT 
    auth.uid() as current_user_id,
    auth.role() as current_role,
    auth.jwt() ->> 'email' as user_email;

-- If auth.uid() is null, run this to check auth.users table
SELECT '=== AUTH USERS CHECK ===' as section;
SELECT id, email, created_at FROM auth.users LIMIT 5;

-- If you're not authenticated, you need to:
-- 1. Sign in through your frontend application
-- 2. Or use a valid JWT token
-- 3. Check that your frontend is sending the auth header

-- Quick fix: Check if there are any users at all
SELECT count(*) as total_auth_users FROM auth.users;

-- If you have users but auth.uid() is null, the issue is:
-- - Frontend not sending auth headers
-- - JWT token expired
-- - Wrong Supabase URL/keys in frontend
