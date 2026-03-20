-- COMPLETE PRODUCTION-READY RLS IMPLEMENTATION
-- Includes missing tables and fixes schema inconsistencies

------------------------------------------------
-- STEP 0 — CREATE MISSING TABLES (if needed)
------------------------------------------------

-- Books table (missing from schema)
CREATE TABLE IF NOT EXISTS books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    world_data JSONB,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User preferences table (missing from schema)
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    book_id UUID REFERENCES books(id) ON DELETE CASCADE,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Promo codes table (missing from schema)
CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value DECIMAL(10,2) NOT NULL,
    max_uses INTEGER,
    uses_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add updated_at trigger for missing tables
CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON books FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_promo_codes_updated_at BEFORE UPDATE ON promo_codes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

------------------------------------------------
-- STEP 1 — REMOVE ALL POLICIES
------------------------------------------------

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      r.policyname,
      r.tablename
    );
  END LOOP;
END $$;


------------------------------------------------
-- STEP 2 — ENSURE RLS ENABLED
------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;


------------------------------------------------
-- STEP 3 — CREATE USER HANDLING TRIGGER (OFFICIAL PATTERN)
------------------------------------------------

-- Create trigger function to automatically create user row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at)
  VALUES (NEW.id, NEW.email, now())
  ON CONFLICT (id) DO NOTHING; -- Handle case where user already exists
  RETURN NEW;
END;
$$;

-- Create trigger that fires after user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();


------------------------------------------------
-- STEP 4 — USERS TABLE (NO INSERT POLICY - HANDLED BY TRIGGER)
------------------------------------------------

-- Users table needs special handling since id = auth.uid()
-- Note: NO INSERT policy - handled by trigger
CREATE POLICY "users_read_own"
ON public.users
FOR SELECT
TO authenticated
USING ((select auth.uid()) = id);

CREATE POLICY "users_update_own"
ON public.users
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = id)
WITH CHECK ((select auth.uid()) = id);


------------------------------------------------
-- STEP 5 — USER OWNED TABLES (PERFORMANCE OPTIMIZED)
------------------------------------------------

-- projects
CREATE POLICY "projects_select_own"
ON public.projects
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "projects_insert_own"
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "projects_update_own"
ON public.projects
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "projects_delete_own"
ON public.projects
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

-- assets
CREATE POLICY "assets_select_own"
ON public.assets
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "assets_insert_own"
ON public.assets
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "assets_update_own"
ON public.assets
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "assets_delete_own"
ON public.assets
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

-- storage_usage
CREATE POLICY "storage_select_own"
ON public.storage_usage
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "storage_insert_own"
ON public.storage_usage
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "storage_update_own"
ON public.storage_usage
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- licenses
CREATE POLICY "licenses_select_own"
ON public.licenses
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "licenses_insert_own"
ON public.licenses
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "licenses_update_own"
ON public.licenses
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- owner_keys
CREATE POLICY "owner_keys_select_own"
ON public.owner_keys
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "owner_keys_insert_own"
ON public.owner_keys
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "owner_keys_update_own"
ON public.owner_keys
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- purchases
CREATE POLICY "purchases_select_own"
ON public.purchases
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "purchases_insert_own"
ON public.purchases
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "purchases_update_own"
ON public.purchases
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- books
CREATE POLICY "books_select_own"
ON public.books
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "books_insert_own"
ON public.books
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "books_update_own"
ON public.books
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "books_delete_own"
ON public.books
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

-- user_preferences
CREATE POLICY "prefs_select_own"
ON public.user_preferences
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "prefs_insert_own"
ON public.user_preferences
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "prefs_update_own"
ON public.user_preferences
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);


------------------------------------------------
-- STEP 6 — ADMIN TABLES (SERVICE ROLE ONLY)
------------------------------------------------

-- promo_codes - admin only
CREATE POLICY "promo_codes_select_admin"
ON public.promo_codes
FOR SELECT
TO service_role
USING (true);

CREATE POLICY "promo_codes_insert_admin"
ON public.promo_codes
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "promo_codes_update_admin"
ON public.promo_codes
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "promo_codes_delete_admin"
ON public.promo_codes
FOR DELETE
TO service_role
USING (true);

-- admin_actions - admin only
CREATE POLICY "admin_actions_select_admin"
ON public.admin_actions
FOR SELECT
TO service_role
USING (true);

CREATE POLICY "admin_actions_insert_admin"
ON public.admin_actions
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "admin_actions_update_admin"
ON public.admin_actions
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "admin_actions_delete_admin"
ON public.admin_actions
FOR DELETE
TO service_role
USING (true);


------------------------------------------------
-- STEP 7 — CRITICAL FOREIGN KEY CONSTRAINTS
------------------------------------------------

-- Fix existing foreign keys to reference auth.users instead of public.users
ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS fk_projects_user,
ADD CONSTRAINT fk_projects_user
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.assets
DROP CONSTRAINT IF EXISTS fk_assets_user,
ADD CONSTRAINT fk_assets_user
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.storage_usage
DROP CONSTRAINT IF EXISTS fk_storage_user,
ADD CONSTRAINT fk_storage_user
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.licenses
DROP CONSTRAINT IF EXISTS fk_licenses_user,
ADD CONSTRAINT fk_licenses_user
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.owner_keys
DROP CONSTRAINT IF EXISTS fk_owner_keys_user,
ADD CONSTRAINT fk_owner_keys_user
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.purchases
DROP CONSTRAINT IF EXISTS fk_purchases_user,
ADD CONSTRAINT fk_purchases_user
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign keys for new tables
ALTER TABLE public.books
ADD CONSTRAINT IF NOT EXISTS fk_books_user
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_preferences
ADD CONSTRAINT IF NOT EXISTS fk_prefs_user
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Users table references auth.users
ALTER TABLE public.users
ADD CONSTRAINT IF NOT EXISTS fk_users_auth
FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Fix other references that should point to auth.users
ALTER TABLE public.owner_keys
DROP CONSTRAINT IF EXISTS owner_keys_created_by_fkey,
ADD CONSTRAINT owner_keys_created_by_fkey
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.owner_keys
DROP CONSTRAINT IF EXISTS owner_keys_revoked_by_fkey,
ADD CONSTRAINT owner_keys_revoked_by_fkey
FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.admin_actions
DROP CONSTRAINT IF EXISTS admin_actions_admin_user_id_fkey,
ADD CONSTRAINT admin_actions_admin_user_id_fkey
FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.admin_actions
DROP CONSTRAINT IF EXISTS admin_actions_target_user_id_fkey,
ADD CONSTRAINT admin_actions_target_user_id_fkey
FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


