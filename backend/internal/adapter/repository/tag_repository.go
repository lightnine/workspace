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

// TagModel is the Gorm model for tags table
type TagModel struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	Name      string    `gorm:"uniqueIndex;size:50;not null"`
	Color     string    `gorm:"size:7;default:'#808080'"`
	CreatedAt time.Time
}

// TableName returns the table name
func (TagModel) TableName() string {
	return "tags"
}

// ToEntity converts TagModel to entity.Tag
func (m *TagModel) ToEntity() *entity.Tag {
	return &entity.Tag{
		ID:        m.ID,
		Name:      m.Name,
		Color:     m.Color,
		CreatedAt: m.CreatedAt,
	}
}

// ObjectTagModel is the Gorm model for object_tags table
type ObjectTagModel struct {
	ObjectID  int64     `gorm:"primaryKey"`
	TagID     uuid.UUID `gorm:"type:uuid;primaryKey"`
	CreatedAt time.Time
}

// TableName returns the table name
func (ObjectTagModel) TableName() string {
	return "object_tags"
}

// tagRepository implements repository.TagRepository
type tagRepository struct {
	db *gorm.DB
}

// NewTagRepository creates a new tag repository
func NewTagRepository(db *gorm.DB) repository.TagRepository {
	return &tagRepository{db: db}
}

func (r *tagRepository) Create(ctx context.Context, tag *entity.Tag) error {
	if tag.ID == uuid.Nil {
		tag.ID = uuid.New()
	}
	tag.CreatedAt = time.Now()

	model := &TagModel{
		ID:        tag.ID,
		Name:      tag.Name,
		Color:     tag.Color,
		CreatedAt: tag.CreatedAt,
	}

	return r.db.WithContext(ctx).Create(model).Error
}

func (r *tagRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Tag, error) {
	var model TagModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}
		return nil, err
	}
	return model.ToEntity(), nil
}

func (r *tagRepository) GetByName(ctx context.Context, name string) (*entity.Tag, error) {
	var model TagModel
	if err := r.db.WithContext(ctx).Where("name = ?", name).First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}
		return nil, err
	}
	return model.ToEntity(), nil
}

func (r *tagRepository) Update(ctx context.Context, tag *entity.Tag) error {
	return r.db.WithContext(ctx).Model(&TagModel{}).
		Where("id = ?", tag.ID).
		Updates(map[string]interface{}{
			"name":  tag.Name,
			"color": tag.Color,
		}).Error
}

func (r *tagRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&TagModel{}, "id = ?", id).Error
}

func (r *tagRepository) List(ctx context.Context, page, pageSize int) ([]entity.Tag, int64, error) {
	var total int64
	if err := r.db.WithContext(ctx).Model(&TagModel{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	var models []TagModel
	if err := r.db.WithContext(ctx).
		Offset(offset).Limit(pageSize).
		Order("name ASC").
		Find(&models).Error; err != nil {
		return nil, 0, err
	}

	tags := make([]entity.Tag, len(models))
	for i, m := range models {
		tags[i] = *m.ToEntity()
	}

	return tags, total, nil
}

func (r *tagRepository) Search(ctx context.Context, query string, page, pageSize int) ([]entity.Tag, int64, error) {
	dbQuery := r.db.WithContext(ctx).Model(&TagModel{}).
		Where("name ILIKE ?", "%"+query+"%")

	var total int64
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	var models []TagModel
	if err := dbQuery.Offset(offset).Limit(pageSize).
		Order("name ASC").
		Find(&models).Error; err != nil {
		return nil, 0, err
	}

	tags := make([]entity.Tag, len(models))
	for i, m := range models {
		tags[i] = *m.ToEntity()
	}

	return tags, total, nil
}

func (r *tagRepository) ExistsByName(ctx context.Context, name string) (bool, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&TagModel{}).Where("name = ?", name).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *tagRepository) AddToObject(ctx context.Context, objectID int64, tagID uuid.UUID) error {
	model := &ObjectTagModel{
		ObjectID:  objectID,
		TagID:     tagID,
		CreatedAt: time.Now(),
	}
	return r.db.WithContext(ctx).Create(model).Error
}

func (r *tagRepository) RemoveFromObject(ctx context.Context, objectID int64, tagID uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&ObjectTagModel{}, "object_id = ? AND tag_id = ?", objectID, tagID).Error
}

func (r *tagRepository) GetObjectTags(ctx context.Context, objectID int64) ([]entity.Tag, error) {
	var models []TagModel
	if err := r.db.WithContext(ctx).
		Joins("JOIN object_tags ON object_tags.tag_id = tags.id").
		Where("object_tags.object_id = ?", objectID).
		Find(&models).Error; err != nil {
		return nil, err
	}

	tags := make([]entity.Tag, len(models))
	for i, m := range models {
		tags[i] = *m.ToEntity()
	}

	return tags, nil
}

func (r *tagRepository) GetObjectsByTag(ctx context.Context, tagID uuid.UUID, page, pageSize int) ([]entity.Object, int64, error) {
	var total int64
	countQuery := r.db.WithContext(ctx).Model(&ObjectModel{}).
		Joins("JOIN object_tags ON object_tags.object_id = objects.id").
		Where("object_tags.tag_id = ? AND objects.is_deleted = false", tagID)

	if err := countQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	var models []ObjectModel
	if err := r.db.WithContext(ctx).
		Preload("Creator").
		Preload("Tags").
		Joins("JOIN object_tags ON object_tags.object_id = objects.id").
		Where("object_tags.tag_id = ? AND objects.is_deleted = false", tagID).
		Offset(offset).Limit(pageSize).
		Order("objects.name ASC").
		Find(&models).Error; err != nil {
		return nil, 0, err
	}

	objects := make([]entity.Object, len(models))
	for i, m := range models {
		objects[i] = *m.ToEntity()
	}

	return objects, total, nil
}
