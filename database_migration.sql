-- Database Migration for Plan Consistency
-- Paste this directly in Supabase SQL Editor

-- Update users table plan names and storage quotas
UPDATE users 
SET plan_type = CASE 
    WHEN plan_type = 'basic' THEN 'free'
    WHEN plan_type = 'premium' THEN 'pro'
    WHEN plan_type = 'enterprise' THEN 'lifetime'
    ELSE plan_type
END,
storage_quota_mb = CASE 
    WHEN plan_type = 'free' THEN 100
    WHEN plan_type = 'pro' THEN 10240
    WHEN plan_type = 'lifetime' THEN 15360
    ELSE storage_quota_mb
END
WHERE plan_type IN ('basic', 'premium', 'enterprise');

-- Update users table constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_type_check;
ALTER TABLE users ADD CONSTRAINT users_plan_type_check 
    CHECK (plan_type IN ('free', 'pro', 'lifetime'));

-- Add plan_type mapping to licenses table
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS plan_type VARCHAR(20);
UPDATE licenses 
SET plan_type = CASE 
    WHEN license_type = 'basic' THEN 'free'
    WHEN license_type = 'premium' THEN 'pro'
    WHEN license_type = 'enterprise' THEN 'lifetime'
    WHEN license_type = 'trial' THEN 'free'
    ELSE 'free'
END
WHERE plan_type IS NULL;

-- Add constraint for licenses plan_type
ALTER TABLE licenses ADD CONSTRAINT licenses_plan_type_check 
    CHECK (plan_type IN ('free', 'pro', 'lifetime'));

-- Update promo codes plan targets
UPDATE promo_codes 
SET plan_target = CASE 
    WHEN plan_target = 'basic' THEN 'free'
    WHEN plan_target = 'premium' THEN 'pro'
    WHEN plan_target = 'enterprise' THEN 'lifetime'
    ELSE plan_target
END
WHERE plan_target IN ('basic', 'premium', 'enterprise');

-- Create trigger to maintain license-plan mapping
CREATE OR REPLACE FUNCTION update_license_plan_mapping()
RETURNS TRIGGER AS $$
BEGIN
    NEW.plan_type = CASE 
        WHEN NEW.license_type = 'basic' THEN 'free'
        WHEN NEW.license_type = 'premium' THEN 'pro'
        WHEN NEW.license_type = 'enterprise' THEN 'lifetime'
        WHEN NEW.license_type = 'trial' THEN 'free'
        ELSE 'free'
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_licenses_plan_type_trigger ON licenses;
CREATE TRIGGER update_licenses_plan_type_trigger
    BEFORE INSERT OR UPDATE ON licenses
    FOR EACH ROW
    EXECUTE FUNCTION update_license_plan_mapping();

-- Verify results
SELECT 
    plan_type,
    COUNT(*) as user_count,
    AVG(storage_quota_mb) as avg_storage_mb
FROM users 
GROUP BY plan_type
ORDER BY plan_type;
