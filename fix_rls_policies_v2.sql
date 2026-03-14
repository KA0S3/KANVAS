-- COMPREHENSIVE DATABASE FIX
-- This addresses ALL the issues identified in the logs

-- =====================================================
-- PROBLEM 1: Fix missing columns in owner_keys table
-- =====================================================

-- Add missing expires_at column if it doesn't exist
ALTER TABLE owner_keys 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Add missing is_revoked column if it doesn't exist (already done but checking)
ALTER TABLE owner_keys 
ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT FALSE;

-- Update any NULL expires_at values to far future (30 days from now)
UPDATE owner_keys 
SET expires_at = NOW() + INTERVAL '30 days' 
WHERE expires_at IS NULL;

-- =====================================================
-- PROBLEM 2: Fix infinite recursion by disabling RLS temporarily
-- =====================================================

-- Disable RLS completely to stop the recursion
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE owner_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE licenses DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- PROBLEM 3: Create simple, non-recursive RLS policies
-- =====================================================

-- Re-enable RLS with simple policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Simple policy for users table - no self-references
CREATE POLICY "Simple users policy" ON users
    FOR SELECT USING (
        auth.uid() = id OR 
        auth.jwt()->>'email' = 'shadek392@gmail.com'
    );

-- Enable RLS on owner_keys
ALTER TABLE owner_keys ENABLE ROW LEVEL SECURITY;

-- Simple policy for owner_keys - no complex queries
CREATE POLICY "Simple owner_keys policy" ON owner_keys
    FOR ALL USING (
        auth.jwt()->>'email' = 'shadek392@gmail.com'
    );

-- Enable RLS on licenses
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

-- Simple policy for licenses
CREATE POLICY "Simple licenses policy" ON licenses
    FOR SELECT USING (
        auth.uid() = user_id OR
        auth.jwt()->>'email' = 'shadek392@gmail.com'
    );

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Test that the columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'owner_keys' 
  AND column_name IN ('expires_at', 'is_revoked');

-- Test that policies exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('users', 'owner_keys', 'licenses');
