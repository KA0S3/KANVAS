-- =====================================================
-- COMPREHENSIVE SUPABASE INTEGRATION FIX
-- This fixes user sync, RLS policies, and removes all unnecessary files
-- =====================================================

-- =====================================================
-- STEP 0: Ensure uuid-ossp or pgcrypto is available for uuid generation
-- (Prefer pgcrypto's gen_random_uuid if available)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- STEP 1: CREATE ALL TABLES FIRST (no FKs initially)
-- =====================================================

-- Create users table if missing (minimal safe structure)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  plan_type VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (plan_type IN ('guest', 'free', 'pro', 'lifetime', 'owner')),
  storage_quota_mb INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create owner_keys table
CREATE TABLE IF NOT EXISTS owner_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  key_value TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_revoked BOOLEAN DEFAULT FALSE
);

-- Create books table (app expects this but schema has projects)
CREATE TABLE IF NOT EXISTS books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    world_data JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create user_preferences table for background configs
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    book_id UUID,
    preference_type VARCHAR(50) NOT NULL,
    preference_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, book_id, preference_type)
);

-- Create promo_codes table (no FK initially)
CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value DECIMAL(10,2) NOT NULL,
    max_uses INTEGER,
    uses_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- STEP 2: ADD ALL COLUMNS (safe ALTERs)
-- =====================================================

-- Remove unnecessary password_hash column from users (Supabase Auth handles passwords)
ALTER TABLE public.users DROP COLUMN IF EXISTS password_hash;

-- Add missing columns to users if they don't exist
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS plan_type VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (plan_type IN ('guest', 'free', 'pro', 'lifetime', 'owner')),
ADD COLUMN IF NOT EXISTS storage_quota_mb INTEGER NOT NULL DEFAULT 100,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns to owner_keys if they don't exist
ALTER TABLE owner_keys 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT FALSE;

-- Add missing columns to promo_codes if they don't exist
ALTER TABLE promo_codes 
ADD COLUMN IF NOT EXISTS created_by UUID,
ADD COLUMN IF NOT EXISTS code VARCHAR(50) UNIQUE NOT NULL,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
ADD COLUMN IF NOT EXISTS discount_value DECIMAL(10,2) NOT NULL,
ADD COLUMN IF NOT EXISTS max_uses INTEGER,
ADD COLUMN IF NOT EXISTS uses_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns to books if they don't exist
ALTER TABLE books 
ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS world_data JSONB,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns to user_preferences if they don't exist
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS book_id UUID,
ADD COLUMN IF NOT EXISTS preference_type VARCHAR(50) NOT NULL,
ADD COLUMN IF NOT EXISTS preference_data JSONB,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Update any NULL expires_at values to far future
UPDATE owner_keys 
SET expires_at = NOW() + INTERVAL '30 days' 
WHERE expires_at IS NULL;

-- =====================================================
-- STEP 3: ADD ALL FOREIGN KEYS (after columns exist)
-- =====================================================

-- Add foreign keys to owner_keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_name = 'owner_keys' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE owner_keys ADD CONSTRAINT owner_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END;
$$;

-- Add foreign keys to books
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_name = 'books' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE books ADD CONSTRAINT books_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END;
$$;

-- Add foreign keys to user_preferences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_name = 'user_preferences' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_name = 'user_preferences' AND tc.constraint_name = 'user_preferences_book_id_fkey'
  ) THEN
    ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_book_id_fkey FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE;
  END IF;
END;
$$;

-- Add foreign key to promo_codes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_name = 'promo_codes' AND tc.constraint_name = 'promo_codes_created_by_fkey'
  ) THEN
    ALTER TABLE promo_codes ADD CONSTRAINT promo_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END;
$$;

