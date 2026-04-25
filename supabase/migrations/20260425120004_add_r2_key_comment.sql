-- =====================================================
-- ADD R2 KEY COLUMN COMMENT - Phase 5 Addition
-- Low-I/O Backend Architecture
-- =====================================================
-- This migration adds a comment to clarify that storage_key
-- now stores R2 keys (Cloudflare R2) instead of Supabase Storage keys
-- =====================================================

-- Add comment to storage_key column
COMMENT ON COLUMN files.storage_key IS 'Stores R2 object key (Cloudflare R2) or Supabase Storage key. Format: users/{user_id}/projects/{project_id}/assets/{asset_id}';

-- =====================================================
-- SETUP COMPLETE
-- =====================================================
