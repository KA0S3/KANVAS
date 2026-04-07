-- =====================================================
-- COMPREHENSIVE SUPABASE OPTIMIZATION FOR SYNC ISSUES
-- =====================================================
-- Run this in your Supabase SQL Editor to fix all performance issues
-- This includes the simple optimization plus additional sync-specific fixes

-- 1. CRITICAL INDEXES (Fixes Sequential Scans)
-- =====================================================

-- Projects table indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_id_user_id ON projects(id, user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at);
CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at DESC);

-- Assets table indexes  
CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_id_user_id ON assets(id, user_id);
CREATE INDEX IF NOT EXISTS idx_assets_project_id ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(file_type);
CREATE INDEX IF NOT EXISTS idx_assets_metadata_type ON assets USING GIN (metadata);

-- Composite indexes for common sync queries
CREATE INDEX IF NOT EXISTS idx_assets_user_project ON assets(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_assets_user_type ON assets(user_id, file_type);

-- Users table indexes for auth performance
CREATE INDEX IF NOT EXISTS idx_users_plan_type ON users(plan_type);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Licenses table indexes
CREATE INDEX IF NOT EXISTS idx_licenses_user_status ON licenses(user_id, status);
CREATE INDEX IF NOT EXISTS idx_licenses_active ON licenses(status, expires_at) WHERE status = 'active';

-- Owner keys table indexes
CREATE INDEX IF NOT EXISTS idx_owner_keys_user_valid ON owner_keys(user_id, is_revoked, expires_at);

-- 2. UPDATE TABLE STATISTICS
-- =====================================================

-- Update table statistics for better query planning
ANALYZE projects;
ANALYZE assets;
ANALYZE users;
ANALYZE licenses;
ANALYZE owner_keys;

-- 3. OPTIMIZE COMMON SYNC QUERIES
-- =====================================================

-- Create optimized view for user projects (used by loadAllBooksFromCloud)
CREATE OR REPLACE VIEW user_projects_optimized AS
SELECT 
    p.id,
    p.name,
    p.description,
    p.updated_at,
    p.user_id
FROM projects p
WHERE p.user_id IS NOT NULL
ORDER BY p.updated_at DESC;

-- Create optimized view for user assets (used by sync)
CREATE OR REPLACE VIEW user_assets_optimized AS
SELECT 
    a.id,
    a.user_id,
    a.project_id,
    a.name,
    a.file_type,
    a.metadata,
    a.updated_at
FROM assets a
WHERE a.user_id IS NOT NULL
ORDER BY a.updated_at DESC;

-- 4. PERFORMANCE IMPROVEMENTS
-- =====================================================

-- Set appropriate work_mem for better query performance
-- (Note: This may require superuser privileges)
-- SET work_mem = '256MB';

-- Enable parallel query processing for large tables
-- ALTER TABLE projects SET (parallel_workers = 4);
-- ALTER TABLE assets SET (parallel_workers = 4);

-- 5. CLEANUP AND MAINTENANCE
-- =====================================================

-- Remove any duplicate indexes that might exist
DO $$
DECLARE 
    idx_record RECORD;
BEGIN
    FOR idx_record IN 
        SELECT indexname, tablename 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname LIKE 'idx_%'
        GROUP BY indexname, tablename 
        HAVING COUNT(*) > 1
    LOOP
        -- Keep one instance of duplicate indexes
        EXECUTE 'DROP INDEX IF EXISTS ' || idx_record.indexname || '_duplicate';
    END LOOP;
END $$;

-- 6. VERIFICATION
-- =====================================================

-- Check that indexes were created successfully
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename IN ('projects', 'assets', 'users', 'licenses', 'owner_keys')
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- 7. PERFORMANCE TEST (Optional - replace with actual user_id)
-- =====================================================

-- Test query performance for sync operations
EXPLAIN (ANALYZE, BUFFERS) 
SELECT id, name, description, updated_at 
FROM projects 
WHERE user_id = 'test-user-id'
ORDER BY updated_at DESC;

EXPLAIN (ANALYZE, BUFFERS)
SELECT metadata 
FROM assets 
WHERE user_id = 'test-user-id' AND project_id = 'test-project-id'
ORDER BY updated_at DESC;

-- Test the optimized views
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM user_projects_optimized 
WHERE user_id = 'test-user-id';

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM user_assets_optimized 
WHERE user_id = 'test-user-id' AND project_id = 'test-project-id';

-- 8. MONITORING QUERIES
-- =====================================================

-- Query to monitor index usage (run periodically)
-- SELECT 
--     schemaname,
--     tablename,
--     indexname,
--     idx_scan,
--     idx_tup_read,
--     idx_tup_fetch
-- FROM pg_stat_user_indexes 
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;

-- =====================================================
-- OPTIMIZATION COMPLETE
-- =====================================================
