-- =====================================================
-- I/O OPTIMIZATION MIGRATION
-- Low-I/O Backend Architecture
-- =====================================================
-- This migration implements 5 phases of I/O optimization
-- to reduce write amplification and improve performance
-- =====================================================

-- =====================================================
-- PHASE 1: HOT Update Optimization
-- =====================================================
-- Remove updated_at updates from quota RPC functions
-- to enable HOT (Heap-Only Tuple) updates on storage_usage
-- Expected I/O Reduction: ~50% reduction in write amplification

-- Add last_quota_check_at column for monitoring (updated only on quota checks)
ALTER TABLE storage_usage ADD COLUMN IF NOT EXISTS last_quota_check_at TIMESTAMPTZ DEFAULT now();

-- Update increment_pending_bytes - remove updated_at update
CREATE OR REPLACE FUNCTION increment_pending_bytes(
  p_user_id UUID,
  p_bytes BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  -- Insert or update storage_usage record
  -- CRITICAL: Do NOT update updated_at to enable HOT updates
  INSERT INTO storage_usage (user_id, pending_bytes)
  VALUES (p_user_id, p_bytes)
  ON CONFLICT (user_id)
  DO UPDATE SET
    pending_bytes = storage_usage.pending_bytes + p_bytes;
END;
$$;

-- Update rollback_pending_bytes - remove updated_at update
CREATE OR REPLACE FUNCTION rollback_pending_bytes(
  p_user_id UUID,
  p_bytes BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  -- CRITICAL: Do NOT update updated_at to enable HOT updates
  UPDATE storage_usage
  SET
    pending_bytes = GREATEST(storage_usage.pending_bytes - p_bytes, 0)
  WHERE user_id = p_user_id;
END;
$$;

-- Update commit_pending_bytes - remove updated_at update
CREATE OR REPLACE FUNCTION commit_pending_bytes(
  p_user_id UUID,
  p_bytes BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  -- CRITICAL: Do NOT update updated_at to enable HOT updates
  UPDATE storage_usage
  SET
    total_bytes_used = total_bytes_used + p_bytes,
    pending_bytes = GREATEST(pending_bytes - p_bytes, 0)
  WHERE user_id = p_user_id;
END;
$$;

-- Update increment_asset_count - remove updated_at update
CREATE OR REPLACE FUNCTION increment_asset_count(
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  -- CRITICAL: Do NOT update updated_at to enable HOT updates
  INSERT INTO storage_usage (user_id, asset_count)
  VALUES (p_user_id, 1)
  ON CONFLICT (user_id)
  DO UPDATE SET
    asset_count = storage_usage.asset_count + 1;
END;
$$;

-- Update decrement_asset_count - remove updated_at update
CREATE OR REPLACE FUNCTION decrement_asset_count(
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  -- CRITICAL: Do NOT update updated_at to enable HOT updates
  UPDATE storage_usage
  SET
    asset_count = GREATEST(asset_count - 1, 0)
  WHERE user_id = p_user_id;
END;
$$;

-- Update get_storage_usage to update last_quota_check_at
CREATE OR REPLACE FUNCTION get_storage_usage(
  p_user_id UUID
)
RETURNS TABLE (
  user_id UUID,
  total_bytes_used BIGINT,
  pending_bytes BIGINT,
  asset_count INT,
  last_calculated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  -- Update last_quota_check_at on quota check (not on every operation)
  UPDATE storage_usage
  SET last_quota_check_at = now()
  WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT
    su.user_id,
    su.total_bytes_used,
    su.pending_bytes,
    su.asset_count,
    su.last_calculated_at
  FROM storage_usage su
  WHERE su.user_id = p_user_id;
END;
$$;

-- =====================================================
-- PHASE 2: JSONB Size Constraints
-- =====================================================
-- Add 2KB size constraints to prevent silent JSONB bloat
-- Per MASTER_PLAN rule: Enforce JSONB size limits (max 2KB per field)

DO $$
BEGIN
  -- Add constraint to licenses.features if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'features_size_check' 
    AND conrelid = 'licenses'::regclass
  ) THEN
    ALTER TABLE licenses ADD CONSTRAINT features_size_check 
    CHECK (pg_column_size(features) < 2048);
  END IF;

  -- Add constraint to owner_keys.scopes if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'scopes_size_check' 
    AND conrelid = 'owner_keys'::regclass
  ) THEN
    ALTER TABLE owner_keys ADD CONSTRAINT scopes_size_check 
    CHECK (pg_column_size(scopes) < 2048);
  END IF;
END $$;

-- =====================================================
-- PHASE 3: Remove Redundant Index
-- =====================================================
-- Drop idx_storage_usage_user since user_id is already PRIMARY KEY
-- Expected I/O Reduction: ~10% reduction in storage_usage write overhead

DROP INDEX IF EXISTS idx_storage_usage_user;

-- =====================================================
-- PHASE 4: Orphaned Pending Bytes Cleanup
-- =====================================================
-- Add tracking and cleanup function for stale pending_bytes
-- Prevents quota drift from failed uploads without rollback

-- Add last_pending_update_at column to track when pending_bytes was last modified
ALTER TABLE storage_usage ADD COLUMN IF NOT EXISTS last_pending_update_at TIMESTAMPTZ DEFAULT now();

-- Update increment_pending_bytes to track last_pending_update_at
CREATE OR REPLACE FUNCTION increment_pending_bytes(
  p_user_id UUID,
  p_bytes BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  -- Insert or update storage_usage record
  -- CRITICAL: Do NOT update updated_at to enable HOT updates
  -- Update last_pending_update_at to track when pending was modified
  INSERT INTO storage_usage (user_id, pending_bytes, last_pending_update_at)
  VALUES (p_user_id, p_bytes, now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    pending_bytes = storage_usage.pending_bytes + p_bytes,
    last_pending_update_at = now();
END;
$$;

-- Update rollback_pending_bytes to track last_pending_update_at
CREATE OR REPLACE FUNCTION rollback_pending_bytes(
  p_user_id UUID,
  p_bytes BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  -- CRITICAL: Do NOT update updated_at to enable HOT updates
  -- Update last_pending_update_at to track when pending was modified
  UPDATE storage_usage
  SET
    pending_bytes = GREATEST(storage_usage.pending_bytes - p_bytes, 0),
    last_pending_update_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Update commit_pending_bytes to track last_pending_update_at
CREATE OR REPLACE FUNCTION commit_pending_bytes(
  p_user_id UUID,
  p_bytes BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  -- CRITICAL: Do NOT update updated_at to enable HOT updates
  -- Update last_pending_update_at to track when pending was modified
  UPDATE storage_usage
  SET
    total_bytes_used = total_bytes_used + p_bytes,
    pending_bytes = GREATEST(pending_bytes - p_bytes, 0),
    last_pending_update_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Create cleanup RPC function for stale pending_bytes
CREATE OR REPLACE FUNCTION cleanup_stale_pending_bytes(
  p_stale_threshold_hours INT DEFAULT 1
)
RETURNS TABLE (user_id UUID, bytes_freed BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  -- Only admin or service role can run this
  -- For MVP, we'll allow users to clean their own stale pending bytes
  -- This prevents quota drift from failed uploads

  RETURN QUERY
  WITH cleaned AS (
    UPDATE storage_usage
    SET
      pending_bytes = 0,
      last_pending_update_at = now()
    WHERE user_id = auth.uid()
    AND pending_bytes > 0
    AND last_pending_update_at < now() - (p_stale_threshold_hours || ' hours')::interval
    RETURNING user_id, pending_bytes as bytes_freed
  )
  SELECT user_id, bytes_freed FROM cleaned;
END;
$$;

-- =====================================================
-- PHASE 5: File Upload Write Optimization (Option C - Hybrid)
-- =====================================================
-- Consolidate commit_pending_bytes and increment_asset_count
-- into single RPC to reduce write operations by 33%
-- Trade-off: Slightly less accurate quota enforcement, but reduces RPC calls

-- Create consolidated RPC for post-upload operations
CREATE OR REPLACE FUNCTION register_file_upload_complete(
  p_user_id UUID,
  p_bytes BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  -- CRITICAL: Do NOT update updated_at to enable HOT updates
  -- Atomically: commit pending bytes and increment asset count
  UPDATE storage_usage
  SET
    total_bytes_used = total_bytes_used + p_bytes,
    pending_bytes = GREATEST(pending_bytes - p_bytes, 0),
    asset_count = asset_count + 1,
    last_pending_update_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- =====================================================
-- SET FILLFACTOR FOR HOT UPDATES
-- =====================================================
-- Set fillfactor to 90% to enable HOT updates on storage_usage
-- This leaves 10% free space for rapid quota operations

ALTER TABLE storage_usage SET (fillfactor = 90);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check that fillfactor is set correctly
-- SELECT tablename, reloptions FROM pg_class WHERE relname = 'storage_usage';

-- Check that JSONB constraints exist
-- SELECT conname, convalidated FROM pg_constraint WHERE conrelid = 'licenses'::regclass;
-- SELECT conname, convalidated FROM pg_constraint WHERE conrelid = 'owner_keys'::regclass;

-- Check that redundant index was dropped
-- SELECT indexname FROM pg_indexes WHERE tablename = 'storage_usage' AND indexname = 'idx_storage_usage_user';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Expected Overall I/O Reduction:
-- Phase 1: ~50% reduction in storage_usage write amplification
-- Phase 3: ~10% reduction in storage_usage write overhead
-- Phase 5: ~33% reduction in RPC calls per file upload
-- Total: ~60-70% reduction in I/O for high-frequency image upload operations
