-- Check existing RLS status and policies
-- Run this in your Supabase SQL editor first to see what you already have

-- Check which tables have RLS enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN (
        'users', 'projects', 'assets', 'storage_usage', 
        'licenses', 'owner_keys', 'purchases', 'admin_actions'
    )
ORDER BY tablename;

-- Check existing policies
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
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check if the required stored procedures exist
SELECT 
    proname,
    prosrc
FROM pg_proc 
WHERE proname IN (
    'increment_pending_bytes', 
    'commit_pending_bytes', 
    'rollback_pending_bytes'
);

-- Check table structures to see if they match what the functions expect
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'storage_usage'
    AND table_schema = 'public'
ORDER BY ordinal_position;
