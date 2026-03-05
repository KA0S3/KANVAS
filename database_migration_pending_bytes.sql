-- Database Migration for Pending Bytes and Quota Consistency
-- Run this in Supabase SQL Editor
-- 
-- This migration adds:
-- 1. pending_bytes column to storage_usage table for upload buffering
-- 2. Backfill storage_usage from existing assets
-- 3. Create helper functions for atomic operations
-- 4. Update constraints and indexes

-- =====================================================
-- BACKUP IMPORTANT DATA BEFORE MIGRATION
-- =====================================================

-- Create backup tables
CREATE TABLE IF NOT EXISTS storage_usage_backup_YYYYMMDD AS 
SELECT * FROM storage_usage;

CREATE TABLE IF NOT EXISTS licenses_backup_YYYYMMDD AS 
SELECT * FROM licenses;

-- =====================================================
-- SCHEMA UPDATES
-- =====================================================

-- Add pending_bytes column to storage_usage table
ALTER TABLE storage_usage 
ADD COLUMN IF NOT EXISTS pending_bytes BIGINT NOT NULL DEFAULT 0;

-- Add derived column for storage_quota_bytes if storage_quota_mb exists
-- This helps with migration and consistency
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT GENERATED ALWAYS AS (
  COALESCE(storage_quota_mb, 0) * 1024 * 1024
) STORED;

-- =====================================================
-- BACKFILL STORAGE_USAGE FROM ASSETS
-- =====================================================

-- Create or replace function to backfill storage usage
CREATE OR REPLACE FUNCTION backfill_storage_usage()
RETURNS VOID AS $$
DECLARE
    user_record RECORD;
    total_bytes BIGINT;
    asset_count_val INTEGER;
