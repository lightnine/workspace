-- Migration: 000001_init_schema
-- Description: Create initial database schema for Workspace

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================
-- Users Table
-- =====================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

-- =====================
-- Objects Table (Files and Directories)
-- =====================
-- Note: id uses JuiceFS inode as primary key
CREATE TABLE objects (
    id BIGINT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    path VARCHAR(1000) UNIQUE NOT NULL,
    parent_id BIGINT REFERENCES objects(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES users(id),
    size BIGINT DEFAULT 0,
    content_hash VARCHAR(64),
    description TEXT,
    storage_path VARCHAR(1000),
    current_version INT DEFAULT 1,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_name_in_parent UNIQUE (parent_id, name)
);

CREATE INDEX idx_objects_parent ON objects(parent_id);
CREATE INDEX idx_objects_path ON objects(path);
CREATE INDEX idx_objects_type ON objects(type);
CREATE INDEX idx_objects_creator ON objects(creator_id);
CREATE INDEX idx_objects_is_deleted ON objects(is_deleted);

-- =====================
-- Versions Table
-- =====================
CREATE TABLE versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id BIGINT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    size BIGINT NOT NULL,
    storage_path VARCHAR(1000) NOT NULL,
    message VARCHAR(500),
    creator_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_version UNIQUE (object_id, version_number)
);

CREATE INDEX idx_versions_object ON versions(object_id);
CREATE INDEX idx_versions_creator ON versions(creator_id);

-- =====================
-- Permissions Table
-- =====================
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id BIGINT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    is_inherited BOOLEAN DEFAULT FALSE,
    granted_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_permission UNIQUE (object_id, user_id),
    CONSTRAINT valid_role CHECK (role IN ('owner', 'editor', 'viewer'))
);

CREATE INDEX idx_permissions_object ON permissions(object_id);
CREATE INDEX idx_permissions_user ON permissions(user_id);
CREATE INDEX idx_permissions_role ON permissions(role);

-- =====================
-- Tags Table
-- =====================
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    color VARCHAR(7) DEFAULT '#808080',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tags_name ON tags(name);

-- =====================
-- Object Tags Junction Table
-- =====================
CREATE TABLE object_tags (
    object_id BIGINT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (object_id, tag_id)
);

CREATE INDEX idx_object_tags_object ON object_tags(object_id);
CREATE INDEX idx_object_tags_tag ON object_tags(tag_id);

-- =====================
-- Refresh Tokens Table (for JWT)
-- =====================
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- =====================
-- Trigger function to update updated_at
-- =====================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON objects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_permissions_updated_at BEFORE UPDATE ON permissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
