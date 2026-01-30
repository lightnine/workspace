package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/domain/entity"
)

// VersionRepository defines the interface for version data access
type VersionRepository interface {
	// Create creates a new version
	Create(ctx context.Context, version *entity.Version) error

	// GetByID retrieves a version by ID
	GetByID(ctx context.Context, id uuid.UUID) (*entity.Version, error)

	// GetByObjectAndNumber retrieves a version by object ID and version number
	GetByObjectAndNumber(ctx context.Context, objectID int64, versionNumber int) (*entity.Version, error)

	// GetLatest retrieves the latest version for an object
	GetLatest(ctx context.Context, objectID int64) (*entity.Version, error)

	// ListByObject lists all versions for an object
	ListByObject(ctx context.Context, objectID int64, page, pageSize int) ([]entity.Version, int64, error)

	// Delete deletes a version
	Delete(ctx context.Context, id uuid.UUID) error

	// DeleteOldVersions deletes versions older than a specified version number
	DeleteOldVersions(ctx context.Context, objectID int64, keepCount int) error

	// GetNextVersionNumber gets the next version number for an object
	GetNextVersionNumber(ctx context.Context, objectID int64) (int, error)
}
