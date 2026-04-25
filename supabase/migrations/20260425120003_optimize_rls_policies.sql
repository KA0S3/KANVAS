-- =====================================================
-- OPTIMIZE RLS POLICIES - Phase 5 Addition
-- Low-I/O Backend Architecture
-- =====================================================
-- This migration optimizes RLS policies for better performance
-- Replaces EXISTS subqueries with SECURITY DEFINER functions
-- Following PostgreSQL best practices for RLS performance
-- =====================================================

-- =====================================================
-- CREATE SECURITY DEFINER HELPER FUNCTIONS
-- =====================================================
-- These functions bypass RLS to check ownership efficiently
-- Called from RLS policies to avoid chained RLS evaluation

-- Function: check_project_ownership
-- Returns true if user owns the project
CREATE OR REPLACE FUNCTION check_project_ownership(
  p_project_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;
  
  RETURN EXISTS (
    SELECT 1 FROM projects
    WHERE id = p_project_id
    AND user_id = auth.uid()
    AND deleted_at IS NULL
  );
END;
$$;

-- Function: check_asset_ownership_via_project
-- Returns true if user owns the project that contains the asset
CREATE OR REPLACE FUNCTION check_asset_ownership_via_project(
  p_project_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;
  
  RETURN EXISTS (
    SELECT 1 FROM projects
    WHERE id = p_project_id
    AND user_id = auth.uid()
    AND deleted_at IS NULL
  );
END;
$$;

-- =====================================================
-- UPDATE ASSETS RLS POLICY
-- =====================================================
-- Replace EXISTS subquery with SECURITY DEFINER function call
-- This avoids chained RLS evaluation and improves performance

DROP POLICY IF EXISTS "users_own_assets" ON assets;
CREATE POLICY "users_own_assets"
ON assets
FOR ALL
USING (check_asset_ownership_via_project(project_id))
WITH CHECK (check_asset_ownership_via_project(project_id));

-- =====================================================
-- UPDATE FILES RLS POLICY
-- =====================================================
-- Replace EXISTS subquery with SECURITY DEFINER function call

DROP POLICY IF EXISTS "users_own_files" ON files;
CREATE POLICY "users_own_files"
ON files
FOR ALL
USING (check_asset_ownership_via_project(project_id))
WITH CHECK (check_asset_ownership_via_project(project_id));

-- =====================================================
-- SETUP COMPLETE
-- =====================================================
-- Expected Performance Improvement:
-- - Eliminates chained RLS policy evaluation
-- - Reduces query overhead for asset/file operations
-- - Follows PostgreSQL RLS best practices
