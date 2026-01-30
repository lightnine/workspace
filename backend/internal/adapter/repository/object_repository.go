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

// ObjectModel is the Gorm model for objects table
type ObjectModel struct {
	ID             int64     `gorm:"primaryKey"`
	Name           string    `gorm:"size:255;not null"`
	Type           string    `gorm:"size:50;not null;index"`
	Path           string    `gorm:"size:1000;uniqueIndex;not null"`
	ParentID       *int64    `gorm:"index"`
	CreatorID      uuid.UUID `gorm:"type:uuid;not null;index"`
	Size           int64     `gorm:"default:0"`
	ContentHash    string    `gorm:"size:64"`
	Description    string    `gorm:"type:text"`
	CurrentVersion int       `gorm:"default:1"`
	IsDeleted      bool      `gorm:"default:false;index"`
	DeletedAt      *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time

	// Relations
	Creator *UserModel   `gorm:"foreignKey:CreatorID"`
	Tags    []TagModel   `gorm:"many2many:object_tags;foreignKey:ID;joinForeignKey:object_id;References:ID;joinReferences:tag_id"`
	Parent  *ObjectModel `gorm:"foreignKey:ParentID"`
}

// TableName returns the table name
func (ObjectModel) TableName() string {
	return "objects"
}

// ToEntity converts ObjectModel to entity.Object
func (m *ObjectModel) ToEntity() *entity.Object {
	obj := &entity.Object{
		ID:             m.ID,
		Name:           m.Name,
		Type:           entity.ObjectType(m.Type),
		Path:           m.Path,
		ParentID:       m.ParentID,
		CreatorID:      m.CreatorID,
		Size:           m.Size,
		ContentHash:    m.ContentHash,
		Description:    m.Description,
		CurrentVersion: m.CurrentVersion,
		IsDeleted:      m.IsDeleted,
		DeletedAt:      m.DeletedAt,
		CreatedAt:      m.CreatedAt,
		UpdatedAt:      m.UpdatedAt,
	}

	if m.Creator != nil {
		obj.Creator = m.Creator.ToEntity()
	}

	if len(m.Tags) > 0 {
		obj.Tags = make([]entity.Tag, len(m.Tags))
		for i, tag := range m.Tags {
			obj.Tags[i] = *tag.ToEntity()
		}
	}

	return obj
}

// ObjectModelFromEntity converts entity.Object to ObjectModel
func ObjectModelFromEntity(o *entity.Object) *ObjectModel {
	return &ObjectModel{
		ID:             o.ID,
		Name:           o.Name,
		Type:           string(o.Type),
		Path:           o.Path,
		ParentID:       o.ParentID,
		CreatorID:      o.CreatorID,
		Size:           o.Size,
		ContentHash:    o.ContentHash,
		Description:    o.Description,
		CurrentVersion: o.CurrentVersion,
		IsDeleted:      o.IsDeleted,
		DeletedAt:      o.DeletedAt,
		CreatedAt:      o.CreatedAt,
		UpdatedAt:      o.UpdatedAt,
	}
}

// objectRepository implements repository.ObjectRepository
type objectRepository struct {
	db *gorm.DB
}

// NewObjectRepository creates a new object repository
func NewObjectRepository(db *gorm.DB) repository.ObjectRepository {
	return &objectRepository{db: db}
}

func (r *objectRepository) Create(ctx context.Context, obj *entity.Object) error {
	obj.CreatedAt = time.Now()
	obj.UpdatedAt = time.Now()
	model := ObjectModelFromEntity(obj)
	return r.db.WithContext(ctx).Create(model).Error
}

func (r *objectRepository) GetByID(ctx context.Context, id int64) (*entity.Object, error) {
	var model ObjectModel
	if err := r.db.WithContext(ctx).
		Preload("Creator").
		Preload("Tags").
		Where("id = ? AND is_deleted = false", id).
		First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}
		return nil, err
	}
	return model.ToEntity(), nil
}

