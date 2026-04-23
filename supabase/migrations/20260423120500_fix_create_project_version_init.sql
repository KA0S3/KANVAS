-- Fix create_project to initialize last_version to 1
-- Client expects version 1 for new projects, but server was defaulting to 0
CREATE OR REPLACE FUNCTION create_project(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_cover_config JSONB DEFAULT NULL,
  p_project_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  SET search_path = public;

  -- Use provided project_id if given, otherwise generate new UUID
  -- CRITICAL FIX: Initialize last_version to 1 to match client expectation
  IF p_project_id IS NOT NULL THEN
    INSERT INTO projects (id, user_id, name, description, backgrounds, last_version)
    VALUES (p_project_id, auth.uid(), p_name, p_description, p_cover_config, 1)
    RETURNING id INTO v_project_id;
  ELSE
    INSERT INTO projects (user_id, name, description, backgrounds, last_version)
    VALUES (auth.uid(), p_name, p_description, p_cover_config, 1)
    RETURNING id INTO v_project_id;
  END IF;

  RETURN v_project_id;
END;
$$;
