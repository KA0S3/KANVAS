-- Migration: Add book cover columns to projects table
-- This migration adds cover-related fields to support book cover customization
-- Following MASTER_PLAN.md low-IO principles - using JSONB for flexible metadata

-- Add cover-related columns to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS cover_image TEXT,
ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3b82f6',
ADD COLUMN IF NOT EXISTS gradient TEXT,
ADD COLUMN IF NOT EXISTS leather_color TEXT,
ADD COLUMN IF NOT EXISTS is_leather_mode BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cover_page_settings JSONB DEFAULT '{}'::jsonb;

-- Add index for cover-related queries if needed
CREATE INDEX IF NOT EXISTS idx_projects_cover ON projects(user_id, cover_image) WHERE cover_image IS NOT NULL;

-- Add constraint to ensure JSONB size limit for cover_page_settings
ALTER TABLE projects 
ADD CONSTRAINT cover_page_settings_size_check CHECK (pg_column_size(cover_page_settings) < 2048);
