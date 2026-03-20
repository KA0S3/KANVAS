-- COMPREHENSIVE ADMIN RLS FIX
-- All admin components need service role policies

-- The problem: Admin components query admin tables but frontend uses anon key
-- Solution: Either use service role in backend OR create admin role policies

-- OPTION 1: Create admin role for specific users (recommended)
-- Create a role that can be granted to specific admin users
DO $$
BEGIN
  -- Create admin role if it doesn't exist
  CREATE ROLE IF NOT EXISTS admin_users;
  
  -- Grant admin role to your owner user (replace with actual user ID)
  -- You'll need to run this for each admin user:
  -- GRANT admin_users TO auth.uid(); -- where auth.uid() is the admin user's ID
EXCEPTION
  WHEN duplicate_object THEN NULL; -- Role already exists
END;
$$;

-- OPTION 2: Service role policies for all admin tables
-- This allows ANY service role client to access admin tables

-- Drop existing admin table policies
DROP POLICY IF EXISTS "promo_codes_select_admin" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_insert_admin" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_update_admin" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_delete_admin" ON public.promo_codes;

DROP POLICY IF EXISTS "admin_actions_select_admin" ON public.admin_actions;
DROP POLICY IF EXISTS "admin_actions_insert_admin" ON public.admin_actions;
DROP POLICY IF EXISTS "admin_actions_update_admin" ON public.admin_actions;
DROP POLICY IF EXISTS "admin_actions_delete_admin" ON public.admin_actions;

-- Recreate admin table policies
CREATE POLICY "promo_codes_all" ON public.promo_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_actions_all" ON public.admin_actions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- OPTION 3: Admin role policies (if using admin_users role)
-- Uncomment these if you create admin_users role above

/*
CREATE POLICY "promo_codes_admin" ON public.promo_codes FOR ALL TO admin_users USING (true) WITH CHECK (true);
CREATE POLICY "admin_actions_admin" ON public.admin_actions FOR ALL TO admin_users USING (true) WITH CHECK (true);
CREATE POLICY "owner_keys_admin" ON public.owner_keys FOR ALL TO admin_users USING (true) WITH CHECK (true);
*/

-- Test the fix
SELECT '=== TESTING ADMIN ACCESS ===' as section;

-- Test if service role can access admin tables
SELECT 'Service role access to promo_codes:' as test;
SELECT count(*) as promo_count FROM promo_codes;

SELECT 'Service role access to admin_actions:' as test;
SELECT count(*) as admin_action_count FROM admin_actions;

-- Check current policies
SELECT '=== CURRENT POLICIES ===' as section;
SELECT 
    tablename,
    policyname,
    cmd,
    roles
FROM pg_policies 
WHERE schemaname = 'public'
    AND tablename IN ('users', 'promo_codes', 'admin_actions', 'owner_keys')
ORDER BY tablename, policyname;

-- IMPORTANT: Frontend components still use anon key
-- If you want admin components to work in frontend:
-- 1. Create admin_users role and grant to specific users (above)
-- 2. Use admin role policies (uncommented above)
-- 3. Make sure admin users are granted the admin_users role

-- OR move admin operations to backend with service role key
