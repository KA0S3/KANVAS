-- =====================================================
-- COMPLETE DATABASE SETUP - PHASE 1 & 2
-- Low-I/O Backend Architecture
-- =====================================================
-- Run this entire script in your Supabase SQL Editor
-- This combines Phase 1 (schema) and Phase 2 (RPC functions)
-- =====================================================

-- =====================================================
-- PHASE 1: DATABASE SCHEMA
-- =====================================================

-- Table: projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,

  -- lightweight global configs (keep small)
  viewport JSONB DEFAULT '{"offset":{"x":0,"y":0},"scale":1}',
  backgrounds JSONB DEFAULT '{}',
  tags_config JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_version INT DEFAULT 0,

  deleted_at TIMESTAMPTZ
);

-- Table: assets (CRITICAL TABLE - flat, row-based)
CREATE TABLE IF NOT EXISTS assets (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Identity
  asset_id TEXT NOT NULL,
  parent_id TEXT,

  -- Core fields (flat, not nested JSON)
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('card', 'image', 'text', 'container', 'viewport', 'tag')),

  -- HOT fields (frequently updated during drag/resize)
  x INT NOT NULL DEFAULT 0,
  y INT NOT NULL DEFAULT 0,
  width INT NOT NULL DEFAULT 200,
  height INT NOT NULL DEFAULT 200,
  z_index INT NOT NULL DEFAULT 0,
  is_expanded BOOLEAN NOT NULL DEFAULT FALSE,

  -- Text content (for type='text' assets)
  -- CRITICAL: TEXT is unbounded and stored out-of-line via TOAST
  -- custom_fields has 2KB limit which is too small for rich text
  content TEXT,

  -- Flexible metadata (JSONB only for truly dynamic data)
  background_config JSONB DEFAULT '{}'::jsonb,
  viewport_config JSONB DEFAULT '{}'::jsonb,
  custom_fields JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  PRIMARY KEY (project_id, asset_id),

  -- JSONB size constraints (prevent silent bloat)
  CONSTRAINT background_config_size_check CHECK (pg_column_size(background_config) < 2048),
  CONSTRAINT viewport_config_size_check CHECK (pg_column_size(viewport_config) < 2048),
  CONSTRAINT custom_fields_size_check CHECK (pg_column_size(custom_fields) < 2048)
);

-- CRITICAL: Set fillfactor to 90% to enable HOT updates
-- Postgres defaults to 100% fill, leaving no room for HOT updates on the same page
-- This leaves 10% free space for rapid coordinate changes during drag operations
ALTER TABLE assets SET (fillfactor = 90);

-- Table: files (optional but recommended)
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  asset_id TEXT,

  storage_key TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes (IMPORTANT for performance)
CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_parent ON assets(project_id, parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_updated ON assets(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id) WHERE deleted_at IS NULL;

-- RLS Policies (MANDATORY for security)
-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Projects policy
DROP POLICY IF EXISTS "users_own_projects" ON projects;
CREATE POLICY "users_own_projects"
ON projects
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Assets policy (via project ownership)
DROP POLICY IF EXISTS "users_own_assets" ON assets;
CREATE POLICY "users_own_assets"
ON assets
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = assets.project_id
    AND projects.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = assets.project_id
    AND projects.user_id = auth.uid()
  )
);

-- Files policy (same pattern as assets)
DROP POLICY IF EXISTS "users_own_files" ON files;
CREATE POLICY "users_own_files"
ON files
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = files.project_id
    AND projects.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = files.project_id
    AND projects.user_id = auth.uid()
  )
);

-- =====================================================
-- PHASE 2: CORE RPC FUNCTIONS
-- =====================================================

