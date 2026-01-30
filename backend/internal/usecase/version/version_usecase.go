package version

import (
	"context"

	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/adapter/storage"
	"github.com/leondli/workspace/internal/domain/entity"
	"github.com/leondli/workspace/internal/domain/repository"
	apperrors "github.com/leondli/workspace/pkg/errors"
)

// UseCase defines the version use case interface
type UseCase interface {
	ListByObject(ctx context.Context, objectID int64, page, pageSize int) ([]entity.VersionResponse, int64, error)
	GetByID(ctx context.Context, id uuid.UUID) (*entity.VersionResponse, error)
	GetContent(ctx context.Context, versionID uuid.UUID) ([]byte, error)
	Restore(ctx context.Context, versionID uuid.UUID, userID uuid.UUID) (*entity.ObjectResponse, error)
}

type versionUseCase struct {
	versionRepo repository.VersionRepository
	objectRepo  repository.ObjectRepository
	storage     *storage.LocalFileStorage
}

// NewUseCase creates a new version use case
func NewUseCase(
	versionRepo repository.VersionRepository,
	objectRepo repository.ObjectRepository,
	storage *storage.LocalFileStorage,
) UseCase {
	return &versionUseCase{
		versionRepo: versionRepo,
		objectRepo:  objectRepo,
		storage:     storage,
	}
}

func (u *versionUseCase) ListByObject(ctx context.Context, objectID int64, page, pageSize int) ([]entity.VersionResponse, int64, error) {
	versions, total, err := u.versionRepo.ListByObject(ctx, objectID, page, pageSize)
	if err != nil {
		return nil, 0, apperrors.InternalError("failed to list versions", err)
	}

	responses := make([]entity.VersionResponse, len(versions))
	for i, v := range versions {
		responses[i] = *v.ToResponse()
	}

	return responses, total, nil
}

func (u *versionUseCase) GetByID(ctx context.Context, id uuid.UUID) (*entity.VersionResponse, error) {
	version, err := u.versionRepo.GetByID(ctx, id)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("version")
		}
		return nil, apperrors.InternalError("failed to get version", err)
	}
	return version.ToResponse(), nil
}

func (u *versionUseCase) GetContent(ctx context.Context, versionID uuid.UUID) ([]byte, error) {
	version, err := u.versionRepo.GetByID(ctx, versionID)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("version")
		}
		return nil, apperrors.InternalError("failed to get version", err)
	}

	content, err := u.storage.ReadVersion(ctx, version.StoragePath)
	if err != nil {
		return nil, apperrors.InternalError("failed to read version content", err)
	}

	return content, nil
}

func (u *versionUseCase) Restore(ctx context.Context, versionID uuid.UUID, userID uuid.UUID) (*entity.ObjectResponse, error) {
	// Get version
	version, err := u.versionRepo.GetByID(ctx, versionID)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("version")
		}
		return nil, apperrors.InternalError("failed to get version", err)
	}

	// Get object
	obj, err := u.objectRepo.GetByID(ctx, version.ObjectID)
	if err != nil {
		return nil, apperrors.InternalError("failed to get object", err)
	}

	// Read version content
	content, err := u.storage.ReadVersion(ctx, version.StoragePath)
	if err != nil {
		return nil, apperrors.InternalError("failed to read version content", err)
	}

	// Write to current file
	if err := u.storage.WriteFile(ctx, obj.Path, content); err != nil {
		return nil, apperrors.InternalError("failed to restore file content", err)
	}

	// Get next version number
	nextVersion, err := u.versionRepo.GetNextVersionNumber(ctx, obj.ID)
	if err != nil {
		return nil, apperrors.InternalError("failed to get next version", err)
	}

	// Create new version from restored content
	versionPath, err := u.storage.SaveVersion(ctx, obj.Path, nextVersion, content)
	if err != nil {
		return nil, apperrors.InternalError("failed to save version", err)
	}

	newVersion := &entity.Version{
		ObjectID:      obj.ID,
		VersionNumber: nextVersion,
		ContentHash:   version.ContentHash,
		Size:          version.Size,
		StoragePath:   versionPath,
		Message:       "Restored from version " + string(rune(version.VersionNumber)),
		CreatorID:     userID,
	}

	if err := u.versionRepo.Create(ctx, newVersion); err != nil {
		return nil, apperrors.InternalError("failed to create version", err)
	}

	// Update object
	obj.ContentHash = version.ContentHash
	obj.Size = version.Size
	obj.CurrentVersion = nextVersion

	if err := u.objectRepo.Update(ctx, obj); err != nil {
		return nil, apperrors.InternalError("failed to update object", err)
	}

	return obj.ToResponse(), nil
}
