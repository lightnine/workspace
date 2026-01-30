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

// PermissionModel is the Gorm model for permissions table
type PermissionModel struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey"`
	ObjectID    int64      `gorm:"not null;index"`
	UserID      uuid.UUID  `gorm:"type:uuid;not null;index"`
	Role        string     `gorm:"size:20;not null;index"`
	IsInherited bool       `gorm:"default:false"`
	GrantedBy   *uuid.UUID `gorm:"type:uuid"`
	CreatedAt   time.Time
	UpdatedAt   time.Time

	// Relations
	User          *UserModel   `gorm:"foreignKey:UserID"`
	Object        *ObjectModel `gorm:"foreignKey:ObjectID"`
	GrantedByUser *UserModel   `gorm:"foreignKey:GrantedBy"`
}

// TableName returns the table name
func (PermissionModel) TableName() string {
	return "permissions"
}

// ToEntity converts PermissionModel to entity.Permission
func (m *PermissionModel) ToEntity() *entity.Permission {
	perm := &entity.Permission{
		ID:          m.ID,
		ObjectID:    m.ObjectID,
		UserID:      m.UserID,
		Role:        entity.Role(m.Role),
		IsInherited: m.IsInherited,
		CreatedAt:   m.CreatedAt,
		UpdatedAt:   m.UpdatedAt,
	}

	if m.GrantedBy != nil {
		perm.GrantedBy = *m.GrantedBy
	}

	if m.User != nil {
		perm.User = m.User.ToEntity()
	}

	if m.Object != nil {
		perm.Object = m.Object.ToEntity()
	}

	return perm
}

// permissionRepository implements repository.PermissionRepository
type permissionRepository struct {
	db *gorm.DB
}

// NewPermissionRepository creates a new permission repository
func NewPermissionRepository(db *gorm.DB) repository.PermissionRepository {
	return &permissionRepository{db: db}
}

func (r *permissionRepository) Create(ctx context.Context, perm *entity.Permission) error {
	if perm.ID == uuid.Nil {
		perm.ID = uuid.New()
	}
	perm.CreatedAt = time.Now()
	perm.UpdatedAt = time.Now()

	model := &PermissionModel{
		ID:          perm.ID,
		ObjectID:    perm.ObjectID,
		UserID:      perm.UserID,
		Role:        string(perm.Role),
		IsInherited: perm.IsInherited,
		CreatedAt:   perm.CreatedAt,
		UpdatedAt:   perm.UpdatedAt,
	}

	if perm.GrantedBy != uuid.Nil {
		model.GrantedBy = &perm.GrantedBy
	}

	return r.db.WithContext(ctx).Create(model).Error
}

func (r *permissionRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Permission, error) {
	var model PermissionModel
	if err := r.db.WithContext(ctx).
		Preload("User").
		Where("id = ?", id).
		First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}
		return nil, err
	}
	return model.ToEntity(), nil
}

func (r *permissionRepository) GetByObjectAndUser(ctx context.Context, objectID int64, userID uuid.UUID) (*entity.Permission, error) {
	var model PermissionModel
	if err := r.db.WithContext(ctx).
		Preload("User").
		Where("object_id = ? AND user_id = ?", objectID, userID).
		First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}
		return nil, err
	}
	return model.ToEntity(), nil
}

func (r *permissionRepository) Update(ctx context.Context, perm *entity.Permission) error {
	return r.db.WithContext(ctx).Model(&PermissionModel{}).
		Where("id = ?", perm.ID).
		Updates(map[string]interface{}{
			"role":       string(perm.Role),
			"updated_at": time.Now(),
		}).Error
}

func (r *permissionRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&PermissionModel{}, "id = ?", id).Error
}

func (r *permissionRepository) DeleteByObjectAndUser(ctx context.Context, objectID int64, userID uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&PermissionModel{}, "object_id = ? AND user_id = ?", objectID, userID).Error
}

