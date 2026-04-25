-- =====================================================
-- ADD UPDATE CLOUD STATUS RPC - Phase 5 Addition
-- Low-I/O Backend Architecture
-- =====================================================
-- This migration adds update_cloud_status RPC function
-- Required for R2 upload state tracking
-- =====================================================

-- Function: update_cloud_status
-- Updates cloud status for an asset (local, uploading, synced, failed)
-- Called by frontend after upload success/failure
CREATE OR REPLACE FUNCTION update_cloud_status(
  p_asset_id TEXT,
  p_status TEXT,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  SET search_path = public;

  -- Get project_id from asset for ownership check
  SELECT project_id INTO v_project_id
  FROM assets
  WHERE asset_id = p_asset_id
  AND deleted_at IS NULL
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Asset not found';
  END IF;

  -- Validate ownership via project
  IF NOT EXISTS (
    SELECT 1 FROM projects
    WHERE id = v_project_id
    AND user_id = auth.uid()
    AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Update cloud status
  -- CRITICAL: Do NOT update updated_at to enable HOT updates
  -- This is a status field that changes frequently during uploads
  UPDATE assets
  SET
    cloud_status = p_status,
    cloud_error = p_error
  WHERE asset_id = p_asset_id
  AND project_id = v_project_id;
END;
$$;

-- =====================================================
-- SETUP COMPLETE
-- =====================================================
