-- SIMPLE ADMIN FIX - FRONTEND APPROACH
-- Keep admin components in frontend but give them proper access

-- Step 1: Create admin role and grant to your user
-- Replace 'YOUR_USER_ID' with your actual user ID from auth.users table
DO $$
BEGIN
  CREATE ROLE IF NOT EXISTS admin_users;
  GRANT admin_users TO 'YOUR_USER_ID';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- Step 2: Drop all existing policies
DROP POLICY IF EXISTS "users_read_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_read_admin" ON public.users;
DROP POLICY IF EXISTS "users_update_admin" ON public.users;

DROP POLICY IF EXISTS "promo_codes_select_admin" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_insert_admin" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_update_admin" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_delete_admin" ON public.promo_codes;

DROP POLICY IF EXISTS "admin_actions_select_admin" ON public.admin_actions;
DROP POLICY IF EXISTS "admin_actions_insert_admin" ON public.admin_actions;
DROP POLICY IF EXISTS "admin_actions_update_admin" ON public.admin_actions;
DROP POLICY IF EXISTS "admin_actions_delete_admin" ON public.admin_actions;

DROP POLICY IF EXISTS "owner_keys_select_own" ON public.owner_keys;
DROP POLICY IF EXISTS "owner_keys_insert_own" ON public.owner_keys;
DROP POLICY IF EXISTS "owner_keys_update_own" ON public.owner_keys;

-- Step 3: Create simple policies
-- Users table - regular users see own, admin users see all
CREATE POLICY "users_read_own" ON public.users FOR SELECT TO authenticated USING ((select auth.uid()) = id);
CREATE POLICY "users_admin" ON public.users FOR ALL TO admin_users USING (true) WITH CHECK (true);

-- Admin tables - only admin users can access
CREATE POLICY "promo_codes_admin" ON public.promo_codes FOR ALL TO admin_users USING (true) WITH CHECK (true);
CREATE POLICY "admin_actions_admin" ON public.admin_actions FOR ALL TO admin_users USING (true) WITH CHECK (true);
CREATE POLICY "owner_keys_admin" ON public.owner_keys FOR ALL TO admin_users USING (true) WITH CHECK (true);

-- Step 4: Test it works
SELECT '=== ADMIN ACCESS TEST ===' as test;
SELECT count(*) as users_count FROM users;
SELECT count(*) as promo_codes_count FROM promo_codes;
SELECT count(*) as admin_actions_count FROM admin_actions;
SELECT count(*) as owner_keys_count FROM owner_keys;

-- Step 5: How to find your user ID
-- Run this to get your user ID:
SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';

-- Then replace 'YOUR_USER_ID' in the script above with your actual ID
