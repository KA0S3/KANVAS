-- FIX FOR USERMANAGER RLS ISSUE
-- UserManager is an admin component that needs to see all users

-- The problem: UserManager queries users table without user_id filter
-- But RLS policy only allows users to see their own row
-- Solution: Create admin access policy for users table

-- First, drop existing users policies
DROP POLICY IF EXISTS "users_read_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;

-- Create proper policies for users table
-- 1. Users can read/update their own data
CREATE POLICY "users_read_own" ON public.users FOR SELECT TO authenticated USING ((select auth.uid()) = id);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE TO authenticated USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

-- 2. Service role (admin) can read all users for admin operations
CREATE POLICY "users_read_admin" ON public.users FOR SELECT TO service_role USING (true);

-- 3. Service role can update users for admin operations  
CREATE POLICY "users_update_admin" ON public.users FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- Alternative: If you want specific admin users (not just service role) to access all users:
-- Create an admin role and grant it to specific users
-- CREATE ROLE admin_users;
-- GRANT admin_users TO your_admin_user_id;
-- CREATE POLICY "users_read_admin" ON public.users FOR SELECT TO admin_users USING (true);

-- Test the fix
SELECT '=== TESTING USERMANAGER ACCESS ===' as section;

-- Test 1: Regular user should only see their own row
SELECT 'Regular user access (should return 1 row):' as test;
SELECT count(*) as row_count FROM users WHERE (select auth.uid()) = id;

-- Test 2: Service role should see all users (for admin operations)
-- This would be tested with service_role client, not here

-- Check if policies are correct now
SELECT '=== UPDATED POLICIES ===' as section;
SELECT tablename, policyname, cmd, roles FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'users'
ORDER BY policyname;
