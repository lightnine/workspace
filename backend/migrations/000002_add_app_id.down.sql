-- Migration: 000002_add_app_id (rollback)
-- Description: Remove app_id column from users table

-- Drop indexes
DROP INDEX IF EXISTS idx_users_app_email;
DROP INDEX IF EXISTS idx_users_app_id;

-- Remove app_id column
ALTER TABLE users DROP COLUMN IF EXISTS app_id;
