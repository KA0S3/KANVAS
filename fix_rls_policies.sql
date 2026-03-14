-- RLS Policies for owner dashboard access
-- These policies address the 500 errors by ensuring proper access control

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy for users table - users can only see their own data, except owners
CREATE POLICY "Users can view own data" ON users
    FOR SELECT USING (
        auth.uid() = id OR 
        EXISTS (
            SELECT 1 FROM users 
            WHERE email = 'shadek392@gmail.com' AND plan_type = 'owner'
        )
    );

-- Enable RLS on owner_keys table  
ALTER TABLE owner_keys ENABLE ROW LEVEL SECURITY;

-- Policy for owner_keys - only owners can view/manage keys
CREATE POLICY "Owners can manage owner keys" ON owner_keys
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.email = 'shadek392@gmail.com' 
            AND users.plan_type = 'owner'
        )
    );

-- Enable RLS on licenses table
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

-- Policy for licenses - users can see their own licenses, owners can see all
CREATE POLICY "Users view own licenses, owners view all" ON licenses
    FOR SELECT USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.email = 'shadek392@gmail.com' 
            AND users.plan_type = 'owner'
        )
    );
