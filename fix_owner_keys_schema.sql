-- Migration script to fix missing is_revoked column in owner_keys table
-- This addresses the error: "column owner_keys.is_revoked does not exist"

-- Add the missing is_revoked column if it doesn't exist
ALTER TABLE owner_keys 
ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT FALSE;

-- Create index for better query performance on is_revoked
CREATE INDEX IF NOT EXISTS idx_owner_keys_is_revoked ON owner_keys(is_revoked);

-- Verify the column was added successfully
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'owner_keys' 
    AND column_name = 'is_revoked';

-- Update any existing records to have is_revoked = false (should already be false due to default)
-- This is just to ensure data consistency
UPDATE owner_keys 
SET is_revoked = FALSE 
WHERE is_revoked IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN owner_keys.is_revoked IS 'Indicates whether the owner key has been revoked (false = active, true = revoked)';
