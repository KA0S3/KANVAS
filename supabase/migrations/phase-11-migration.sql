-- =====================================================
-- PHASE 11: MIGRATION FROM OLD DATA TO CANONICAL FORMAT
-- =====================================================
-- KEEP FRONTEND AS IS - This is a backend data migration
-- 
-- GOAL: Migrate existing projects.description JSON to world_document
-- 
-- IMPORTANT: 
-- - Run this AFTER all previous phases (1-10) are complete
-- - Test on staging first with production data dump
-- - Create backup before running in production
-- - This migration is IDEMPOTENT (safe to run multiple times)
-- =====================================================

-- =====================================================
-- 1. MIGRATE PROJECT DATA FUNCTION (SQL-side)
-- =====================================================
-- NOTE: rebuild_project_index is already defined in Phase 6
-- It returns TABLE (assets_rebuilt BIGINT, duration_ms BIGINT)
-- Alternative to TypeScript script - can be run directly in SQL

CREATE OR REPLACE FUNCTION public.migrate_project_to_canonical(
    p_project_id UUID,
    p_dry_run BOOLEAN DEFAULT true
)
RETURNS TABLE (
    project_id UUID,
    project_name TEXT,
    status TEXT,
    message TEXT,
    assets_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_project RECORD;
    v_old_data JSONB;
    v_world_document JSONB;
    v_assets_count INTEGER;
BEGIN
    -- Get project with old description data
    SELECT id, name, description, world_document
    INTO v_project
    FROM public.projects
    WHERE id = p_project_id;
    
    IF v_project IS NULL THEN
        RETURN QUERY SELECT 
            p_project_id, 
            NULL::TEXT, 
            'error'::TEXT, 
            'Project not found'::TEXT,
            0::INTEGER;
        RETURN;
    END IF;
    
    -- Skip if already has world_document with content
    IF v_project.world_document IS NOT NULL 
       AND jsonb_typeof(v_project.world_document) = 'object'
       AND (v_project.world_document->'assets') IS NOT NULL THEN
        RETURN QUERY SELECT 
            v_project.id, 
            v_project.name, 
            'skipped'::TEXT, 
            'Already has world_document'::TEXT,
            jsonb_object_keys_count(v_project.world_document->'assets');
        RETURN;
    END IF;
    
    -- Parse old description JSON
    BEGIN
        v_old_data := v_project.description::JSONB;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 
            v_project.id, 
            v_project.name, 
            'error'::TEXT, 
            'Invalid JSON in description: ' || SQLERRM::TEXT,
            0::INTEGER;
        RETURN;
    END;
    
    -- Build world_document
    v_world_document := jsonb_build_object(
        'assets', COALESCE(v_old_data->'assets', '{}'),
        'tags', COALESCE(v_old_data->'tags', '{}'),
        'globalCustomFields', COALESCE(v_old_data->'globalCustomFields', '[]'),
        'backgrounds', COALESCE(v_old_data->'backgrounds', '{}'),
        'viewport', COALESCE(v_old_data->'viewport', jsonb_build_object(
            'offset', jsonb_build_object('x', 0, 'y', 0),
            'scale', 1,
            'currentAssetId', NULL
        )),
        'version', 1
    );
    
    -- Count assets
    v_assets_count := jsonb_object_keys_count(v_world_document->'assets');
    
    -- Dry run - just report
    IF p_dry_run THEN
        RETURN QUERY SELECT 
            v_project.id, 
            v_project.name, 
            'dry_run'::TEXT, 
            format('Would migrate %s assets', v_assets_count)::TEXT,
            v_assets_count;
        RETURN;
    END IF;
    
    -- Perform migration
    UPDATE public.projects
    SET 
        world_document = v_world_document,
        version = 1
        -- NOTE: We keep description for rollback safety
        -- Clear it manually after verification: UPDATE projects SET description = NULL WHERE ...
    WHERE id = p_project_id;
    
    -- Rebuild index
    PERFORM public.rebuild_project_index(p_project_id);
    
    RETURN QUERY SELECT 
        v_project.id, 
        v_project.name, 
        'migrated'::TEXT, 
        format('Successfully migrated %s assets', v_assets_count)::TEXT,
        v_assets_count;
END;
$$;

-- Helper function to count JSONB object keys
-- NOTE: This is also defined in Phase 3 - must match signature (INTEGER)
CREATE OR REPLACE FUNCTION jsonb_object_keys_count(j JSONB)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT count(*)::INTEGER FROM jsonb_object_keys(COALESCE(j, '{}'));
$$;

COMMENT ON FUNCTION public.migrate_project_to_canonical(UUID, BOOLEAN) IS 
'Migrates a single project from description JSON to world_document. Set dry_run=false to execute.';

-- =====================================================
-- 2. BATCH MIGRATION FUNCTION
-- =====================================================
-- Migrate all projects at once

CREATE OR REPLACE FUNCTION public.migrate_all_projects_to_canonical(
    p_dry_run BOOLEAN DEFAULT true,
    p_limit INTEGER DEFAULT NULL
)
RETURNS TABLE (
    migrated BIGINT,
    skipped BIGINT,
    failed BIGINT,
    total BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_project RECORD;
    v_migrated BIGINT := 0;
    v_skipped BIGINT := 0;
    v_failed BIGINT := 0;
    v_total BIGINT := 0;
BEGIN
    -- Count total eligible projects
    SELECT count(*) INTO v_total
    FROM public.projects
    WHERE description IS NOT NULL;
    
    -- Process each project
    FOR v_project IN 
        SELECT id, name, description, world_document
        FROM public.projects
        WHERE description IS NOT NULL
        AND (p_limit IS NULL OR v_migrated + v_skipped + v_failed < p_limit)
    LOOP
        -- Skip if already migrated
        IF v_project.world_document IS NOT NULL 
           AND jsonb_typeof(v_project.world_document) = 'object'
           AND (v_project.world_document->'assets') IS NOT NULL THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;
        
        -- Try to migrate
        BEGIN
            IF NOT p_dry_run THEN
                PERFORM public.migrate_project_to_canonical(v_project.id, false);
            END IF;
            v_migrated := v_migrated + 1;
        EXCEPTION WHEN OTHERS THEN
            v_failed := v_failed + 1;
            RAISE WARNING 'Failed to migrate project %: %', v_project.id, SQLERRM;
        END;
    END LOOP;
    
    RETURN QUERY SELECT v_migrated, v_skipped, v_failed, v_total;
END;
$$;

COMMENT ON FUNCTION public.migrate_all_projects_to_canonical(BOOLEAN, INTEGER) IS 
'Migrates all projects from description to world_document. Use dry_run first!';

-- =====================================================
-- 3. ROLLBACK FUNCTION (Emergency use only)
-- =====================================================
-- Restore from world_document back to description

CREATE OR REPLACE FUNCTION public.rollback_project_from_canonical(
    p_project_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_doc JSONB;
BEGIN
    SELECT world_document INTO v_doc
    FROM public.projects
    WHERE id = p_project_id;
    
    IF v_doc IS NULL THEN
        RETURN false;
    END IF;
    
    -- Restore to description
    UPDATE public.projects
    SET 
        description = v_doc::TEXT,
        world_document = NULL,
        version = 1
    WHERE id = p_project_id;
    
    -- Clear index
    DELETE FROM public.assets_index WHERE project_id = p_project_id;
    
    RETURN true;
END;
$$;

COMMENT ON FUNCTION public.rollback_project_from_canonical(UUID) IS 
'Emergency rollback: restores project from world_document back to description. Use with caution.';

-- =====================================================
-- 4. VERIFICATION QUERIES
-- =====================================================

-- View: Check migration status
CREATE OR REPLACE VIEW public.migration_status AS
SELECT 
    p.id,
    p.name,
    p.user_id,
    CASE 
        WHEN p.world_document IS NULL OR jsonb_typeof(p.world_document) != 'object' THEN 'needs_migration'
        WHEN (p.world_document->'assets') IS NULL THEN 'incomplete'
        ELSE 'migrated'
    END as status,
    CASE 
        WHEN p.description IS NOT NULL THEN length(p.description)
        ELSE 0
    END as description_size,
    CASE 
        WHEN p.world_document IS NOT NULL THEN length(p.world_document::text)
        ELSE 0
    END as world_doc_size,
    COALESCE(jsonb_object_keys_count(p.world_document->'assets'), 0) as asset_count,
    (SELECT count(*) FROM public.assets_index WHERE project_id = p.id) as indexed_assets,
    p.updated_at
FROM public.projects p;

-- Grant access to authenticated users (read-only)
GRANT SELECT ON public.migration_status TO authenticated;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Check function was created
SELECT 'PHASE 11 FUNCTIONS' as check_type, 
       p.proname as function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN (
    'migrate_project_to_canonical',
    'migrate_all_projects_to_canonical',
    'rollback_project_from_canonical'
)
ORDER BY p.proname;

-- =====================================================
-- PHASE 11 COMPLETE
-- =====================================================
-- 
-- MIGRATION WORKFLOWS:
--
-- 1. DRY RUN (preview what will happen):
--    SELECT * FROM migrate_all_projects_to_canonical(true);
--
-- 2. MIGRATE SINGLE PROJECT:
--    SELECT * FROM migrate_project_to_canonical('project-uuid', false);
--
-- 3. MIGRATE ALL (execute):
--    SELECT * FROM migrate_all_projects_to_canonical(false);
--
-- 4. CHECK STATUS:
--    SELECT * FROM migration_status WHERE status != 'migrated';
--
-- 5. EMERGENCY ROLLBACK:
--    SELECT rollback_project_from_canonical('project-uuid');
--
-- 6. CLEAR OLD DATA (after verification):
--    UPDATE projects SET description = NULL WHERE world_document IS NOT NULL;
--
-- 7. REBUILD INDEX FOR PROJECT: (requires Phase 6)
--    SELECT rebuild_project_index('project-uuid');
--    Note: This function is defined in Phase 6, returns (assets_rebuilt, duration_ms)
--
