-- =====================================================
-- SUPABASE DISK IO OPTIMIZATION - SIMPLE VERSION
-- =====================================================
-- Run this in your Supabase SQL Editor to fix Disk IO issues
-- This version avoids CONCURRENTLY which can cause transaction errors

-- 1. CREATE CRITICAL INDEXES (Fixes Sequential Scans)
-- =====================================================

-- Projects table indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_id_user_id ON projects(id, user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at);

-- Assets table indexes  
CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_id_user_id ON assets(id, user_id);
CREATE INDEX IF NOT EXISTS idx_assets_project_id ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(file_type);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_assets_user_project ON assets(user_id, project_id);

-- 2. UPDATE TABLE STATISTICS
-- =====================================================

-- Update table statistics for better query planning
ANALYZE projects;
ANALYZE assets;

-- 3. VERIFY INDEX CREATION
-- =====================================================

-- Check that indexes were created successfully
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename IN ('projects', 'assets')
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- 4. PERFORMANCE TEST (Optional)
-- =====================================================

-- Test query performance (replace with actual user_id)
EXPLAIN (ANALYZE, BUFFERS) 
SELECT id, name, description, updated_at 
FROM projects 
WHERE user_id = 'test-user-id'
LIMIT 1;

EXPLAIN (ANALYZE, BUFFERS)
SELECT metadata 
FROM assets 
WHERE user_id = 'test-user-id' AND id = 'test-asset-id'
LIMIT 1;
