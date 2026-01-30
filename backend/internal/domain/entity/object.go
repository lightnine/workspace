package entity

import (
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ObjectType represents the type of object
type ObjectType string

const (
	ObjectTypeDirectory ObjectType = "directory"
	ObjectTypeNotebook  ObjectType = "notebook"
	ObjectTypePython    ObjectType = "python"
	ObjectTypeSQL       ObjectType = "sql"
	ObjectTypeMarkdown  ObjectType = "markdown"
	ObjectTypeConfig    ObjectType = "config"
	ObjectTypeFile      ObjectType = "file"
)

// Object represents a file or directory entity
// ID is the JuiceFS inode
type Object struct {
	ID             int64      `json:"id"` // JuiceFS inode
	Name           string     `json:"name"`
	Type           ObjectType `json:"type"`
	Path           string     `json:"path"`
	ParentID       *int64     `json:"parent_id,omitempty"`
	CreatorID      uuid.UUID  `json:"creator_id"`
	Size           int64      `json:"size"`
	ContentHash    string     `json:"content_hash,omitempty"`
	Description    string     `json:"description,omitempty"`
	CurrentVersion int        `json:"current_version"`
	IsDeleted      bool       `json:"is_deleted"`
	DeletedAt      *time.Time `json:"deleted_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`

	// Relations (not stored in DB)
	Creator  *User    `json:"creator,omitempty"`
	Tags     []Tag    `json:"tags,omitempty"`
	Children []Object `json:"children,omitempty"`
}

// ObjectCreate represents the data needed to create a new object
type ObjectCreate struct {
	Name        string
	Type        ObjectType
	ParentID    *int64
	Description string
	Content     []byte // For files
}

// ObjectUpdate represents the data that can be updated
type ObjectUpdate struct {
	Name        *string
	Description *string
}

// ObjectMove represents the data needed to move an object
type ObjectMove struct {
	TargetParentID *int64
	NewName        *string
}

// ObjectFilter represents filter options for listing objects
type ObjectFilter struct {
	ParentID  *int64
	Type      []ObjectType
	CreatorID *uuid.UUID
	IsDeleted *bool
	Search    string
	Page      int
	PageSize  int
}

// ObjectResponse represents the object data returned to client
type ObjectResponse struct {
	ID             int64             `json:"id"`
	Name           string            `json:"name"`
	Type           ObjectType        `json:"type"`
	Path           string            `json:"path"`
	ParentID       *int64            `json:"parent_id,omitempty"`
	Size           int64             `json:"size"`
	Description    string            `json:"description,omitempty"`
	CurrentVersion int               `json:"current_version"`
	Creator        *UserResponse     `json:"creator,omitempty"`
	Tags           []TagResponse     `json:"tags,omitempty"`
	Children       []*ObjectResponse `json:"children,omitempty"`
	CreatedAt      time.Time         `json:"created_at"`
	UpdatedAt      time.Time         `json:"updated_at"`
}

// ToResponse converts Object to ObjectResponse
func (o *Object) ToResponse() *ObjectResponse {
	resp := &ObjectResponse{
		ID:             o.ID,
		Name:           o.Name,
		Type:           o.Type,
		Path:           o.Path,
		ParentID:       o.ParentID,
		Size:           o.Size,
		Description:    o.Description,
		CurrentVersion: o.CurrentVersion,
		CreatedAt:      o.CreatedAt,
		UpdatedAt:      o.UpdatedAt,
	}

	if o.Creator != nil {
		resp.Creator = o.Creator.ToResponse()
	}

	if len(o.Tags) > 0 {
		resp.Tags = make([]TagResponse, len(o.Tags))
		for i, tag := range o.Tags {
			resp.Tags[i] = *tag.ToResponse()
		}
	}

	return resp
}

// IsDirectory checks if the object is a directory
func (o *Object) IsDirectory() bool {
	return o.Type == ObjectTypeDirectory
}

// IsFile checks if the object is a file (not a directory)
func (o *Object) IsFile() bool {
	return o.Type != ObjectTypeDirectory
}

// GetExtension returns the file extension
func (o *Object) GetExtension() string {
	return strings.ToLower(filepath.Ext(o.Name))
}

// InferTypeFromExtension infers object type from file extension
func InferTypeFromExtension(filename string) ObjectType {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".ipynb":
		return ObjectTypeNotebook
	case ".py":
		return ObjectTypePython
	case ".sql":
		return ObjectTypeSQL
	case ".md", ".markdown":
		return ObjectTypeMarkdown
	case ".json", ".yaml", ".yml", ".toml", ".ini", ".conf":
		return ObjectTypeConfig
	default:
		return ObjectTypeFile
	}
}
