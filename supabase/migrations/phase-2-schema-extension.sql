-- =====================================================
-- PHASE 2: SCHEMA EXTENSION (NEW STRUCTURE)
-- =====================================================
-- KEEP FRONTEND AS IS - This only extends the database schema
-- 
-- GOAL: Create the new three-layer architecture
--         Canonical Document → Projection Tables → RPC Layer
-- =====================================================

-- =====================================================
-- 1. EXTEND PROJECTS TABLE (Canonical Document Storage)
-- =====================================================

-- Add new columns to projects table for canonical document storage
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS world_document JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS cover_config JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.projects.world_document IS 
'Canonical JSON document containing all project state: assets, tags, backgrounds, custom fields, viewport state';

COMMENT ON COLUMN public.projects.version IS 
'Optimistic locking version for conflict detection. Incremented on each save. Client must provide expected version.';

COMMENT ON COLUMN public.projects.cover_config IS 
'Book cover configuration: color, image, layout settings stored as JSONB';

-- =====================================================
-- 2. CREATE ASSETS_INDEX TABLE (Query Projection)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.assets_index (
    asset_id TEXT PRIMARY KEY,
    
    project_id UUID NOT NULL
    REFERENCES public.projects(id)
    ON DELETE CASCADE,
    
    parent_asset_id TEXT,
    
    -- Hierarchy path for fast tree traversal
    -- Format: root.assetA.assetB (simple string path)
    -- NOTE: For scaling to 10k+ assets, consider migrating to ltree extension
    path TEXT NOT NULL DEFAULT '',
    
    -- Asset metadata
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    
    -- Position data
    x INTEGER DEFAULT 0,
    y INTEGER DEFAULT 0,
    width INTEGER DEFAULT 200,
    height INTEGER DEFAULT 200,
    z_index INTEGER DEFAULT 0,
    
    -- UI state
    is_expanded BOOLEAN DEFAULT true,
    
    -- Configuration
    background_config JSONB DEFAULT '{}',
    viewport_config JSONB DEFAULT '{}',
    
    -- Cloud sync status
    cloud_status TEXT DEFAULT 'local' 
        CHECK (cloud_status IN ('local', 'uploading', 'synced', 'failed')),
    cloud_path TEXT,
    cloud_error TEXT,
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add table comment
COMMENT ON TABLE public.assets_index IS 
'Query projection table derived from projects.world_document. Disposable - can be rebuilt from canonical document.';

-- =====================================================
-- 3. CREATE FILES TABLE (R2 File Registry)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    project_id UUID NOT NULL
    REFERENCES public.projects(id)
    ON DELETE CASCADE,
    
    asset_id TEXT
    REFERENCES public.assets_index(asset_id)
    ON DELETE SET NULL,
    
    -- R2 storage reference
    r2_key TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    
    -- Image variants (thumbnails, optimized versions, etc.)
    -- Format: [{width: 100, height: 100, r2_key: "...", url: "..."}]
    variants JSONB DEFAULT '[]',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.files IS 
'Cloudflare R2 file registry. Tracks all uploaded files separately from asset metadata.';

-- =====================================================
-- 4. OPTIONAL: ASSET CUSTOM FIELDS INDEX
-- =====================================================
-- NOTE: This table is OPTIONAL for MVP
-- For MVP, custom fields can stay in world_document only
-- Create this index only if you need to query custom fields efficiently
-- (e.g., "find all assets with HP > 50")

CREATE TABLE IF NOT EXISTS public.asset_custom_fields_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id TEXT NOT NULL
    REFERENCES public.assets_index(asset_id)
    ON DELETE CASCADE,
    
    field_id TEXT NOT NULL,
    field_type TEXT NOT NULL,
    field_label TEXT,
    
    -- Value storage (type-specific columns for indexing)
    value_text TEXT,
    value_number NUMERIC,
    value_boolean BOOLEAN,
    value_json JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(asset_id, field_id)
);

