-- ONLY add the missing pending_bytes column
-- This is the minimal fix needed for your upload flow to work

ALTER TABLE storage_usage ADD COLUMN IF NOT EXISTS pending_bytes BIGINT NOT NULL DEFAULT 0;

-- Create the missing stored procedures that your upload flow requires
CREATE OR REPLACE FUNCTION increment_pending_bytes(p_user_id UUID, p_bytes BIGINT)
RETURNS VOID AS $$
BEGIN
    INSERT INTO storage_usage (user_id, total_bytes_used, pending_bytes, asset_count, last_calculated_at, created_at, updated_at)
    VALUES (p_user_id, 0, p_bytes, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        pending_bytes = storage_usage.pending_bytes + p_bytes,
        last_calculated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION commit_pending_bytes(p_user_id UUID, p_bytes BIGINT)
RETURNS VOID AS $$
BEGIN
    UPDATE storage_usage 
    SET 
        total_bytes_used = total_bytes_used + p_bytes,
        pending_bytes = pending_bytes - p_bytes,
        last_calculated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rollback_pending_bytes(p_user_id UUID, p_bytes BIGINT)
RETURNS VOID AS $$
BEGIN
    UPDATE storage_usage 
    SET 
        pending_bytes = GREATEST(pending_bytes - p_bytes, 0),
        last_calculated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions for these functions
GRANT EXECUTE ON FUNCTION increment_pending_bytes TO authenticated;
GRANT EXECUTE ON FUNCTION commit_pending_bytes TO authenticated;  
GRANT EXECUTE ON FUNCTION rollback_pending_bytes TO authenticated;

-- Check if assets table has the cloud_path column that registerAsset function expects
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assets' 
        AND column_name = 'cloud_path'
    ) THEN
        ALTER TABLE assets ADD COLUMN cloud_path VARCHAR(500);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assets' 
        AND column_name = 'variants'
    ) THEN
        ALTER TABLE assets ADD COLUMN variants JSONB;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assets' 
        AND column_name = 'original_filename'
    ) THEN
        ALTER TABLE assets ADD COLUMN original_filename VARCHAR(255);
    END IF;
END $$;
