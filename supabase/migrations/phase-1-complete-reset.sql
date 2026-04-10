-- =====================================================
-- PHASE 1: COMPLETE DATABASE RESET
-- =====================================================
-- Run this in Supabase SQL Editor to wipe everything
-- WARNING: IRREVERSIBLE DATA LOSS - PROCEED WITH CAUTION
-- 
-- BEFORE RUNNING:
-- 1. Backup any data you want to keep
-- 2. Verify R2 bucket is accessible
-- 3. Inform users of maintenance window
-- 4. Test on staging first
-- =====================================================

-- =====================================================
-- 0. PRE-RESET VERIFICATION (Run first to see what exists)
-- =====================================================

-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- List all functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- List all indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- =====================================================
-- 1. DROP ALL TRIGGERS FIRST (before functions they depend on)
-- =====================================================

-- Drop all triggers that depend on update_updated_at_column()
DROP TRIGGER IF EXISTS trigger_sync_assets_index ON public.projects;
DROP TRIGGER IF EXISTS trigger_update_updated_at ON public.projects;
DROP TRIGGER IF EXISTS trigger_update_updated_at ON public.assets;
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
DROP TRIGGER IF EXISTS update_assets_updated_at ON public.assets;
DROP TRIGGER IF EXISTS update_storage_usage_updated_at ON public.storage_usage;
DROP TRIGGER IF EXISTS update_licenses_updated_at ON public.licenses;
DROP TRIGGER IF EXISTS update_owner_keys_updated_at ON public.owner_keys;
DROP TRIGGER IF EXISTS update_purchases_updated_at ON public.purchases;
DROP TRIGGER IF EXISTS update_books_updated_at ON public.books;
DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON public.user_preferences;
DROP TRIGGER IF EXISTS update_promo_codes_updated_at ON public.promo_codes;
DROP TRIGGER IF EXISTS update_admin_actions_updated_at ON public.admin_actions;

-- =====================================================
-- 2. DROP ALL VIEWS
-- =====================================================

DROP VIEW IF EXISTS public.user_projects_optimized;
DROP VIEW IF EXISTS public.user_assets_optimized;

-- =====================================================
-- 3. DROP ALL TABLES (CASCADE to remove dependencies)
-- =====================================================

-- New architecture tables (if they exist from partial setup)
DROP TABLE IF EXISTS public.asset_custom_fields_index CASCADE;
DROP TABLE IF EXISTS public.asset_tags CASCADE;
DROP TABLE IF EXISTS public.tags CASCADE;
DROP TABLE IF EXISTS public.files CASCADE;
DROP TABLE IF EXISTS public.assets_index CASCADE;

-- Legacy tables
DROP TABLE IF EXISTS public.assets CASCADE;
DROP TABLE IF EXISTS public.storage_usage CASCADE;
DROP TABLE IF EXISTS public.pending_uploads CASCADE;
DROP TABLE IF EXISTS public.books CASCADE;
DROP TABLE IF EXISTS public.purchases CASCADE;
DROP TABLE IF EXISTS public.user_preferences CASCADE;
DROP TABLE IF EXISTS public.promo_codes CASCADE;
DROP TABLE IF EXISTS public.admin_actions CASCADE;

-- =====================================================
-- 4. DROP ALL RPC FUNCTIONS (after tables they might reference)
-- =====================================================