COMMENT ON TABLE public.asset_custom_fields_index IS 
'OPTIONAL: Queryable index for custom fields. Only needed if querying by field values (e.g., HP > 50). For MVP, fields can stay in world_document only.';

-- =====================================================
-- 5. CREATE REQUIRED INDEXES
-- =====================================================

-- Fast viewport queries: load assets by project + parent
CREATE INDEX IF NOT EXISTS idx_assets_project_parent 
ON public.assets_index(project_id, parent_asset_id);

-- Hierarchy traversal: find all descendants/ancestors
CREATE INDEX IF NOT EXISTS idx_assets_path 
ON public.assets_index(project_id, path);

-- Cloud sync status queries: find assets needing sync
CREATE INDEX IF NOT EXISTS idx_assets_cloud_status 
ON public.assets_index(project_id, cloud_status) 
WHERE cloud_status != 'synced';

-- Name search for filtering
CREATE INDEX IF NOT EXISTS idx_assets_name 
ON public.assets_index(project_id, name);

-- Type filtering
CREATE INDEX IF NOT EXISTS idx_assets_type 
ON public.assets_index(project_id, type);

-- Z-index ordering
CREATE INDEX IF NOT EXISTS idx_assets_z_index 
ON public.assets_index(project_id, z_index);

-- File lookups by project
CREATE INDEX IF NOT EXISTS idx_files_project 
ON public.files(project_id, asset_id);

-- File lookups by R2 key (for cleanup operations)
CREATE INDEX IF NOT EXISTS idx_files_r2_key 
ON public.files(r2_key);

-- Custom fields lookups
CREATE INDEX IF NOT EXISTS idx_custom_fields_asset 
ON public.asset_custom_fields_index(asset_id, field_id);

-- GIN index for JSONB queries on world_document (if needed)
CREATE INDEX IF NOT EXISTS idx_projects_world_document 
ON public.projects USING GIN (world_document);

-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE public.assets_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_custom_fields_index ENABLE ROW LEVEL SECURITY;

-- Ensure projects has RLS enabled
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. RLS POLICIES (Read-Only for client, RPC does writes)
-- =====================================================

-- Users can read their own project's assets
DROP POLICY IF EXISTS "Users can read their project assets" ON public.assets_index;
CREATE POLICY "Users can read their project assets" 
ON public.assets_index
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.projects 
        WHERE projects.id = assets_index.project_id 
        AND projects.user_id = auth.uid()
    )
);

-- Users can read their own files
DROP POLICY IF EXISTS "Users can read their project files" ON public.files;
CREATE POLICY "Users can read their project files" 
ON public.files
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.projects 
        WHERE projects.id = files.project_id 
        AND projects.user_id = auth.uid()
    )
);

-- Custom fields read policy
DROP POLICY IF EXISTS "Users can read custom fields" ON public.asset_custom_fields_index;
CREATE POLICY "Users can read custom fields" 
ON public.asset_custom_fields_index
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.projects 
        JOIN public.assets_index ON assets_index.project_id = projects.id
        WHERE assets_index.asset_id = asset_custom_fields_index.asset_id
        AND projects.user_id = auth.uid()
    )
);

-- =====================================================
-- 8. PROJECTS RLS POLICIES
-- =====================================================

-- AGGRESSIVE CLEANUP: Drop ALL legacy policies (various naming patterns)
-- These are from the old direct-write architecture - we now use RPC-only writes
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
-- Legacy underscore-named policies
DROP POLICY IF EXISTS "projects_delete_own" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_own" ON public.projects;
DROP POLICY IF EXISTS "projects_select_own" ON public.projects;
DROP POLICY IF EXISTS "projects_update_own" ON public.projects;
-- Any other patterns
DROP POLICY IF EXISTS "projects_delete_policy" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_policy" ON public.projects;
DROP POLICY IF EXISTS "projects_select_policy" ON public.projects;
DROP POLICY IF EXISTS "projects_update_policy" ON public.projects;

