package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/domain/entity"
)

// TagRepository defines the interface for tag data access
type TagRepository interface {
	// Create creates a new tag
	Create(ctx context.Context, tag *entity.Tag) error

	// GetByID retrieves a tag by ID
	GetByID(ctx context.Context, id uuid.UUID) (*entity.Tag, error)

	// GetByName retrieves a tag by name
	GetByName(ctx context.Context, name string) (*entity.Tag, error)

	// Update updates a tag
	Update(ctx context.Context, tag *entity.Tag) error

	// Delete deletes a tag
	Delete(ctx context.Context, id uuid.UUID) error

	// List lists all tags
	List(ctx context.Context, page, pageSize int) ([]entity.Tag, int64, error)

	// Search searches tags by name
	Search(ctx context.Context, query string, page, pageSize int) ([]entity.Tag, int64, error)

	// ExistsByName checks if a tag with given name exists
	ExistsByName(ctx context.Context, name string) (bool, error)

	// AddToObject adds a tag to an object
	AddToObject(ctx context.Context, objectID int64, tagID uuid.UUID) error

	// RemoveFromObject removes a tag from an object
	RemoveFromObject(ctx context.Context, objectID int64, tagID uuid.UUID) error

	// GetObjectTags gets all tags for an object
	GetObjectTags(ctx context.Context, objectID int64) ([]entity.Tag, error)

	// GetObjectsByTag gets all objects with a specific tag
	GetObjectsByTag(ctx context.Context, tagID uuid.UUID, page, pageSize int) ([]entity.Object, int64, error)
}
