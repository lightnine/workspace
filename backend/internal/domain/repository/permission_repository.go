package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/domain/entity"
)

// PermissionRepository defines the interface for permission data access
type PermissionRepository interface {
	// Create creates a new permission
	Create(ctx context.Context, perm *entity.Permission) error

	// GetByID retrieves a permission by ID
	GetByID(ctx context.Context, id uuid.UUID) (*entity.Permission, error)

	// GetByObjectAndUser retrieves a permission by object ID and user ID
	GetByObjectAndUser(ctx context.Context, objectID int64, userID uuid.UUID) (*entity.Permission, error)

	// Update updates a permission
	Update(ctx context.Context, perm *entity.Permission) error

	// Delete deletes a permission
	Delete(ctx context.Context, id uuid.UUID) error

	// DeleteByObjectAndUser deletes a permission by object ID and user ID
	DeleteByObjectAndUser(ctx context.Context, objectID int64, userID uuid.UUID) error

	// ListByObject lists all permissions for an object
	ListByObject(ctx context.Context, objectID int64) ([]entity.Permission, error)

	// ListByUser lists all permissions for a user
	ListByUser(ctx context.Context, userID uuid.UUID) ([]entity.Permission, error)

	// GetEffectivePermission gets the effective permission for a user on an object
	// This considers inherited permissions from parent directories
	GetEffectivePermission(ctx context.Context, objectID int64, userID uuid.UUID) (*entity.Permission, error)

	// HasPermission checks if a user has at least the specified role on an object
	HasPermission(ctx context.Context, objectID int64, userID uuid.UUID, minRole entity.Role) (bool, error)

	// CreateInherited creates inherited permissions for all children of an object
	CreateInherited(ctx context.Context, objectID int64, userID uuid.UUID, role entity.Role, grantedBy uuid.UUID) error

	// DeleteInherited deletes all inherited permissions from an object for a user
	DeleteInherited(ctx context.Context, objectID int64, userID uuid.UUID) error
}
