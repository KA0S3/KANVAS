-- SIMPLE ADMIN FIX - BACKEND APPROACH
-- Move admin operations to backend where they belong

-- Step 1: Create admin policies for service role only
DROP POLICY IF EXISTS "users_read_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_read_admin" ON public.users;
DROP POLICY IF EXISTS "users_update_admin" ON public.users;

CREATE POLICY "users_service_role" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "promo_codes_select_admin" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_insert_admin" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_update_admin" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_delete_admin" ON public.promo_codes;

CREATE POLICY "promo_codes_service_role" ON public.promo_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_actions_select_admin" ON public.admin_actions;
DROP POLICY IF EXISTS "admin_actions_insert_admin" ON public.admin_actions;
DROP POLICY IF EXISTS "admin_actions_update_admin" ON public.admin_actions;
DROP POLICY IF EXISTS "admin_actions_delete_admin" ON public.admin_actions;

CREATE POLICY "admin_actions_service_role" ON public.admin_actions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "owner_keys_select_own" ON public.owner_keys;
DROP POLICY IF EXISTS "owner_keys_insert_own" ON public.owner_keys;
DROP POLICY IF EXISTS "owner_keys_update_own" ON public.owner_keys;

CREATE POLICY "owner_keys_service_role" ON public.owner_keys FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Step 2: Test it works
SELECT '=== ADMIN ACCESS TEST ===' as test;
SELECT count(*) as users_count FROM users;
SELECT count(*) as promo_codes_count FROM promo_codes;
SELECT count(*) as admin_actions_count FROM admin_actions;
SELECT count(*) as owner_keys_count FROM owner_keys;

-- Step 3: What to do in frontend
-- Replace admin components with API calls to backend:
-- 
-- UserManager -> GET /api/admin/users
-- PromoCodeManager -> GET /api/admin/promo-codes  
-- OwnerKeyManager -> GET /api/admin/owner-keys
-- OwnerDashboard -> GET /api/admin/stats
--
-- Create Supabase Edge Functions with service role key
-- Frontend calls these instead of direct DB queries
