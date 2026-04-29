-- Migration: Update project RPC functions to include cover columns
-- This updates save_project and load_project to handle cover-related fields

-- Update save_project function to include cover columns
CREATE OR REPLACE FUNCTION save_project(
  p_project_id UUID,
  p_viewport JSONB DEFAULT NULL,
  p_backgrounds JSONB DEFAULT NULL,
  p_tags_config JSONB DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_cover_image TEXT DEFAULT NULL,
  p_color TEXT DEFAULT NULL,
  p_gradient TEXT DEFAULT NULL,
  p_leather_color TEXT DEFAULT NULL,
  p_is_leather_mode BOOLEAN DEFAULT NULL,
  p_cover_page_settings JSONB DEFAULT NULL,
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
    cover_image = COALESCE(p_cover_image, cover_image),
    color = COALESCE(p_color, color),
    gradient = COALESCE(p_gradient, gradient),
    leather_color = COALESCE(p_leather_color, leather_color),
    is_leather_mode = COALESCE(p_is_leather_mode, is_leather_mode),
    cover_page_settings = COALESCE(p_cover_page_settings, cover_page_settings),
    last_version = last_version + 1,
    updated_at = now()
  WHERE id = p_project_id;
END;
$$;

-- Update load_project function to return cover columns
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
  cover_image TEXT,
  color TEXT,
  gradient TEXT,
  leather_color TEXT,
  is_leather_mode BOOLEAN,
  cover_page_settings JSONB,
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
    p.user_id,
    p.name,
    p.description,
    p.viewport,
    p.backgrounds,
    p.tags_config,
    p.cover_image,
    p.color,
    p.gradient,
    p.leather_color,
    p.is_leather_mode,
    p.cover_page_settings,
    p.last_version,
    (SELECT COUNT(*)::INT FROM assets WHERE assets.project_id = p.id AND deleted_at IS NULL) AS asset_count,
    p.updated_at
  FROM projects p
  WHERE p.id = p_project_id
  AND p.user_id = auth.uid()
  AND p.deleted_at IS NULL;
END;
$$;
