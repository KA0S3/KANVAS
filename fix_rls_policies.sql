-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- Projects policies
CREATE POLICY "Users can view own projects" ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own projects" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON projects FOR DELETE USING (auth.uid() = user_id);

-- Assets policies
CREATE POLICY "Users can view own assets" ON assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own assets" ON assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own assets" ON assets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own assets" ON assets FOR DELETE USING (auth.uid() = user_id);

-- Storage usage policies
CREATE POLICY "Users can view own storage usage" ON storage_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own storage usage" ON storage_usage FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own storage usage" ON storage_usage FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Licenses policies
CREATE POLICY "Users can view own licenses" ON licenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage licenses" ON licenses FOR ALL USING (auth.jwt()->role = 'service_role');

-- Owner keys policies
CREATE POLICY "Users can view own owner keys" ON owner_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own owner keys" ON owner_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own owner keys" ON owner_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own owner keys" ON owner_keys FOR DELETE USING (auth.uid() = user_id);

-- Purchases policies
CREATE POLICY "Users can view own purchases" ON purchases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage purchases" ON purchases FOR ALL USING (auth.jwt()->role = 'service_role');

-- Admin actions policies
CREATE POLICY "Admins can view all actions" ON admin_actions FOR SELECT USING (auth.jwt()->role = 'service_role');
CREATE POLICY "Service role can manage admin actions" ON admin_actions FOR ALL USING (auth.jwt()->role = 'service_role');

-- Create missing stored procedures for upload flow
CREATE OR REPLACE FUNCTION increment_pending_bytes(p_user_id UUID, p_bytes BIGINT)
RETURNS VOID AS $$
BEGIN
    INSERT INTO storage_usage (user_id, total_bytes_used, pending_bytes, asset_count, last_calculated_at)
    VALUES (p_user_id, 0, p_bytes, 0, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        pending_bytes = storage_usage.pending_bytes + p_bytes,
        last_calculated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION commit_pending_bytes(p_user_id UUID, p_bytes BIGINT)
RETURNS VOID AS $$
BEGIN
    UPDATE storage_usage 
    SET 
        total_bytes_used = total_bytes_used + p_bytes,
        pending_bytes = pending_bytes - p_bytes,
        last_calculated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rollback_pending_bytes(p_user_id UUID, p_bytes BIGINT)
RETURNS VOID AS $$
BEGIN
    UPDATE storage_usage 
    SET 
        pending_bytes = pending_bytes - p_bytes,
        last_calculated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION increment_pending_bytes TO authenticated;
GRANT EXECUTE ON FUNCTION commit_pending_bytes TO authenticated;  
GRANT EXECUTE ON FUNCTION rollback_pending_bytes TO authenticated;
