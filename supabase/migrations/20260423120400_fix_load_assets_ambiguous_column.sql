-- Fix ambiguous column reference in load_assets function
-- Alias assets table as 'a' and projects table as 'p' to resolve ambiguity
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
    a.asset_id,
    a.parent_id,
    a.name,
    a.type,
    a.x,
    a.y,
    a.width,
    a.height,
    a.z_index,
    a.is_expanded,
    a.content,
    a.background_config,
    a.viewport_config,
    a.custom_fields,
    a.updated_at
  FROM assets a
  WHERE a.project_id = p_project_id
  AND a.deleted_at IS NULL
  AND (
    p_load_all = TRUE
    OR (p_parent_id IS NULL AND a.parent_id IS NULL)
    OR (p_parent_id IS NOT NULL AND a.parent_id = p_parent_id)
  )
  AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = a.project_id
    AND p.user_id = auth.uid()
  );
END;
$$;