func (r *objectRepository) GetByPath(ctx context.Context, path string) (*entity.Object, error) {
	var model ObjectModel
	if err := r.db.WithContext(ctx).
		Preload("Creator").
		Preload("Tags").
		Where("path = ? AND is_deleted = false", path).
		First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}
		return nil, err
	}
	return model.ToEntity(), nil
}

func (r *objectRepository) Update(ctx context.Context, obj *entity.Object) error {
	model := ObjectModelFromEntity(obj)
	return r.db.WithContext(ctx).Save(model).Error
}

func (r *objectRepository) Delete(ctx context.Context, id int64) error {
	now := time.Now()
	return r.db.WithContext(ctx).Model(&ObjectModel{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"is_deleted": true,
			"deleted_at": &now,
		}).Error
}

func (r *objectRepository) HardDelete(ctx context.Context, id int64) error {
	return r.db.WithContext(ctx).Delete(&ObjectModel{}, id).Error
}

func (r *objectRepository) List(ctx context.Context, filter *entity.ObjectFilter) ([]entity.Object, int64, error) {
	query := r.db.WithContext(ctx).Model(&ObjectModel{})

	// Apply filters
	if filter.IsDeleted != nil {
		query = query.Where("is_deleted = ?", *filter.IsDeleted)
	} else {
		query = query.Where("is_deleted = false")
	}

	if filter.ParentID != nil {
		query = query.Where("parent_id = ?", *filter.ParentID)
	}

	if len(filter.Type) > 0 {
		types := make([]string, len(filter.Type))
		for i, t := range filter.Type {
			types[i] = string(t)
		}
		query = query.Where("type IN ?", types)
	}

	if filter.CreatorID != nil {
		query = query.Where("creator_id = ?", *filter.CreatorID)
	}

	if filter.Search != "" {
		query = query.Where("name ILIKE ?", "%"+filter.Search+"%")
	}

	// Count total
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Apply pagination
	offset := (filter.Page - 1) * filter.PageSize
	query = query.Offset(offset).Limit(filter.PageSize)

	// Load with relations
	query = query.Preload("Creator").Preload("Tags").Order("type ASC, name ASC")

	var models []ObjectModel
	if err := query.Find(&models).Error; err != nil {
		return nil, 0, err
	}

	objects := make([]entity.Object, len(models))
	for i, m := range models {
		objects[i] = *m.ToEntity()
	}

	return objects, total, nil
}