-- Function: save_positions (Hot Updates - Position Only)
-- Use this for drag operations - only updates x, y, z_index (super cheap I/O)
-- CRITICAL: Do NOT update updated_at here - this enables HOT (Heap-Only Tuple) updates
CREATE OR REPLACE FUNCTION save_positions(
  p_project_id UUID,
  p_positions JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  IF NOT EXISTS (
    SELECT 1 FROM projects
    WHERE id = p_project_id
    AND user_id = auth.uid()
    AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- CRITICAL: Do NOT update updated_at here
  -- This enables HOT updates (no index rewrites)
  UPDATE assets
  SET
    x = (c->>'x')::int,
    y = (c->>'y')::int,
    z_index = (c->>'z_index')::int
  FROM jsonb_array_elements(p_positions) c
  WHERE assets.project_id = p_project_id
  AND assets.asset_id = c->>'asset_id';

  UPDATE projects
  SET updated_at = now()
  WHERE id = p_project_id;
END;
$$;

-- Function: save_assets (Full Upsert - Metadata Changes)
-- Use this for metadata changes - full upsert with version checking and project size limits
CREATE OR REPLACE FUNCTION save_assets(
  p_project_id UUID,
  p_assets JSONB,
  p_expected_version INT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_count INT;
  v_current_version INT;
BEGIN
  SET search_path = public;

  -- Validate ownership
  IF NOT EXISTS (
    SELECT 1 FROM projects
    WHERE id = p_project_id
    AND user_id = auth.uid()
    AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- CRITICAL FIX: Check version BEFORE upsert using SELECT FOR UPDATE lock
  -- This prevents wasted work on conflict and makes intent explicit
  IF p_expected_version IS NOT NULL THEN
    SELECT last_version INTO v_current_version
    FROM projects
    WHERE id = p_project_id
    AND user_id = auth.uid()
    AND deleted_at IS NULL
    FOR UPDATE; -- Lock the row to prevent concurrent updates
    
    IF v_current_version IS NULL THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    IF v_current_version != p_expected_version THEN
      RAISE EXCEPTION 'Version conflict: expected %, got %', p_expected_version, v_current_version;
    END IF;
  END IF;

  -- Project size control (max 5000 assets)
  SELECT COUNT(*) INTO v_asset_count
  FROM assets
  WHERE project_id = p_project_id
  AND deleted_at IS NULL;

  IF v_asset_count > 5000 THEN
    RAISE EXCEPTION 'Project too large: max 5000 assets allowed';
  END IF;

  INSERT INTO assets (
    project_id,
    asset_id,
    parent_id,
    name,
    type,
    x, y, width, height, z_index,
    is_expanded,
    content,
    background_config,
    viewport_config,
    custom_fields,
    updated_at
  )
  SELECT
    p_project_id,
    c->>'asset_id',
    c->>'parent_id',
    c->>'name',
    c->>'type',
    (c->>'x')::int,
    (c->>'y')::int,
    (c->>'width')::int,
    (c->>'height')::int,
    (c->>'z_index')::int,
    (c->>'is_expanded')::boolean,
    c->>'content',
    c->'background_config',
    c->'viewport_config',
    c->'custom_fields',
    now()
  FROM jsonb_array_elements(p_assets) c
  ON CONFLICT (project_id, asset_id)
  DO UPDATE SET
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    x = EXCLUDED.x,
    y = EXCLUDED.y,
    width = EXCLUDED.width,
    height = EXCLUDED.height,
    z_index = EXCLUDED.z_index,
    is_expanded = EXCLUDED.is_expanded,
    content = EXCLUDED.content,
    background_config = EXCLUDED.background_config,
    viewport_config = EXCLUDED.viewport_config,
    custom_fields = EXCLUDED.custom_fields,
    updated_at = now();

  -- Bump version after successful upsert
  UPDATE projects
  SET last_version = last_version + 1,
      updated_at = now()
  WHERE id = p_project_id;
END;
$$;

-- Function: save_assets_partial (Partial Updates Optimization)
-- Optional optimization for scale - send only changed fields
CREATE OR REPLACE FUNCTION save_assets_partial(
  p_project_id UUID,
  p_assets JSONB,
  p_expected_version INT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_count INT;
  v_current_version INT;
BEGIN
  SET search_path = public;

  -- CRITICAL FIX: Check version BEFORE upsert using SELECT FOR UPDATE lock
  IF p_expected_version IS NOT NULL THEN
    SELECT last_version INTO v_current_version
    FROM projects
    WHERE id = p_project_id
    AND user_id = auth.uid()
    AND deleted_at IS NULL
    FOR UPDATE;
    
    IF v_current_version IS NULL THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    IF v_current_version != p_expected_version THEN
      RAISE EXCEPTION 'Version conflict: expected %, got %', p_expected_version, v_current_version;
    END IF;
  ELSE
    -- Validate ownership when no version check
    IF NOT EXISTS (
      SELECT 1 FROM projects
      WHERE id = p_project_id
      AND user_id = auth.uid()
      AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
  END IF;

  -- Project size control
  SELECT COUNT(*) INTO v_asset_count
  FROM assets
  WHERE project_id = p_project_id
  AND deleted_at IS NULL;

  IF v_asset_count > 5000 THEN
    RAISE EXCEPTION 'Project too large: max 5000 assets allowed';
  END IF;

  INSERT INTO assets (
    project_id,
    asset_id,
    parent_id,
    name,
    type,
    x, y, width, height, z_index,
    is_expanded,
    content,
    background_config,
    viewport_config,
    custom_fields,
    updated_at
  )
  SELECT
    p_project_id,
    c->>'asset_id',
    CASE WHEN c->>'parent_id' IS NOT NULL THEN c->>'parent_id' ELSE (SELECT parent_id FROM assets WHERE asset_id = c->>'asset_id' AND project_id = p_project_id LIMIT 1) END,
    CASE WHEN c->>'name' IS NOT NULL THEN c->>'name' ELSE (SELECT name FROM assets WHERE asset_id = c->>'asset_id' AND project_id = p_project_id LIMIT 1) END,
    CASE WHEN c->>'type' IS NOT NULL THEN c->>'type' ELSE (SELECT type FROM assets WHERE asset_id = c->>'asset_id' AND project_id = p_project_id LIMIT 1) END,
    CASE WHEN c->>'x' IS NOT NULL THEN (c->>'x')::int ELSE (SELECT x FROM assets WHERE asset_id = c->>'asset_id' AND project_id = p_project_id LIMIT 1) END,
    CASE WHEN c->>'y' IS NOT NULL THEN (c->>'y')::int ELSE (SELECT y FROM assets WHERE asset_id = c->>'asset_id' AND project_id = p_project_id LIMIT 1) END,
    CASE WHEN c->>'width' IS NOT NULL THEN (c->>'width')::int ELSE (SELECT width FROM assets WHERE asset_id = c->>'asset_id' AND project_id = p_project_id LIMIT 1) END,
    CASE WHEN c->>'height' IS NOT NULL THEN (c->>'height')::int ELSE (SELECT height FROM assets WHERE asset_id = c->>'asset_id' AND project_id = p_project_id LIMIT 1) END,
    CASE WHEN c->>'z_index' IS NOT NULL THEN (c->>'z_index')::int ELSE (SELECT z_index FROM assets WHERE asset_id = c->>'asset_id' AND project_id = p_project_id LIMIT 1) END,
    CASE WHEN c->>'is_expanded' IS NOT NULL THEN (c->>'is_expanded')::boolean ELSE (SELECT is_expanded FROM assets WHERE asset_id = c->>'asset_id' AND project_id = p_project_id LIMIT 1) END,
    CASE WHEN c->>'content' IS NOT NULL THEN c->>'content' ELSE (SELECT content FROM assets WHERE asset_id = c->>'asset_id' AND project_id = p_project_id LIMIT 1) END,
    CASE WHEN c->>'background_config' IS NOT NULL THEN c->'background_config' ELSE (SELECT background_config FROM assets WHERE asset_id = c->>'asset_id' AND project_id = p_project_id LIMIT 1) END,
    CASE WHEN c->>'viewport_config' IS NOT NULL THEN c->'viewport_config' ELSE (SELECT viewport_config FROM assets WHERE asset_id = c->>'asset_id' AND project_id = p_project_id LIMIT 1) END,
    CASE WHEN c->>'custom_fields' IS NOT NULL THEN c->'custom_fields' ELSE (SELECT custom_fields FROM assets WHERE asset_id = c->>'asset_id' AND project_id = p_project_id LIMIT 1) END,
    now()
  FROM jsonb_array_elements(p_assets) c
  ON CONFLICT (project_id, asset_id)
  DO UPDATE SET
    parent_id = CASE WHEN EXCLUDED.parent_id IS NOT NULL THEN EXCLUDED.parent_id ELSE assets.parent_id END,
    name = CASE WHEN EXCLUDED.name IS NOT NULL THEN EXCLUDED.name ELSE assets.name END,
    type = CASE WHEN EXCLUDED.type IS NOT NULL THEN EXCLUDED.type ELSE assets.type END,
    x = CASE WHEN EXCLUDED.x IS NOT NULL THEN EXCLUDED.x ELSE assets.x END,
    y = CASE WHEN EXCLUDED.y IS NOT NULL THEN EXCLUDED.y ELSE assets.y END,
    width = CASE WHEN EXCLUDED.width IS NOT NULL THEN EXCLUDED.width ELSE assets.width END,
    height = CASE WHEN EXCLUDED.height IS NOT NULL THEN EXCLUDED.height ELSE assets.height END,
    z_index = CASE WHEN EXCLUDED.z_index IS NOT NULL THEN EXCLUDED.z_index ELSE assets.z_index END,
    is_expanded = CASE WHEN EXCLUDED.is_expanded IS NOT NULL THEN EXCLUDED.is_expanded ELSE assets.is_expanded END,
    content = CASE WHEN EXCLUDED.content IS NOT NULL THEN EXCLUDED.content ELSE assets.content END,
    background_config = CASE WHEN EXCLUDED.background_config IS NOT NULL THEN EXCLUDED.background_config ELSE assets.background_config END,
    viewport_config = CASE WHEN EXCLUDED.viewport_config IS NOT NULL THEN EXCLUDED.viewport_config ELSE assets.viewport_config END,
    custom_fields = CASE WHEN EXCLUDED.custom_fields IS NOT NULL THEN EXCLUDED.custom_fields ELSE assets.custom_fields END,
    updated_at = now();

  -- Bump version after successful upsert
  UPDATE projects
  SET last_version = last_version + 1,
      updated_at = now()
  WHERE id = p_project_id;
END;
$$;

-- Function: load_project (simple project metadata)
CREATE OR REPLACE FUNCTION load_project(
  p_project_id UUID
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  name TEXT,
  description TEXT,
  viewport JSONB,
  backgrounds JSONB,
  tags_config JSONB,
  last_version INT,
  asset_count INT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  RETURN QUERY
  SELECT
    id,
    user_id,
    name,
    description,
    viewport,
    backgrounds,
    tags_config,
    last_version,
    (SELECT COUNT(*)::INT FROM assets WHERE assets.project_id = projects.id AND deleted_at IS NULL) AS asset_count,
    updated_at
  FROM projects
  WHERE id = p_project_id
  AND user_id = auth.uid()
  AND deleted_at IS NULL;
END;
$$;

-- Function: load_assets (with optional parent_id filtering for lazy-loading)
-- CRITICAL: Fixed root loading bug - when p_parent_id IS NULL, now correctly loads only root nodes
-- CRITICAL: Added p_load_all flag - bypasses hierarchy check for small projects
CREATE OR REPLACE FUNCTION load_assets(
  p_project_id UUID,
  p_parent_id TEXT DEFAULT NULL,
  p_load_all BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  asset_id TEXT,
  parent_id TEXT,
  name TEXT,
  type TEXT,
  x INT,
  y INT,
  width INT,
  height INT,
  z_index INT,
  is_expanded BOOLEAN,
  content TEXT,
  background_config JSONB,
  viewport_config JSONB,
  custom_fields JSONB,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  RETURN QUERY
  SELECT
    asset_id,
    parent_id,
    name,
    type,
    x,
    y,
    width,
    height,
    z_index,
    is_expanded,
    content,
    background_config,
    viewport_config,
    custom_fields,
    updated_at
  FROM assets
  WHERE project_id = p_project_id
  AND deleted_at IS NULL
  -- CRITICAL FIX: Split NULL condition to avoid loading all rows
  -- CRITICAL FIX: Add p_load_all flag to bypass hierarchy check for small projects
  AND (
    p_load_all = TRUE
    OR (p_parent_id IS NULL AND parent_id IS NULL)
    OR (p_parent_id IS NOT NULL AND parent_id = p_parent_id)
  )
  AND EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = assets.project_id
    AND projects.user_id = auth.uid()
  );
END;
$$;

-- Function: create_project
CREATE OR REPLACE FUNCTION create_project(
  p_name TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  SET search_path = public;

  INSERT INTO projects (user_id, name, description)
  VALUES (auth.uid(), p_name, p_description)
  RETURNING id INTO v_project_id;

  RETURN v_project_id;
END;
$$;

-- Function: save_project (Project-level config updates)
-- Use this to save viewport, backgrounds, and tags_config. Includes ownership check and version bump.
CREATE OR REPLACE FUNCTION save_project(
  p_project_id UUID,
  p_viewport JSONB DEFAULT NULL,
  p_backgrounds JSONB DEFAULT NULL,
  p_tags_config JSONB DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_expected_version INT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_version INT;
BEGIN
  SET search_path = public;

  -- CRITICAL: Check version BEFORE update using SELECT FOR UPDATE lock
  IF p_expected_version IS NOT NULL THEN
    SELECT last_version INTO v_current_version
    FROM projects
    WHERE id = p_project_id
    AND user_id = auth.uid()
    AND deleted_at IS NULL
    FOR UPDATE;

    IF v_current_version IS NULL THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF v_current_version != p_expected_version THEN
      RAISE EXCEPTION 'Version conflict: expected %, got %', p_expected_version, v_current_version;
    END IF;
  ELSE
    -- Validate ownership when no version check
    IF NOT EXISTS (
      SELECT 1 FROM projects
      WHERE id = p_project_id
      AND user_id = auth.uid()
      AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
  END IF;

  -- Update only provided fields
  UPDATE projects
  SET
    viewport = COALESCE(p_viewport, viewport),
    backgrounds = COALESCE(p_backgrounds, backgrounds),
    tags_config = COALESCE(p_tags_config, tags_config),
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    last_version = last_version + 1,
    updated_at = now()
  WHERE id = p_project_id;
END;
$$;

-- Function: list_projects (Project dashboard)
-- Returns paginated list of user's projects for dashboard
CREATE OR REPLACE FUNCTION list_projects(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  last_version INT,
  asset_count INT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.description,
    p.last_version,
    COUNT(a.asset_id)::INT AS asset_count,
    p.updated_at
  FROM projects p
  LEFT JOIN assets a ON a.project_id = p.id AND a.deleted_at IS NULL
  WHERE p.user_id = auth.uid()
  AND p.deleted_at IS NULL
  GROUP BY p.id, p.name, p.description, p.last_version, p.updated_at
  ORDER BY p.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function: delete_project (Soft delete)
-- Soft deletes a project with ownership check
CREATE OR REPLACE FUNCTION delete_project(
  p_project_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET search_path = public;

  UPDATE projects
  SET deleted_at = now()
  WHERE id = p_project_id
  AND user_id = auth.uid()
  AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found or unauthorized';
  END IF;
END;
$$;

-- Function: create_file (File metadata tracking)
-- Creates a file record after upload to Supabase Storage
CREATE OR REPLACE FUNCTION create_file(
  p_project_id UUID,
  p_asset_id TEXT,
  p_storage_key TEXT,
  p_mime_type TEXT,
  p_size_bytes BIGINT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_file_id UUID;
BEGIN
  SET search_path = public;

  -- Validate project ownership
  IF NOT EXISTS (
    SELECT 1 FROM projects
    WHERE id = p_project_id
    AND user_id = auth.uid()
    AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO files (project_id, asset_id, storage_key, mime_type, size_bytes)
  VALUES (p_project_id, p_asset_id, p_storage_key, p_mime_type, p_size_bytes)
  RETURNING id INTO v_file_id;

  RETURN v_file_id;
END;
$$;

-- =====================================================
-- SETUP COMPLETE
-- =====================================================
-- Run the verification script next to confirm everything is working
