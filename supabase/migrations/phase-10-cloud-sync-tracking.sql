-- =====================================================
-- PHASE 10: CLOUD SYNC TRACKING
-- =====================================================
-- KEEP FRONTEND AS IS - Backend-only changes
-- 
-- GOAL: Robust cloud upload status tracking with retry support
-- =====================================================

-- =====================================================
-- 1. UPDATE CLOUD STATUS FUNCTION
-- =====================================================
-- Updates cloud sync status for an asset
-- Called by frontend after upload attempts (success or failure)
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_cloud_status(
    p_asset_id TEXT,
    p_status TEXT,
    p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate status value
    IF p_status NOT IN ('local', 'uploading', 'synced', 'failed') THEN
        RAISE EXCEPTION 'Invalid cloud_status: %. Must be one of: local, uploading, synced, failed', p_status;
    END IF;
    
    -- Update cloud status with ownership verification
    UPDATE public.assets_index
    SET cloud_status = p_status,
        cloud_error = CASE 
            WHEN p_status = 'failed' THEN p_error 
            ELSE NULL  -- Clear error on successful status
        END,
        updated_at = NOW()
    WHERE asset_id = p_asset_id
    AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = assets_index.project_id
        AND p.user_id = auth.uid()
    );
    
    -- Check if update happened
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asset not found or access denied';
    END IF;
END;
$$;

COMMENT ON FUNCTION public.update_cloud_status(TEXT, TEXT, TEXT) IS 
'Update cloud sync status for an asset. Status: local, uploading, synced, failed. Clears error on successful statuses.';

-- =====================================================
-- 2. GET SYNC QUEUE FOR RETRY
-- =====================================================
-- Returns assets that need cloud sync retry
-- Includes both failed uploads and currently uploading assets
-- Used by retry mechanism to find work to do
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_sync_queue(
    p_project_id UUID,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    asset_id TEXT,
    name TEXT,
    cloud_status TEXT,
    cloud_error TEXT,
    retry_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate limit
    IF p_limit < 1 OR p_limit > 500 THEN
        p_limit := 50;  -- Default to safe value
    END IF;
    
    RETURN QUERY
    SELECT 
        ai.asset_id,
        ai.name,
        ai.cloud_status,
        ai.cloud_error,
        0::INTEGER as retry_count  -- Retry count tracked in application layer
    FROM public.assets_index ai
    WHERE ai.project_id = p_project_id
    AND ai.cloud_status IN ('failed', 'uploading')
    AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = p_project_id
        AND p.user_id = auth.uid()
    )
    ORDER BY 
        -- Failed items first (higher priority), then by update time (oldest first)
        CASE ai.cloud_status 
            WHEN 'failed' THEN 0 
            WHEN 'uploading' THEN 1 
        END,
        ai.updated_at ASC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_sync_queue(UUID, INTEGER) IS 
'Get queue of assets needing cloud sync retry. Returns failed and uploading assets ordered by priority.';

-- =====================================================
-- 3. GET UPLOADS BY STATUS
-- =====================================================
-- Flexible function to query uploads by specific status
-- Used for monitoring and manual retry UI
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_uploads_by_status(
    p_project_id UUID,
    p_status TEXT,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    asset_id TEXT,
    name TEXT,
    type TEXT,
    cloud_status TEXT,
    cloud_error TEXT,
    updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate status
    IF p_status NOT IN ('local', 'uploading', 'synced', 'failed') THEN
        RAISE EXCEPTION 'Invalid status: %. Must be one of: local, uploading, synced, failed', p_status;
    END IF;
    
    -- Validate limit
    IF p_limit < 1 OR p_limit > 500 THEN
        p_limit := 100;
    END IF;
    
    RETURN QUERY
    SELECT 
        ai.asset_id,
        ai.name,
        ai.type,
        ai.cloud_status,
        ai.cloud_error,
        ai.updated_at
    FROM public.assets_index ai
    WHERE ai.project_id = p_project_id
    AND ai.cloud_status = p_status
    AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = p_project_id
        AND p.user_id = auth.uid()
    )
    ORDER BY ai.updated_at DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_uploads_by_status(UUID, TEXT, INTEGER) IS 
'Get all assets with a specific cloud status. Useful for monitoring and manual retry UI.';

