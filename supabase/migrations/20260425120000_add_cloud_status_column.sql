-- =====================================================
-- ADD CLOUD STATUS COLUMN - Phase 5 Addition
-- Low-I/O Backend Architecture
-- =====================================================
-- This migration adds cloud_status column to assets table
-- Required for R2 upload state tracking (local, uploading, synced, failed)
-- =====================================================

-- Add cloud_status column to assets table
ALTER TABLE assets ADD COLUMN IF NOT EXISTS cloud_status TEXT DEFAULT 'local';

-- Add constraint to ensure valid status values
ALTER TABLE assets ADD CONSTRAINT cloud_status_check 
CHECK (cloud_status IN ('local', 'uploading', 'synced', 'failed'));

-- Add cloud_error column for error messages (optional, nullable)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS cloud_error TEXT;

-- Add index for querying by cloud status (useful for retry logic)
CREATE INDEX IF NOT EXISTS idx_assets_cloud_status ON assets(project_id, cloud_status) 
WHERE deleted_at IS NULL;

-- =====================================================
-- SETUP COMPLETE
-- =====================================================
