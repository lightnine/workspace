-- Migration: 000002_add_app_id
-- Description: Add app_id (application ID) to users table for multi-tenancy support

-- Add app_id column to users table
ALTER TABLE users ADD COLUMN app_id VARCHAR(100) NOT NULL DEFAULT 'default';

-- Create index for app_id
CREATE INDEX idx_users_app_id ON users(app_id);

-- Create composite index for app_id and email (for workspace path lookup)
CREATE INDEX idx_users_app_email ON users(app_id, email);