-- =====================================================
-- 4. GET CLOUD SYNC SUMMARY
-- =====================================================
-- Returns summary statistics of cloud sync status for a project
-- Useful for dashboard/status indicators
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_cloud_sync_summary(
    p_project_id UUID
)
RETURNS TABLE (
    total_assets BIGINT,
    local_count BIGINT,
    uploading_count BIGINT,
    synced_count BIGINT,
    failed_count BIGINT,
    last_failed_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_assets,
        COUNT(*) FILTER (WHERE ai.cloud_status = 'local')::BIGINT as local_count,
        COUNT(*) FILTER (WHERE ai.cloud_status = 'uploading')::BIGINT as uploading_count,
        COUNT(*) FILTER (WHERE ai.cloud_status = 'synced')::BIGINT as synced_count,
        COUNT(*) FILTER (WHERE ai.cloud_status = 'failed')::BIGINT as failed_count,
        MAX(ai.updated_at) FILTER (WHERE ai.cloud_status = 'failed') as last_failed_at
    FROM public.assets_index ai
    WHERE ai.project_id = p_project_id
    AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = p_project_id
        AND p.user_id = auth.uid()
    );
END;
$$;

COMMENT ON FUNCTION public.get_cloud_sync_summary(UUID) IS 
'Get summary statistics of cloud sync status for a project. Useful for status indicators.';

-- =====================================================
-- 5. BULK UPDATE CLOUD STATUS
-- =====================================================
-- Update cloud status for multiple assets at once
-- Used when bulk operations complete (e.g., batch upload finish)
-- =====================================================
CREATE OR REPLACE FUNCTION public.bulk_update_cloud_status(
    p_project_id UUID,
    p_asset_ids TEXT[],
    p_status TEXT,
    p_error TEXT DEFAULT NULL
)
RETURNS INTEGER  -- Number of assets updated
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_count INTEGER := 0;
BEGIN
    -- Validate status
    IF p_status NOT IN ('local', 'uploading', 'synced', 'failed') THEN
        RAISE EXCEPTION 'Invalid cloud_status: %. Must be one of: local, uploading, synced, failed', p_status;
    END IF;
    
    -- Limit batch size
    IF array_length(p_asset_ids, 1) > 100 THEN
        RAISE EXCEPTION 'Batch size exceeds maximum of 100';
    END IF;
    
    UPDATE public.assets_index
    SET cloud_status = p_status,
        cloud_error = CASE 
            WHEN p_status = 'failed' THEN p_error 
            ELSE NULL
        END,
        updated_at = NOW()
    WHERE asset_id = ANY(p_asset_ids)
    AND project_id = p_project_id
    AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = p_project_id
        AND p.user_id = auth.uid()
    );
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    RETURN v_updated_count;
END;
$$;

COMMENT ON FUNCTION public.bulk_update_cloud_status(UUID, TEXT[], TEXT, TEXT) IS 
'Bulk update cloud status for multiple assets. Max 100 per call. Returns count of updated assets.';

-- =====================================================
-- GRANT EXECUTE PERMISSIONS
-- =====================================================
GRANT EXECUTE ON FUNCTION public.update_cloud_status(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sync_queue(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_uploads_by_status(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cloud_sync_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_cloud_status(UUID, TEXT[], TEXT, TEXT) TO authenticated;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these after migration to verify everything worked
-- =====================================================

-- 1. Verify all functions exist
-- Should return 5 rows (one for each function)
SELECT 
    p.proname AS function_name,
    pg_get_function_result(p.oid) AS return_type,
    pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN (
    'update_cloud_status',
    'get_sync_queue',
    'get_uploads_by_status',
    'get_cloud_sync_summary',
    'bulk_update_cloud_status'
)
ORDER BY p.proname;

-- 2. Verify cloud_status column exists in assets_index
-- Should return 1 row with cloud_status, cloud_path, cloud_error
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'assets_index'
AND column_name IN ('cloud_status', 'cloud_path', 'cloud_error')
ORDER BY column_name;

-- 3. Test cloud_status check constraint
-- Should show the valid values: local, uploading, synced, failed
SELECT conname AS constraint_name, pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.assets_index'::regclass
AND conname LIKE '%cloud_status%';

-- 4. Verify index for cloud sync queries exists
-- Should show idx_assets_cloud_status or similar
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename = 'assets_index'
AND indexdef LIKE '%cloud_status%';
