package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/domain/entity"
)

// ObjectRepository defines the interface for object data access
type ObjectRepository interface {
	// Create creates a new object
	Create(ctx context.Context, obj *entity.Object) error

	// GetByID retrieves an object by ID (inode)
	GetByID(ctx context.Context, id int64) (*entity.Object, error)

	// GetByPath retrieves an object by path
	GetByPath(ctx context.Context, path string) (*entity.Object, error)

	// Update updates an object
	Update(ctx context.Context, obj *entity.Object) error

	// Delete soft deletes an object
	Delete(ctx context.Context, id int64) error

	// HardDelete permanently deletes an object
	HardDelete(ctx context.Context, id int64) error

	// List lists objects with filter
	List(ctx context.Context, filter *entity.ObjectFilter) ([]entity.Object, int64, error)

	// ListChildren lists direct children of an object
	ListChildren(ctx context.Context, parentID *int64, page, pageSize int) ([]entity.Object, int64, error)

	// GetTree retrieves the directory tree starting from a path
	GetTree(ctx context.Context, parentID *int64, depth int) ([]entity.Object, error)

	// ExistsByPath checks if an object exists at the given path
	ExistsByPath(ctx context.Context, path string) (bool, error)

	// ExistsInParent checks if an object with given name exists in parent
	ExistsInParent(ctx context.Context, parentID *int64, name string) (bool, error)

	// GetByCreator retrieves objects created by a user
	GetByCreator(ctx context.Context, creatorID uuid.UUID, page, pageSize int) ([]entity.Object, int64, error)

	// ListByCreator retrieves all objects created by a user (no pagination)
	ListByCreator(ctx context.Context, creatorID uuid.UUID) ([]entity.Object, error)

	// Search searches objects by name
	Search(ctx context.Context, query string, types []entity.ObjectType, page, pageSize int) ([]entity.Object, int64, error)

	// UpdatePath updates the path of an object (used for move/rename)
	UpdatePath(ctx context.Context, id int64, newPath string) error

	// GetDescendants retrieves all descendant objects of a directory
	GetDescendants(ctx context.Context, parentPath string) ([]entity.Object, error)
}