func (r *objectRepository) ListChildren(ctx context.Context, parentID *int64, page, pageSize int) ([]entity.Object, int64, error) {
	query := r.db.WithContext(ctx).Model(&ObjectModel{}).Where("is_deleted = false")

	if parentID != nil {
		query = query.Where("parent_id = ?", *parentID)
	} else {
		query = query.Where("parent_id IS NULL")
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	query = query.Offset(offset).Limit(pageSize).
		Preload("Creator").
		Preload("Tags").
		Order("type ASC, name ASC")

	var models []ObjectModel
	if err := query.Find(&models).Error; err != nil {
		return nil, 0, err
	}

	objects := make([]entity.Object, len(models))
	for i, m := range models {
		objects[i] = *m.ToEntity()
	}

	return objects, total, nil
}

func (r *objectRepository) GetTree(ctx context.Context, parentID *int64, depth int) ([]entity.Object, error) {
	// Recursive CTE for getting tree
	var models []ObjectModel

	query := r.db.WithContext(ctx).
		Where("is_deleted = false").
		Preload("Creator")

	if parentID != nil {
		query = query.Where("parent_id = ?", *parentID)
	} else {
		query = query.Where("parent_id IS NULL")
	}

	if err := query.Order("type ASC, name ASC").Find(&models).Error; err != nil {
		return nil, err
	}

	objects := make([]entity.Object, len(models))
	for i, m := range models {
		obj := m.ToEntity()
		// Recursively get children if depth > 0
		if depth > 0 && obj.Type == entity.ObjectTypeDirectory {
			children, err := r.GetTree(ctx, &obj.ID, depth-1)
			if err != nil {
				return nil, err
			}
			obj.Children = children
		}
		objects[i] = *obj
	}

	return objects, nil
}

func (r *objectRepository) ExistsByPath(ctx context.Context, path string) (bool, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&ObjectModel{}).
		Where("path = ? AND is_deleted = false", path).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *objectRepository) ExistsInParent(ctx context.Context, parentID *int64, name string) (bool, error) {
	query := r.db.WithContext(ctx).Model(&ObjectModel{}).Where("name = ? AND is_deleted = false", name)

	if parentID != nil {
		query = query.Where("parent_id = ?", *parentID)
	} else {
		query = query.Where("parent_id IS NULL")
	}

	var count int64
	if err := query.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *objectRepository) GetByCreator(ctx context.Context, creatorID uuid.UUID, page, pageSize int) ([]entity.Object, int64, error) {
	var total int64
	query := r.db.WithContext(ctx).Model(&ObjectModel{}).
		Where("creator_id = ? AND is_deleted = false", creatorID)

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	var models []ObjectModel
	if err := query.Offset(offset).Limit(pageSize).
		Preload("Creator").
		Preload("Tags").
		Order("updated_at DESC").
		Find(&models).Error; err != nil {
		return nil, 0, err
	}

	objects := make([]entity.Object, len(models))
	for i, m := range models {
		objects[i] = *m.ToEntity()
	}

	return objects, total, nil
}

func (r *objectRepository) ListByCreator(ctx context.Context, creatorID uuid.UUID) ([]entity.Object, error) {
	var models []ObjectModel
	if err := r.db.WithContext(ctx).
		Where("creator_id = ? AND is_deleted = false", creatorID).
		Preload("Creator").
		Order("type ASC, name ASC").
		Find(&models).Error; err != nil {
		return nil, err
	}

	objects := make([]entity.Object, len(models))
	for i, m := range models {
		objects[i] = *m.ToEntity()
	}

	return objects, nil
}

func (r *objectRepository) Search(ctx context.Context, query string, types []entity.ObjectType, page, pageSize int) ([]entity.Object, int64, error) {
	dbQuery := r.db.WithContext(ctx).Model(&ObjectModel{}).
		Where("is_deleted = false").
		Where("name ILIKE ?", "%"+query+"%")

	if len(types) > 0 {
		typeStrs := make([]string, len(types))
		for i, t := range types {
			typeStrs[i] = string(t)
		}
		dbQuery = dbQuery.Where("type IN ?", typeStrs)
	}

	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	var models []ObjectModel
	if err := dbQuery.Offset(offset).Limit(pageSize).
		Preload("Creator").
		Preload("Tags").
		Order("name ASC").
		Find(&models).Error; err != nil {
		return nil, 0, err
	}

	objects := make([]entity.Object, len(models))
	for i, m := range models {
		objects[i] = *m.ToEntity()
	}

	return objects, total, nil
}

func (r *objectRepository) UpdatePath(ctx context.Context, id int64, newPath string) error {
	return r.db.WithContext(ctx).Model(&ObjectModel{}).
		Where("id = ?", id).
		Update("path", newPath).Error
}

func (r *objectRepository) GetDescendants(ctx context.Context, parentPath string) ([]entity.Object, error) {
	var models []ObjectModel
	if err := r.db.WithContext(ctx).
		Where("path LIKE ? AND is_deleted = false", parentPath+"/%").
		Order("path ASC").
		Find(&models).Error; err != nil {
		return nil, err
	}

	objects := make([]entity.Object, len(models))
	for i, m := range models {
		objects[i] = *m.ToEntity()
	}

	return objects, nil
}