-- Document mutation functions
DROP FUNCTION IF EXISTS public.load_project_document(UUID);
DROP FUNCTION IF EXISTS public.save_document_operations(UUID, INTEGER, JSONB);
DROP FUNCTION IF EXISTS public.query_assets_by_parent(UUID, TEXT);
DROP FUNCTION IF EXISTS public.register_file(UUID, TEXT, TEXT, BIGINT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.get_failed_uploads(UUID);
DROP FUNCTION IF EXISTS public.get_project_stats(UUID);

-- Legacy storage/billing RPCs
DROP FUNCTION IF EXISTS public.increment_pending_bytes(TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.commit_pending_bytes(TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.rollback_pending_bytes(TEXT, BIGINT);

-- Legacy edge function wrappers (if any were created as SQL functions)
DROP FUNCTION IF EXISTS public.get_upload_urls(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.register_asset(TEXT, UUID, JSONB);
DROP FUNCTION IF EXISTS public.import_project(TEXT, JSONB);
DROP FUNCTION IF EXISTS public.export_project(UUID);

-- =====================================================
-- 5. DROP TRIGGER FUNCTIONS (after all triggers removed)
-- =====================================================

DROP FUNCTION IF EXISTS public.sync_assets_index();
DROP FUNCTION IF EXISTS public.update_updated_at_column();

-- =====================================================
-- 5. RESET PROJECTS TABLE (Keep structure, remove data)
-- =====================================================

-- First, check if projects table exists and what columns it has
DO $$
DECLARE
    col_record RECORD;
BEGIN
    -- Remove columns that shouldn't exist in clean state
    -- (except world_document, version, cover_config which we'll add in Phase 2)
    
    -- Check and drop old JSON columns if they exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'world_document'
    ) THEN
        ALTER TABLE public.projects DROP COLUMN IF EXISTS world_document;
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'version'
    ) THEN
        ALTER TABLE public.projects DROP COLUMN IF EXISTS version;
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'cover_config'
    ) THEN
        ALTER TABLE public.projects DROP COLUMN IF EXISTS cover_config;
    END IF;
    
    -- Reset description column to empty text (was previously used for JSON)
    UPDATE public.projects SET description = NULL WHERE description IS NOT NULL;
    
    RAISE NOTICE 'Projects table columns cleaned';
END $$;

-- Truncate all project data (CASCADE removes dependent foreign keys)
-- NOTE: This deletes ALL projects. Comment out if you want to keep projects.
TRUNCATE TABLE public.projects CASCADE;

-- =====================================================
-- 6. DROP ALL CUSTOM INDEXES
-- =====================================================

-- New architecture indexes
DROP INDEX IF EXISTS idx_assets_project_parent;
DROP INDEX IF EXISTS idx_assets_path;
DROP INDEX IF EXISTS idx_assets_cloud_status;
DROP INDEX IF EXISTS idx_files_project;
DROP INDEX IF EXISTS idx_files_asset;
DROP INDEX IF EXISTS idx_files_r2_key;
DROP INDEX IF EXISTS idx_custom_fields_asset;

-- Legacy indexes (from database-optimization.sql)
DROP INDEX IF EXISTS idx_projects_user_id;
DROP INDEX IF EXISTS idx_projects_id_user_id;
DROP INDEX IF EXISTS idx_projects_updated_at;
DROP INDEX IF EXISTS idx_projects_user_updated;
DROP INDEX IF EXISTS idx_assets_user_id;
DROP INDEX IF EXISTS idx_assets_id_user_id;
DROP INDEX IF EXISTS idx_assets_project_id;
DROP INDEX IF EXISTS idx_assets_type;
DROP INDEX IF EXISTS idx_assets_metadata_type;
DROP INDEX IF EXISTS idx_assets_user_project;
DROP INDEX IF EXISTS idx_assets_user_type;
DROP INDEX IF EXISTS idx_users_plan_type;
DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_licenses_user_status;
DROP INDEX IF EXISTS idx_licenses_active;
DROP INDEX IF EXISTS idx_owner_keys_user_valid;

-- =====================================================
-- 7. CLEANUP RLS POLICIES ON PROJECTS TABLE
-- =====================================================

-- Drop all existing policies on projects
DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can create their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can read their project assets" ON public.projects;
DROP POLICY IF EXISTS "Users can read their project files" ON public.projects;
DROP POLICY IF EXISTS "Users can read custom fields" ON public.projects;
DROP POLICY IF EXISTS "Allow authenticated users to create projects" ON public.projects;
DROP POLICY IF EXISTS "Allow users to delete their own projects" ON public.projects;
DROP POLICY IF EXISTS "Allow users to update their own projects" ON public.projects;
DROP POLICY IF EXISTS "Allow users to view their own projects" ON public.projects;

-- Re-enable RLS (should already be enabled, but ensure it is)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 8. RESET SEQUENCES
-- =====================================================

-- Reset sequences if projects table uses serial/auto-increment
DO $$
DECLARE
    seq_name TEXT;
BEGIN
    -- Check if there's a sequence for projects.id
    SELECT pg_get_serial_sequence('projects', 'id') INTO seq_name;
    
    IF seq_name IS NOT NULL THEN
        EXECUTE format('SELECT setval(%L, 1, false)', seq_name);
        RAISE NOTICE 'Reset sequence %', seq_name;
    ELSE
        RAISE NOTICE 'No sequence found for projects.id (using UUIDs)';
    END IF;
END $$;


-- =====================================================
-- 10. POST-RESET VERIFICATION
-- =====================================================

-- Verify only essential tables remain
SELECT 'REMAINING TABLES' as check_type, table_name as name
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Verify no custom functions remain (should only show built-in)
SELECT 'REMAINING FUNCTIONS' as check_type, routine_name as name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name NOT LIKE 'pg_%'
AND routine_name NOT LIKE 'auth_%'
ORDER BY routine_name;

-- Verify no custom indexes on projects (except primary key)
SELECT 'REMAINING INDEXES' as check_type, indexname as name, tablename as table_name
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname NOT LIKE 'pg_%'
AND indexname NOT LIKE '%pkey%'
ORDER BY tablename, indexname;

-- =====================================================
-- 11. ESSENTIAL RLS POLICY (Minimal for Phase 1)
-- =====================================================

-- Create basic read policy for projects
CREATE POLICY "Users can view their own projects" 
ON public.projects
FOR SELECT
USING (user_id = auth.uid());