-- Allow users to view their own projects (READ-ONLY)
CREATE POLICY "Users can view their own projects" 
ON public.projects
FOR SELECT
USING (user_id = auth.uid());

-- NOTE: All writes (INSERT, UPDATE, DELETE) go through RPC only
-- No direct table policies for writes - RPC functions bypass RLS using SECURITY DEFINER

-- =====================================================
-- 9. CREATE TRIGGER FUNCTION FOR UPDATED_AT
-- =====================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to assets_index
DROP TRIGGER IF EXISTS update_assets_index_updated_at ON public.assets_index;
CREATE TRIGGER update_assets_index_updated_at
    BEFORE UPDATE ON public.assets_index
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Apply trigger to files
DROP TRIGGER IF EXISTS update_files_updated_at ON public.files;
CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON public.files
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Apply trigger to asset_custom_fields_index
DROP TRIGGER IF EXISTS update_custom_fields_updated_at ON public.asset_custom_fields_index;
CREATE TRIGGER update_custom_fields_updated_at
    BEFORE UPDATE ON public.asset_custom_fields_index
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 10. VERIFICATION QUERIES
-- =====================================================

-- Verify new columns on projects table
SELECT 'PROJECTS TABLE COLUMNS' as check_type, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'projects'
AND column_name IN ('world_document', 'version', 'cover_config', 'description')
ORDER BY ordinal_position;

-- Verify new tables exist
SELECT 'NEW TABLES' as check_type, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('assets_index', 'files', 'asset_custom_fields_index')
ORDER BY table_name;

-- Verify indexes were created
SELECT 'NEW INDEXES' as check_type, indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_assets_%' OR indexname LIKE 'idx_files_%' OR indexname LIKE 'idx_custom_fields_%' OR indexname LIKE 'idx_projects_world%'
ORDER BY tablename, indexname;

-- Verify RLS is enabled
SELECT 'RLS STATUS' as check_type, tablename, rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('projects', 'assets_index', 'files', 'asset_custom_fields_index');

-- Count RLS policies per table
SELECT 'RLS POLICIES' as check_type, tablename, count(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('projects', 'assets_index', 'files', 'asset_custom_fields_index')
GROUP BY tablename;

-- =====================================================
-- PHASE 2 COMPLETE
-- =====================================================
-- Next step: Run Phase 3 to create RPC functions
-- File: phase-3-rpc-functions.sql
-- =====================================================

-- NOTES / RESEARCH DECISIONS:
-- ==========================
-- 1. PATH COLUMN (ltree vs string):
--    - DECISION: Using simple string path (root.assetA.assetB)
--    - REASON: Simpler for MVP, no extension required
--    - MIGRATION PATH: If scaling to 10k+ assets with complex tree queries,
--      migrate to ltree: ALTER TABLE assets_index ALTER COLUMN path TYPE ltree;
--    - Requires: CREATE EXTENSION IF NOT EXISTS ltree;
--
-- 2. CUSTOM FIELDS INDEX TABLE:
--    - DECISION: Created but marked as OPTIONAL
--    - REASON: For MVP, custom fields can stay in world_document only
--    - USAGE: Only populate if you need queries like "HP > 50" or "Type = 'Fire'"
--    - Otherwise: Skip this table and query world_document directly
--
-- 3. WRITE OPERATIONS:
--    - All writes go through RPC functions (Phase 3)
--    - No direct INSERT/UPDATE/DELETE policies on tables
--    - RPC functions use SECURITY DEFINER to bypass RLS
--
-- 4. INDEX STRATEGY:
--    - Focused on viewport queries (project_id + parent_asset_id)
--    - Added path index for tree traversal
--    - Added cloud_status partial index (excludes 'synced' for efficiency)
--    - GIN index on world_document for flexible JSON queries
