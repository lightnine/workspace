package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/leondli/workspace/internal/domain/entity"
	"github.com/leondli/workspace/internal/domain/repository"
	apperrors "github.com/leondli/workspace/pkg/errors"
)

// VersionModel is the Gorm model for versions table
type VersionModel struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey"`
	ObjectID      int64     `gorm:"not null;index"`
	VersionNumber int       `gorm:"not null"`
	ContentHash   string    `gorm:"size:64;not null"`
	Size          int64     `gorm:"not null"`
	StoragePath   string    `gorm:"size:1000;not null"`
	Message       string    `gorm:"size:500"`
	CreatorID     uuid.UUID `gorm:"type:uuid;not null;index"`
	CreatedAt     time.Time

	// Relations
	Creator *UserModel   `gorm:"foreignKey:CreatorID"`
	Object  *ObjectModel `gorm:"foreignKey:ObjectID"`
}

// TableName returns the table name
func (VersionModel) TableName() string {
	return "versions"
}

// ToEntity converts VersionModel to entity.Version
func (m *VersionModel) ToEntity() *entity.Version {
	ver := &entity.Version{
		ID:            m.ID,
		ObjectID:      m.ObjectID,
		VersionNumber: m.VersionNumber,
		ContentHash:   m.ContentHash,
		Size:          m.Size,
		StoragePath:   m.StoragePath,
		Message:       m.Message,
		CreatorID:     m.CreatorID,
		CreatedAt:     m.CreatedAt,
	}

	if m.Creator != nil {
		ver.Creator = m.Creator.ToEntity()
	}

	return ver
}

// versionRepository implements repository.VersionRepository
type versionRepository struct {
	db *gorm.DB
}

// NewVersionRepository creates a new version repository
func NewVersionRepository(db *gorm.DB) repository.VersionRepository {
	return &versionRepository{db: db}
}

func (r *versionRepository) Create(ctx context.Context, version *entity.Version) error {
	if version.ID == uuid.Nil {
		version.ID = uuid.New()
	}
	version.CreatedAt = time.Now()

	model := &VersionModel{
		ID:            version.ID,
		ObjectID:      version.ObjectID,
		VersionNumber: version.VersionNumber,
		ContentHash:   version.ContentHash,
		Size:          version.Size,
		StoragePath:   version.StoragePath,
		Message:       version.Message,
		CreatorID:     version.CreatorID,
		CreatedAt:     version.CreatedAt,
	}

	return r.db.WithContext(ctx).Create(model).Error
}

func (r *versionRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Version, error) {
	var model VersionModel
	if err := r.db.WithContext(ctx).
		Preload("Creator").
		Where("id = ?", id).
		First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}
		return nil, err
	}
	return model.ToEntity(), nil
}

func (r *versionRepository) GetByObjectAndNumber(ctx context.Context, objectID int64, versionNumber int) (*entity.Version, error) {
	var model VersionModel
	if err := r.db.WithContext(ctx).
		Preload("Creator").
		Where("object_id = ? AND version_number = ?", objectID, versionNumber).
		First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}
		return nil, err
	}
	return model.ToEntity(), nil
}

func (r *versionRepository) GetLatest(ctx context.Context, objectID int64) (*entity.Version, error) {
	var model VersionModel
	if err := r.db.WithContext(ctx).
		Preload("Creator").
		Where("object_id = ?", objectID).
		Order("version_number DESC").
		First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}
		return nil, err
	}
	return model.ToEntity(), nil
}

func (r *versionRepository) ListByObject(ctx context.Context, objectID int64, page, pageSize int) ([]entity.Version, int64, error) {
	var total int64
	query := r.db.WithContext(ctx).Model(&VersionModel{}).Where("object_id = ?", objectID)

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	var models []VersionModel
	if err := query.Offset(offset).Limit(pageSize).
		Preload("Creator").
		Order("version_number DESC").
		Find(&models).Error; err != nil {
		return nil, 0, err
	}

	versions := make([]entity.Version, len(models))
	for i, m := range models {
		versions[i] = *m.ToEntity()
	}

	return versions, total, nil
}

func (r *versionRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&VersionModel{}, "id = ?", id).Error
}

func (r *versionRepository) DeleteOldVersions(ctx context.Context, objectID int64, keepCount int) error {
	// Get version numbers to keep
	var versionsToKeep []int
	if err := r.db.WithContext(ctx).Model(&VersionModel{}).
		Where("object_id = ?", objectID).
		Order("version_number DESC").
		Limit(keepCount).
		Pluck("version_number", &versionsToKeep).Error; err != nil {
		return err
	}

	if len(versionsToKeep) == 0 {
		return nil
	}

	// Delete versions not in keep list
	return r.db.WithContext(ctx).
		Where("object_id = ? AND version_number NOT IN ?", objectID, versionsToKeep).
		Delete(&VersionModel{}).Error
}

func (r *versionRepository) GetNextVersionNumber(ctx context.Context, objectID int64) (int, error) {
	var maxVersion int
	if err := r.db.WithContext(ctx).Model(&VersionModel{}).
		Where("object_id = ?", objectID).
		Select("COALESCE(MAX(version_number), 0)").
		Scan(&maxVersion).Error; err != nil {
		return 0, err
	}
	return maxVersion + 1, nil
}
