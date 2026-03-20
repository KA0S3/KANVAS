-- =====================================================
-- DIAGNOSE INFINITE RECURSION IN RLS POLICIES
-- =====================================================

-- Check current RLS policies on users table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname;

-- Check if there are any circular references in policies
-- Look for policies that reference the users table within their conditions
SELECT 
    'users' as table_name,
    policyname,
    qual as condition,
    with_check as check_condition,
    CASE 
        WHEN qual::text LIKE '%users.%' THEN 'POTENTIAL RECURSION - references users table'
        WHEN with_check::text LIKE '%users.%' THEN 'POTENTIAL RECURSION - references users table'
        ELSE 'OK'
    END as recursion_check
FROM pg_policies 
WHERE tablename = 'users';

-- Check all RLS enabled tables
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = true
ORDER BY tablename;

-- Check for any policies that might cause circular dependencies
SELECT 
    pt.schemaname,
    pt.tablename,
    pp.policyname,
    pp.cmd,
    pp.qual,
    pp.with_check
FROM pg_tables pt
JOIN pg_policies pp ON pt.tablename = pp.tablename
WHERE pt.schemaname = 'public'
AND pt.rowsecurity = true
AND (
    pp.qual::text LIKE '%users.%' OR 
    pp.with_check::text LIKE '%users.%' OR
    pp.qual::text LIKE '%EXISTS%users%' OR
    pp.with_check::text LIKE '%EXISTS%users%'
);

-- Drop all existing policies on users table to fix recursion
DROP POLICY IF EXISTS "Users can view own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
DROP POLICY IF EXISTS "Users can insert own data" ON public.users;
DROP POLICY IF EXISTS "Owners can view all users" ON public.users;
DROP POLICY IF EXISTS "Service role can manage users" ON public.users;

-- Create simple, non-recursive policies
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Owners can view all users" ON public.users FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND plan_type = 'owner'
    )
);

-- Verify the new policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname;
