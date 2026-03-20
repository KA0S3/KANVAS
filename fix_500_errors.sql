-- =====================================================
-- COMPLETE RLS POLICY FIX FOR 500 ERRORS
-- =====================================================

-- First, disable RLS temporarily to test if policies are the issue
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.books DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences DISABLE ROW LEVEL SECURITY;

-- Test basic query without RLS
SELECT 'Testing without RLS - users table:' as test, COUNT(*) as count FROM public.users;

-- Now re-enable RLS with simple, working policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies completely
DROP POLICY IF EXISTS "Users can view own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
DROP POLICY IF EXISTS "Users can insert own data" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Owners can view all users" ON public.users;
DROP POLICY IF EXISTS "Service role can manage users" ON public.users;
DROP POLICY IF EXISTS "Owner full access" ON public.users;
DROP POLICY IF EXISTS "Owners can manage owner keys" ON public.owner_keys;
DROP POLICY IF EXISTS "Users can view own owner keys" ON public.owner_keys;

-- Create the simplest possible policies for users table
CREATE POLICY "Enable read access for all users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.users FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for own data" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Simple policies for other tables
CREATE POLICY "Enable read access for owner keys" ON public.owner_keys FOR SELECT USING (true);
CREATE POLICY "Enable read access for promo codes" ON public.promo_codes FOR SELECT USING (true);
CREATE POLICY "Enable read access for books" ON public.books FOR SELECT USING (true);
CREATE POLICY "Enable read access for user preferences" ON public.user_preferences FOR SELECT USING (true);

-- Test the policies
SELECT 'Testing with simple RLS policies:' as test, COUNT(*) as count FROM public.users;

-- Show final policies
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    CASE 
        WHEN qual = 'true' THEN 'ALLOW ALL'
        WHEN qual::text LIKE '%auth.uid%' THEN 'RESTRICTED TO OWN'
        ELSE qual::text
    END as policy_logic
FROM pg_policies 
WHERE tablename IN ('users', 'owner_keys', 'promo_codes', 'books', 'user_preferences')
ORDER BY tablename, policyname;
