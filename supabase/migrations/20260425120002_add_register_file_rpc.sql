-- =====================================================
-- ADD REGISTER FILE RPC - Phase 5 Addition
-- Low-I/O Backend Architecture
-- =====================================================
-- This migration adds register_file RPC function for R2 uploads
-- Replaces create_file which was for Supabase Storage
-- =====================================================

-- Function: register_file
-- Registers file metadata after successful R2 upload
-- Includes quota tracking via register_file_upload_complete
CREATE OR REPLACE FUNCTION register_file(
  p_project_id UUID,
  p_asset_id TEXT,
  p_r2_key TEXT,
  p_size_bytes BIGINT,
  p_mime_type TEXT,
  p_variants JSONB DEFAULT '[]'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_file_id UUID;
  v_user_id UUID;
BEGIN
  SET search_path = public;

  -- Validate project ownership
  SELECT user_id INTO v_user_id
  FROM projects
  WHERE id = p_project_id
  AND user_id = auth.uid()
  AND deleted_at IS NULL
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Project not found or unauthorized';
  END IF;

  -- Insert or update file record
  -- Note: Using storage_key column for R2 key (naming compatibility)
  INSERT INTO files (project_id, asset_id, storage_key, mime_type, size_bytes)
  VALUES (p_project_id, p_asset_id, p_r2_key, p_mime_type, p_size_bytes)
  ON CONFLICT (project_id, asset_id)
  DO UPDATE SET
    storage_key = EXCLUDED.storage_key,
    mime_type = EXCLUDED.mime_type,
    size_bytes = EXCLUDED.size_bytes;

  -- Update asset custom_fields with variants if provided
  IF p_variants IS NOT NULL AND jsonb_array_length(p_variants) > 0 THEN
    UPDATE assets
    SET
      custom_fields = jsonb_set(
        COALESCE(custom_fields, '{}'::jsonb),
        '{variants}',
        p_variants
      )
    WHERE project_id = p_project_id
    AND asset_id = p_asset_id;
  END IF;

  -- Commit quota tracking (atomically: commit pending bytes + increment asset count)
  -- This uses the optimized register_file_upload_complete function
  PERFORM register_file_upload_complete(v_user_id, p_size_bytes);

  RETURN TRUE;
END;
$$;

-- =====================================================
-- SETUP COMPLETE
-- =====================================================
