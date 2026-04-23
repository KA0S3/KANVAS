-- Fix ambiguous column reference in load_project function
-- The subquery had an ambiguous 'id' reference between projects and assets tables
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
    p.id,
    p.user_id,
    p.name,
    p.description,
    p.viewport,
    p.backgrounds,
    p.tags_config,
    p.last_version,
    (SELECT COUNT(*)::INT FROM assets WHERE assets.project_id = p.id AND deleted_at IS NULL) AS asset_count,
    p.updated_at
  FROM projects p
  WHERE p.id = p_project_id
  AND p.user_id = auth.uid()
  AND p.deleted_at IS NULL;
END;
$$;