BEGIN
    -- Iterate through all users
    FOR user_record IN 
        SELECT DISTINCT user_id FROM assets
        WHERE user_id NOT IN (
            SELECT user_id FROM storage_usage 
            WHERE total_bytes_used > 0
        )
    LOOP
        -- Calculate total bytes and asset count for this user
        SELECT 
            COALESCE(SUM(file_size_bytes), 0) as total_size,
            COUNT(*) as asset_count
        INTO total_bytes, asset_count_val
        FROM assets 
        WHERE user_id = user_record.user_id;
        
        -- Insert or update storage_usage record
        INSERT INTO storage_usage (
            user_id, 
            total_bytes_used, 
            asset_count,
            pending_bytes,
            last_calculated_at
        ) VALUES (
            user_record.user_id,
            total_bytes,
            asset_count_val,
            0, -- Initialize pending_bytes to 0
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (user_id) 
        DO UPDATE SET
            total_bytes_used = EXCLUDED.total_bytes_used,
            asset_count = EXCLUDED.asset_count,
            last_calculated_at = CURRENT_TIMESTAMP;
            
        RAISE NOTICE 'Backfilled storage usage for user %: % bytes, % assets', 
            user_record.user_id, total_bytes, asset_count_val;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute backfill
SELECT backfill_storage_usage();

-- =====================================================
-- ATOMIC OPERATIONS FUNCTIONS
-- =====================================================

-- Function to increment pending bytes atomically
CREATE OR REPLACE FUNCTION increment_pending_bytes(
    p_user_id UUID,
    p_bytes BIGINT
)
RETURNS BOOLEAN AS $$
DECLARE
    current_usage RECORD;
    new_pending BIGINT;
BEGIN
    -- Get current usage with lock
    SELECT * INTO current_usage 
    FROM storage_usage 
    WHERE user_id = p_user_id 
    FOR UPDATE;
    
    -- If no record exists, create one
    IF NOT FOUND THEN
        INSERT INTO storage_usage (
            user_id, 
            total_bytes_used, 
            asset_count,
            pending_bytes,
            last_calculated_at
        ) VALUES (
            p_user_id,
            0,
            0,
            p_bytes,
            CURRENT_TIMESTAMP
        );
        RETURN TRUE;
    END IF;
    
    -- Update pending bytes
    new_pending := current_usage.pending_bytes + p_bytes;
    
    UPDATE storage_usage 
    SET pending_bytes = new_pending,
        last_calculated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to commit pending bytes to total used
CREATE OR REPLACE FUNCTION commit_pending_bytes(
    p_user_id UUID,
    p_bytes BIGINT
)
RETURNS BOOLEAN AS $$
DECLARE
    current_usage RECORD;
    new_pending BIGINT;
    new_total BIGINT;
BEGIN
    -- Get current usage with lock
    SELECT * INTO current_usage 
    FROM storage_usage 
    WHERE user_id = p_user_id 
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Storage usage record not found for user %', p_user_id;
        RETURN FALSE;
    END IF;
    
    -- Validate we have enough pending bytes
    IF current_usage.pending_bytes < p_bytes THEN
        RAISE EXCEPTION 'Insufficient pending bytes: have %, need %', 
            current_usage.pending_bytes, p_bytes;
        RETURN FALSE;
    END IF;
    
    -- Update totals
    new_pending := current_usage.pending_bytes - p_bytes;
    new_total := current_usage.total_bytes_used + p_bytes;
    
    UPDATE storage_usage 
    SET 
        pending_bytes = new_pending,
        total_bytes_used = new_total,
        last_calculated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to rollback pending bytes (for failed uploads)
CREATE OR REPLACE FUNCTION rollback_pending_bytes(
    p_user_id UUID,
    p_bytes BIGINT
)
RETURNS BOOLEAN AS $$
DECLARE
    current_usage RECORD;
    new_pending BIGINT;
BEGIN
    -- Get current usage with lock
    SELECT * INTO current_usage 
    FROM storage_usage 
    WHERE user_id = p_user_id 
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Storage usage record not found for user %', p_user_id;
        RETURN FALSE;
    END IF;
    
    -- Validate we have enough pending bytes to rollback
    IF current_usage.pending_bytes < p_bytes THEN
        RAISE EXCEPTION 'Insufficient pending bytes to rollback: have %, need %', 
            current_usage.pending_bytes, p_bytes;
        RETURN FALSE;
    END IF;
    
    -- Update pending bytes
    new_pending := current_usage.pending_bytes - p_bytes;
    
    UPDATE storage_usage 
    SET pending_bytes = new_pending,
        last_calculated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Add index for pending_bytes queries
CREATE INDEX IF NOT EXISTS idx_storage_usage_pending_bytes 
ON storage_usage(pending_bytes) 
WHERE pending_bytes > 0;

-- Add composite index for user queries
CREATE INDEX IF NOT EXISTS idx_storage_usage_user_total_pending 
ON storage_usage(user_id, total_bytes_used, pending_bytes);

-- =====================================================
-- VERIFICATION AND CLEANUP
-- =====================================================

-- Verify migration results
SELECT 
    'Migration Summary' as info,
    COUNT(*) as total_users_with_usage,
    SUM(total_bytes_used) as total_bytes_used,
    SUM(pending_bytes) as total_pending_bytes,
    COUNT(CASE WHEN pending_bytes > 0 THEN 1 END) as users_with_pending_uploads
FROM storage_usage;

-- Show any users with assets but no storage_usage record
SELECT 
    'Users with assets but no storage_usage' as warning,
    user_id,
    COUNT(*) as asset_count,
    SUM(file_size_bytes) as total_asset_bytes
FROM assets a
LEFT JOIN storage_usage s ON a.user_id = s.user_id
WHERE s.user_id IS NULL
GROUP BY user_id
LIMIT 10;

-- Clean up the backfill function (optional)
-- DROP FUNCTION IF EXISTS backfill_storage_usage();

-- =====================================================
-- SAMPLE USAGE QUERIES
-- =====================================================

/*
-- Example: Check if user can upload X bytes
SELECT 
    (total_bytes_used + pending_bytes + X) <= (
        SELECT COALESCE(storage_quota_bytes, 104857600) -- 100MB default
        FROM users 
        WHERE id = 'user-uuid'
    ) as can_upload;

-- Example: Get current usage with pending
SELECT 
    total_bytes_used,
    pending_bytes,
    total_bytes_used + pending_bytes as effective_usage,
    asset_count
FROM storage_usage 
WHERE user_id = 'user-uuid';
*/
