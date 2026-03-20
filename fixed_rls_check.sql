-- FIXED RLS STATUS CHECK
-- Corrected array syntax for PostgreSQL

------------------------------------------------
-- STEP 1 — CHECK IF RLS IS ENABLED
------------------------------------------------

SELECT '=== RLS STATUS ===' as section;
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('users', 'projects', 'assets', 'storage_usage', 'licenses', 'owner_keys', 'purchases', 'books', 'user_preferences', 'promo_codes', 'admin_actions')
ORDER BY tablename;

------------------------------------------------
-- STEP 2 — CHECK WHAT POLICIES EXIST
------------------------------------------------

SELECT '=== POLICIES ===' as section;
SELECT 
    tablename,
    policyname,
    cmd,
    roles
FROM pg_policies 
WHERE schemaname = 'public'
    AND tablename IN ('users', 'projects', 'assets', 'storage_usage', 'licenses', 'owner_keys', 'purchases', 'books', 'user_preferences', 'promo_codes', 'admin_actions')
ORDER BY tablename, cmd, policyname;

------------------------------------------------
-- STEP 3 — CHECK IF TABLES ACTUALLY EXIST
------------------------------------------------

SELECT '=== TABLE EXISTENCE ===' as section;
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name IN ('users', 'projects', 'assets', 'storage_usage', 'licenses', 'owner_keys', 'purchases', 'books', 'user_preferences', 'promo_codes', 'admin_actions')
ORDER BY table_name;

------------------------------------------------
-- STEP 4 — TEST CURRENT USER
------------------------------------------------

SELECT '=== CURRENT USER TEST ===' as section;
SELECT 
    auth.uid() as current_user_id,
    auth.role() as current_role;

------------------------------------------------
-- STEP 5 — SIMPLE ACCESS TEST
------------------------------------------------

SELECT '=== ACCESS TEST ===' as section;
SELECT count(*) as your_projects FROM projects WHERE user_id = auth.uid();
SELECT count(*) as your_assets FROM assets WHERE user_id = auth.uid();

------------------------------------------------
-- STEP 6 — CHECK TRIGGER EXISTS
------------------------------------------------

SELECT '=== TRIGGER STATUS ===' as section;
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

------------------------------------------------
-- STEP 7 — QUICK ISSUE CHECK (FIXED ARRAY SYNTAX)
------------------------------------------------

SELECT '=== QUICK ISSUES ===' as section;

-- Check for users table INSERT policy (should NOT exist)
SELECT 'Users INSERT policies (should be 0):' as check_description;
SELECT COUNT(*) as count FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'users' AND cmd = 'INSERT';

-- Check for policies without roles (FIXED - check for empty array)
SELECT 'Policies without roles (should be 0):' as check_description;
SELECT COUNT(*) as count FROM pg_policies 
WHERE schemaname = 'public' AND (roles = '{}' OR roles IS NULL);

-- Check for duplicate policies per table
SELECT 'Duplicate policies per table:' as check_description;
SELECT tablename, COUNT(*) as policy_count FROM pg_policies 
WHERE schemaname = 'public'
GROUP BY tablename
HAVING COUNT(*) > 1;
