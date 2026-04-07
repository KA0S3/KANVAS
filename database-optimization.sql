-- =====================================================
-- SUPABASE DISK IO OPTIMIZATION SCRIPT
-- =====================================================
-- Run this in your Supabase SQL Editor to fix Disk IO issues

-- 1. CREATE CRITICAL INDEXES (Fixes Sequential Scans)
-- =====================================================

-- Projects table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_id_user_id ON projects(id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_updated_at ON projects(updated_at);

-- Assets table indexes  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_user_id ON assets(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_id_user_id ON assets(id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_project_id ON assets(project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_type ON assets(file_type);

-- Composite index for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_user_project ON assets(user_id, project_id);

-- 2. ANALYZE QUERY PERFORMANCE
-- =====================================================

-- Check if your queries are using indexes (run this to verify)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) 
SELECT id, name, description, updated_at 
FROM projects 
WHERE user_id = 'your-user-id-here';

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT metadata 
FROM assets 
WHERE user_id = 'your-user-id-here' AND id = 'some-asset-id';

-- 3. OPTIMIZE RLS POLICIES (if you have them)
-- =====================================================

-- Example of efficient RLS policy (modify as needed)
-- CREATE POLICY "Users can view their own projects" ON projects
--   FOR SELECT USING (user_id = auth.uid());

-- CREATE POLICY "Users can update their own projects" ON projects  
--   FOR UPDATE USING (user_id = auth.uid());

-- CREATE POLICY "Users can insert their own projects" ON projects
--   FOR INSERT WITH CHECK (user_id = auth.uid());

-- 4. MONITORING QUERIES
-- =====================================================

-- Find slow queries (run this periodically)
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  rows
FROM pg_stat_statements 
WHERE query LIKE '%projects%' OR query LIKE '%assets%'
ORDER BY total_time DESC 
LIMIT 10;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('projects', 'assets')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 5. VACUUM AND ANALYZE (run monthly)
-- =====================================================

-- Update table statistics for better query planning
ANALYZE projects;
ANALYZE assets;

-- Clean up dead rows (run during low traffic)
-- VACUUM projects;
-- VACUUM assets;