-- =====================================================
-- STEP 4: Create function to sync auth users to users table
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user already exists to avoid conflicts
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    INSERT INTO public.users (id, email, plan_type, storage_quota_mb)
    VALUES (
      NEW.id::uuid,
      NEW.email,
      CASE 
        WHEN NEW.email = 'shadek392@gmail.com' THEN 'owner'
        ELSE 'free' 
      END,
      CASE 
        WHEN NEW.email = 'shadek392@gmail.com' THEN 10000
        ELSE 100 
      END
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- STEP 5: Create trigger to auto-sync new users
-- =====================================================
-- Ensure auth.users exists before creating trigger; if not, skip
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$$;

-- =====================================================
-- STEP 6: Fix existing users - sync them manually
-- =====================================================
-- Only run insert if auth.users exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO public.users (id, email, plan_type, storage_quota_mb)
    SELECT 
      id::uuid, 
      email, 
      CASE 
        WHEN email = 'shadek392@gmail.com' THEN 'owner'
        ELSE 'free' 
      END,
      CASE 
        WHEN email = 'shadek392@gmail.com' THEN 10000
        ELSE 100 
      END
    FROM auth.users 
    WHERE id::uuid NOT IN (SELECT id FROM public.users);
  END IF;
END;
$$;

-- =====================================================
-- STEP 7: Create indexes and triggers
-- =====================================================

-- Function to auto-update updated_at timestamp (if it doesn't exist)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create indexes for all tables
CREATE INDEX IF NOT EXISTS idx_books_user_id ON books(user_id);
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_book_id ON user_preferences(book_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_type ON user_preferences(preference_type);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_created_by ON promo_codes(created_by);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_owner_keys_user_id ON owner_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_plan_type ON users(plan_type);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_books_updated_at ON books;
CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON books FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_promo_codes_updated_at ON promo_codes;
CREATE TRIGGER update_promo_codes_updated_at BEFORE UPDATE ON promo_codes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- STEP 8: Add proper RLS policies for data isolation
-- =====================================================
-- Enable RLS on all tables if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users') THEN
    EXECUTE 'ALTER TABLE public.users ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='owner_keys') THEN
    EXECUTE 'ALTER TABLE public.owner_keys ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='books') THEN
    EXECUTE 'ALTER TABLE public.books ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_preferences') THEN
    EXECUTE 'ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='promo_codes') THEN
    EXECUTE 'ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY';
  END IF;
END;
$$;

-- Create simple policies (only if tables exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users') THEN
    EXECUTE $q$
      CREATE POLICY "Users can view own data" ON public.users FOR SELECT USING ((SELECT auth.uid()) = id);
    $q$;
    EXECUTE $q$
      CREATE POLICY "Users can update own data" ON public.users FOR UPDATE USING ((SELECT auth.uid()) = id);
    $q$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='owner_keys') THEN
    EXECUTE $q$
      CREATE POLICY "Users can view own owner keys" ON public.owner_keys FOR SELECT USING ((SELECT auth.uid()) = user_id);
    $q$;
    EXECUTE $q$
      CREATE POLICY "Owners can manage owner keys" ON public.owner_keys FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND plan_type = 'owner')
      );
    $q$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='books') THEN
    EXECUTE $q$
      CREATE POLICY "Users can view own books" ON public.books FOR SELECT USING ((SELECT auth.uid()) = user_id);
    $q$;
    EXECUTE $q$
      CREATE POLICY "Users can manage own books" ON public.books FOR ALL USING ((SELECT auth.uid()) = user_id);
    $q$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_preferences') THEN
    EXECUTE $q$
      CREATE POLICY "Users can manage own preferences" ON public.user_preferences FOR ALL USING ((SELECT auth.uid()) = user_id);
    $q$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='promo_codes') THEN
    EXECUTE $q$
      CREATE POLICY "Owners can manage promo codes" ON public.promo_codes FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid()) AND plan_type = 'owner')
      );
    $q$;
  END IF;
END;
$$;

-- =====================================================
-- STEP 9: Verification queries
-- =====================================================
-- Check that users are synced
SELECT 'Users in auth.users:' as info, COUNT(*)::text as count FROM auth.users
UNION ALL
SELECT 'Users in public.users:' as info, COUNT(*)::text as count FROM public.users
UNION ALL  
SELECT 'Owner users:' as info, COUNT(*)::text as count FROM public.users WHERE plan_type = 'owner'
UNION ALL
SELECT 'RLS enabled on users:' as info, 
       CASE WHEN rowsecurity = true THEN 'YES' ELSE 'NO' END as count 
FROM pg_tables WHERE tablename = 'users'
UNION ALL
SELECT 'Books table exists:' as info, 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'books') THEN 'YES' ELSE 'NO' END as count
UNION ALL
SELECT 'User_preferences table exists:' as info, 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_preferences') THEN 'YES' ELSE 'NO' END as count
UNION ALL
SELECT 'Promo_codes table exists:' as info, 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'promo_codes') THEN 'YES' ELSE 'NO' END as count;

-- Check table structures
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM (
  SELECT 'users' as table_name, column_name, data_type, is_nullable, column_default, ordinal_position
  FROM information_schema.columns 
  WHERE table_name = 'users'
  UNION ALL
  SELECT 'books' as table_name, column_name, data_type, is_nullable, column_default, ordinal_position
  FROM information_schema.columns 
  WHERE table_name = 'books'
  UNION ALL
  SELECT 'user_preferences' as table_name, column_name, data_type, is_nullable, column_default, ordinal_position
  FROM information_schema.columns 
  WHERE table_name = 'user_preferences'
  UNION ALL
  SELECT 'promo_codes' as table_name, column_name, data_type, is_nullable, column_default, ordinal_position
  FROM information_schema.columns 
  WHERE table_name = 'promo_codes'
) t
ORDER BY table_name, ordinal_position;