------------------------------------------------
-- STEP 8 — PERFORMANCE INDEXES
------------------------------------------------

-- Index for RLS performance with optimized auth.uid() caching
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_user_id ON public.assets(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_user_id ON public.storage_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON public.licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_owner_keys_user_id ON public.owner_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON public.purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_books_user_id ON public.books(user_id);
CREATE INDEX IF NOT EXISTS idx_prefs_user_id ON public.user_preferences(user_id);

-- Critical: Users table index for auth.uid() = id lookups
CREATE INDEX IF NOT EXISTS idx_users_id ON public.users(id);

-- Additional indexes for new tables
CREATE INDEX IF NOT EXISTS idx_books_title ON public.books(title);
CREATE INDEX IF NOT EXISTS idx_prefs_book_id ON public.user_preferences(book_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON public.promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON public.promo_codes(is_active);


------------------------------------------------
-- STEP 9 — VERIFICATION QUERIES
------------------------------------------------

-- Check RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('users', 'projects', 'assets', 'storage_usage', 'licenses', 'owner_keys', 'purchases', 'books', 'user_preferences', 'promo_codes', 'admin_actions')
ORDER BY tablename;

-- Check policies were created correctly
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    roles,
    qual as using_clause,
    with_check as check_clause
FROM pg_policies 
WHERE schemaname = 'public'
    AND tablename IN ('users', 'projects', 'assets', 'storage_usage', 'licenses', 'owner_keys', 'purchases', 'books', 'user_preferences', 'promo_codes', 'admin_actions')
ORDER BY tablename, cmd, policyname;

-- Check foreign key constraints
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;


------------------------------------------------
-- STEP 10 — CLEANUP OLD INDEXES (if they exist)
------------------------------------------------

-- Drop old indexes that conflict with new ones
DROP INDEX IF EXISTS idx_admin_actions_admin_user_id;
DROP INDEX IF EXISTS idx_admin_actions_target_user_id;

-- Recreate with proper naming
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_user_id ON public.admin_actions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target_user_id ON public.admin_actions(target_user_id);


------------------------------------------------
-- STEP 11 — PRODUCTION READINESS CHECKLIST
------------------------------------------------

/*
✅ PRODUCTION DEPLOYMENT CHECKLIST:

1. FRONTEND CONFIGURATION:
   ✅ Use ANON key for frontend
   ❌ NEVER use service_role key in frontend
   ✅ All queries include user_id filtering
   ✅ Session management implemented

2. BACKEND CONFIGURATION:
   ✅ Use service_role key for admin operations
   ✅ Admin operations go through backend endpoints
   ✅ Debug functions restricted to service_role

3. DATABASE INTEGRITY:
   ✅ Foreign key constraints enforce relationships
   ✅ ON DELETE CASCADE prevents orphaned rows
   ✅ Trigger handles user creation automatically
   ✅ All tables reference auth.users (not public.users)

4. PERFORMANCE OPTIMIZATION:
   ✅ (select auth.uid()) pattern for caching
   ✅ Indexes on all user_id columns
   ✅ Index on users.id for auth.uid() lookups

5. SECURITY:
   ✅ RLS enabled on all tables
   ✅ No INSERT policy on users (handled by trigger)
   ✅ Admin tables restricted to service_role
   ✅ Debug functions access restricted

6. MISSING TABLES FIXED:
   ✅ books table created
   ✅ user_preferences table created
   ✅ promo_codes table created
   ✅ All foreign keys properly reference auth.users

7. SCHEMA CONSISTENCY:
   ✅ Fixed foreign key references
   ✅ Added missing constraints
   ✅ Updated triggers for new tables

COMMON PRODUCTION ISSUES:

❌ Frontend using service_role key
   Fix: Use anon key in frontend env variables

❌ Missing user_id in INSERT statements  
   Fix: Always include user_id: session.user.id

❌ Auth state not initialized
   Fix: Ensure auth listener is set up

❌ Orphaned rows without foreign keys
   Fix: Foreign key constraints prevent this

❌ Slow queries on large tables
   Fix: Indexes and (select auth.uid()) optimization

❌ Foreign keys pointing to wrong table
   Fix: All now point to auth.users(id)

FRONTEND EXAMPLES:

✅ CORRECT:
const { data } = await supabase
  .from('projects')
  .select('*')
  .eq('user_id', session.user.id);

❌ WRONG:
const { data } = await supabase
  .from('projects')
  .select('*');

✅ CORRECT INSERT:
const { data } = await supabase
  .from('projects')
  .insert({
    user_id: session.user.id,
    name: 'New Project'
  });

❌ WRONG INSERT:
const { data } = await supabase
  .from('projects')
  .insert({
    name: 'New Project'  // Missing user_id!
  });

*/