func (r *permissionRepository) ListByObject(ctx context.Context, objectID int64) ([]entity.Permission, error) {
	var models []PermissionModel
	if err := r.db.WithContext(ctx).
		Preload("User").
		Where("object_id = ?", objectID).
		Order("role ASC").
		Find(&models).Error; err != nil {
		return nil, err
	}

	perms := make([]entity.Permission, len(models))
	for i, m := range models {
		perms[i] = *m.ToEntity()
	}
	return perms, nil
}

func (r *permissionRepository) ListByUser(ctx context.Context, userID uuid.UUID) ([]entity.Permission, error) {
	var models []PermissionModel
	if err := r.db.WithContext(ctx).
		Preload("Object").
		Where("user_id = ?", userID).
		Find(&models).Error; err != nil {
		return nil, err
	}

	perms := make([]entity.Permission, len(models))
	for i, m := range models {
		perms[i] = *m.ToEntity()
	}
	return perms, nil
}

func (r *permissionRepository) GetEffectivePermission(ctx context.Context, objectID int64, userID uuid.UUID) (*entity.Permission, error) {
	// First check direct permission
	perm, err := r.GetByObjectAndUser(ctx, objectID, userID)
	if err == nil {
		return perm, nil
	}
	if !errors.Is(err, apperrors.ErrNotFound) {
		return nil, err
	}

	// Get object to find parent
	var obj ObjectModel
	if err := r.db.WithContext(ctx).Where("id = ?", objectID).First(&obj).Error; err != nil {
		return nil, err
	}

	// If no parent, no permission
	if obj.ParentID == nil {
		return nil, apperrors.ErrNotFound
	}

	// Recursively check parent permission
	return r.GetEffectivePermission(ctx, *obj.ParentID, userID)
}

func (r *permissionRepository) HasPermission(ctx context.Context, objectID int64, userID uuid.UUID, minRole entity.Role) (bool, error) {
	perm, err := r.GetEffectivePermission(ctx, objectID, userID)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			return false, nil
		}
		return false, err
	}

	return perm.Role.Priority() >= minRole.Priority(), nil
}

func (r *permissionRepository) CreateInherited(ctx context.Context, objectID int64, userID uuid.UUID, role entity.Role, grantedBy uuid.UUID) error {
	// Get all children of the object
	var children []ObjectModel
	if err := r.db.WithContext(ctx).
		Where("parent_id = ?", objectID).
		Find(&children).Error; err != nil {
		return err
	}

	for _, child := range children {
		// Check if permission already exists
		var count int64
		if err := r.db.WithContext(ctx).Model(&PermissionModel{}).
			Where("object_id = ? AND user_id = ?", child.ID, userID).
			Count(&count).Error; err != nil {
			return err
		}

		if count == 0 {
			// Create inherited permission
			perm := &entity.Permission{
				ID:          uuid.New(),
				ObjectID:    child.ID,
				UserID:      userID,
				Role:        role,
				IsInherited: true,
				GrantedBy:   grantedBy,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}
			if err := r.Create(ctx, perm); err != nil {
				return err
			}
		}

		// Recursively create for children if it's a directory
		if child.Type == string(entity.ObjectTypeDirectory) {
			if err := r.CreateInherited(ctx, child.ID, userID, role, grantedBy); err != nil {
				return err
			}
		}
	}

	return nil
}

func (r *permissionRepository) DeleteInherited(ctx context.Context, objectID int64, userID uuid.UUID) error {
	// Get all children
	var children []ObjectModel
	if err := r.db.WithContext(ctx).
		Where("parent_id = ?", objectID).
		Find(&children).Error; err != nil {
		return err
	}

	for _, child := range children {
		// Delete inherited permission
		if err := r.db.WithContext(ctx).
			Delete(&PermissionModel{}, "object_id = ? AND user_id = ? AND is_inherited = true", child.ID, userID).Error; err != nil {
			return err
		}

		// Recursively delete for children
		if child.Type == string(entity.ObjectTypeDirectory) {
			if err := r.DeleteInherited(ctx, child.ID, userID); err != nil {
				return err
			}
		}
	}

	return nil
}
