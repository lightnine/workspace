-- Migration: 000001_init_schema (Down)
-- Description: Rollback initial database schema

-- Drop triggers
DROP TRIGGER IF EXISTS update_permissions_updated_at ON permissions;
DROP TRIGGER IF EXISTS update_objects_updated_at ON objects;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop tables in reverse order of creation (respecting foreign key constraints)
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS object_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS versions;
DROP TABLE IF EXISTS objects;
DROP TABLE IF EXISTS users;

-- Drop extension (optional, usually keep it)
-- DROP EXTENSION IF EXISTS "pgcrypto";
