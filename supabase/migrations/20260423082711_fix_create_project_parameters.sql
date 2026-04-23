-- Fix create_project function to accept p_cover_config and p_project_id parameters
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
  IF p_project_id IS NOT NULL THEN
    INSERT INTO projects (id, user_id, name, description, backgrounds)
    VALUES (p_project_id, auth.uid(), p_name, p_description, p_cover_config)
    RETURNING id INTO v_project_id;
  ELSE
    INSERT INTO projects (user_id, name, description, backgrounds)
    VALUES (auth.uid(), p_name, p_description, p_cover_config)
    RETURNING id INTO v_project_id;
  END IF;

  RETURN v_project_id;
END;
$$;