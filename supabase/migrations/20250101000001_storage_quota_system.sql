-- =====================================================
-- STORAGE QUOTA SYSTEM - Phase 3 Additions
-- Low-I/O Backend Architecture
-- =====================================================
-- This migration adds the missing storage quota tracking system
-- Required for file upload flow and storage management
-- =====================================================

-- =====================================================
-- TABLE: users
-- =====================================================
-- Stores user plan information and storage quotas
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  plan_type TEXT NOT NULL DEFAULT 'free',
  storage_quota_mb INT NOT NULL DEFAULT 100,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick plan lookups
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan_type);

-- RLS Policy
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_user_record" ON users;
CREATE POLICY "users_own_user_record"
ON users
FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- =====================================================
-- TABLE: licenses
-- =====================================================
-- Stores license information for quota overrides
CREATE TABLE IF NOT EXISTS licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  license_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  features JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for license queries
CREATE INDEX IF NOT EXISTS idx_licenses_user ON licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_active ON licenses(user_id, status) WHERE status = 'active';

-- RLS Policy
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_licenses" ON licenses;
CREATE POLICY "users_own_licenses"
ON licenses
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- TABLE: owner_keys
-- =====================================================
-- Stores owner keys for special access and quota overrides
CREATE TABLE IF NOT EXISTS owner_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  token TEXT NOT NULL UNIQUE,
  scopes JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for key validation
CREATE INDEX IF NOT EXISTS idx_owner_keys_token ON owner_keys(token);
CREATE INDEX IF NOT EXISTS idx_owner_keys_user ON owner_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_owner_keys_active ON owner_keys(user_id, is_revoked, expires_at);

-- RLS Policy
ALTER TABLE owner_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_owner_keys" ON owner_keys;
CREATE POLICY "users_own_owner_keys"
ON owner_keys
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- TABLE: storage_usage
-- =====================================================
-- Tracks storage usage per user with pending upload tracking
-- CRITICAL: Enables quota enforcement before upload completes
CREATE TABLE IF NOT EXISTS storage_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  total_bytes_used BIGINT NOT NULL DEFAULT 0,
  pending_bytes BIGINT NOT NULL DEFAULT 0,
  asset_count INT NOT NULL DEFAULT 0,
  
  last_calculated_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick usage lookups
CREATE INDEX IF NOT EXISTS idx_storage_usage_user ON storage_usage(user_id);

-- RLS Policy
ALTER TABLE storage_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_storage_usage" ON storage_usage;
CREATE POLICY "users_own_storage_usage"
ON storage_usage
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- RPC FUNCTION: increment_pending_bytes
-- =====================================================
-- Atomically reserve bytes for upload (prevents quota overflow)
-- CRITICAL: Must be atomic to prevent race conditions
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
  INSERT INTO storage_usage (user_id, pending_bytes, updated_at)
  VALUES (p_user_id, p_bytes, now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    pending_bytes = storage_usage.pending_bytes + p_bytes,
    updated_at = now();
END;
$$;

-- =====================================================
-- RPC FUNCTION: rollback_pending_bytes
-- =====================================================
-- Rollback reserved bytes on upload failure
-- CRITICAL: Must be atomic to prevent quota leaks
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

  UPDATE storage_usage
  SET
    pending_bytes = GREATEST(storage_usage.pending_bytes - p_bytes, 0),
    updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- =====================================================
-- RPC FUNCTION: commit_pending_bytes
-- =====================================================
-- Move bytes from pending to total after successful upload
-- CRITICAL: Must be atomic to prevent accounting errors
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

  UPDATE storage_usage
  SET
    total_bytes_used = total_bytes_used + p_bytes,
    pending_bytes = GREATEST(pending_bytes - p_bytes, 0),
    updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- =====================================================
-- RPC FUNCTION: get_storage_usage
-- =====================================================
-- Get current storage usage for a user
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
-- RPC FUNCTION: increment_asset_count
-- =====================================================
-- Increment asset count after successful asset creation
CREATE OR REPLACE FUNCTION increment_asset_count(
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  INSERT INTO storage_usage (user_id, asset_count, updated_at)
  VALUES (p_user_id, 1, now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    asset_count = storage_usage.asset_count + 1,
    updated_at = now();
END;
$$;

-- =====================================================
-- RPC FUNCTION: decrement_asset_count
-- =====================================================
-- Decrement asset count after asset deletion
CREATE OR REPLACE FUNCTION decrement_asset_count(
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  UPDATE storage_usage
  SET
    asset_count = GREATEST(asset_count - 1, 0),
    updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- =====================================================
-- TRIGGER: Auto-create user record on signup
-- =====================================================
-- Automatically create users record when auth user is created
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, plan_type, storage_quota_mb)
  VALUES (NEW.id, 'free', 100);
  
  -- Initialize storage_usage
  INSERT INTO public.storage_usage (user_id, total_bytes_used, pending_bytes, asset_count)
  VALUES (NEW.id, 0, 0, 0);
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- SETUP COMPLETE
-- =====================================================
-- Storage quota system is now ready for file upload flow
