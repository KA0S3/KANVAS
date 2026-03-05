-- Migration script for owner_keys table audit trail enhancements
-- Run this in Supabase SQL Editor to update existing table

-- Add missing audit trail fields if they don't exist
ALTER TABLE owner_keys 
ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS created_by UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Add foreign key constraint for created_by (references a default system user for existing records)
ALTER TABLE owner_keys 
ADD CONSTRAINT owner_keys_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;

-- Create index for revoked_by for better query performance
CREATE INDEX IF NOT EXISTS idx_owner_keys_revoked_by ON owner_keys(revoked_by);

-- Create index for created_by for better query performance  
CREATE INDEX IF NOT EXISTS idx_owner_keys_created_by ON owner_keys(created_by);

-- Update existing records to have a default created_by (you may want to set this to an actual admin user ID)
-- This is a placeholder - replace with actual admin user ID if needed
UPDATE owner_keys 
SET created_by = '00000000-0000-0000-0000-000000000000' 
WHERE created_by = '00000000-0000-0000-0000-000000000000';

-- Add comment to document the changes
COMMENT ON COLUMN owner_keys.revoked_by IS 'UUID of admin user who revoked this owner key';
COMMENT ON COLUMN owner_keys.created_by IS 'UUID of user who created this owner key';

-- Verify the schema changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'owner_keys' 
    AND column_name IN ('revoked_by', 'created_by')
ORDER BY column_name;
