package tag

import (
	"context"

	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/domain/entity"
	"github.com/leondli/workspace/internal/domain/repository"
	apperrors "github.com/leondli/workspace/pkg/errors"
)

// UseCase defines the tag use case interface
type UseCase interface {
	Create(ctx context.Context, input *CreateInput) (*entity.TagResponse, error)
	GetByID(ctx context.Context, id uuid.UUID) (*entity.TagResponse, error)
	List(ctx context.Context, page, pageSize int) ([]entity.TagResponse, int64, error)
	Delete(ctx context.Context, id uuid.UUID) error
	AddToObject(ctx context.Context, objectID int64, tagID uuid.UUID) error
	RemoveFromObject(ctx context.Context, objectID int64, tagID uuid.UUID) error
	GetObjectTags(ctx context.Context, objectID int64) ([]entity.TagResponse, error)
}

// CreateInput represents tag creation input
type CreateInput struct {
	Name  string `json:"name" binding:"required,max=50"`
	Color string `json:"color"`
}

type tagUseCase struct {
	tagRepo    repository.TagRepository
	objectRepo repository.ObjectRepository
}

// NewUseCase creates a new tag use case
func NewUseCase(
	tagRepo repository.TagRepository,
	objectRepo repository.ObjectRepository,
) UseCase {
	return &tagUseCase{
		tagRepo:    tagRepo,
		objectRepo: objectRepo,
	}
}

func (u *tagUseCase) Create(ctx context.Context, input *CreateInput) (*entity.TagResponse, error) {
	// Check if tag with same name exists
	exists, err := u.tagRepo.ExistsByName(ctx, input.Name)
	if err != nil {
		return nil, apperrors.InternalError("failed to check tag", err)
	}
	if exists {
		return nil, apperrors.AlreadyExistsError("tag with this name")
	}

	// Set default color if not provided
	color := input.Color
	if color == "" {
		color = "#808080"
	}

	tag := &entity.Tag{
		Name:  input.Name,
		Color: color,
	}

	if err := u.tagRepo.Create(ctx, tag); err != nil {
		return nil, apperrors.InternalError("failed to create tag", err)
	}

	return tag.ToResponse(), nil
}

func (u *tagUseCase) GetByID(ctx context.Context, id uuid.UUID) (*entity.TagResponse, error) {
	tag, err := u.tagRepo.GetByID(ctx, id)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("tag")
		}
		return nil, apperrors.InternalError("failed to get tag", err)
	}
	return tag.ToResponse(), nil
}

func (u *tagUseCase) List(ctx context.Context, page, pageSize int) ([]entity.TagResponse, int64, error) {
	tags, total, err := u.tagRepo.List(ctx, page, pageSize)
	if err != nil {
		return nil, 0, apperrors.InternalError("failed to list tags", err)
	}

	responses := make([]entity.TagResponse, len(tags))
	for i, tag := range tags {
		responses[i] = *tag.ToResponse()
	}

	return responses, total, nil
}

func (u *tagUseCase) Delete(ctx context.Context, id uuid.UUID) error {
	// Check if tag exists
	_, err := u.tagRepo.GetByID(ctx, id)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return apperrors.NotFoundError("tag")
		}
		return apperrors.InternalError("failed to get tag", err)
	}

	if err := u.tagRepo.Delete(ctx, id); err != nil {
		return apperrors.InternalError("failed to delete tag", err)
	}

	return nil
}

func (u *tagUseCase) AddToObject(ctx context.Context, objectID int64, tagID uuid.UUID) error {
	// Check if object exists
	_, err := u.objectRepo.GetByID(ctx, objectID)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return apperrors.NotFoundError("object")
		}
		return apperrors.InternalError("failed to get object", err)
	}

	// Check if tag exists
	_, err = u.tagRepo.GetByID(ctx, tagID)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return apperrors.NotFoundError("tag")
		}
		return apperrors.InternalError("failed to get tag", err)
	}

	if err := u.tagRepo.AddToObject(ctx, objectID, tagID); err != nil {
		return apperrors.InternalError("failed to add tag to object", err)
	}

	return nil
}

func (u *tagUseCase) RemoveFromObject(ctx context.Context, objectID int64, tagID uuid.UUID) error {
	if err := u.tagRepo.RemoveFromObject(ctx, objectID, tagID); err != nil {
		return apperrors.InternalError("failed to remove tag from object", err)
	}
	return nil
}

func (u *tagUseCase) GetObjectTags(ctx context.Context, objectID int64) ([]entity.TagResponse, error) {
	tags, err := u.tagRepo.GetObjectTags(ctx, objectID)
	if err != nil {
		return nil, apperrors.InternalError("failed to get object tags", err)
	}

	responses := make([]entity.TagResponse, len(tags))
	for i, tag := range tags {
		responses[i] = *tag.ToResponse()
	}

	return responses, nil
}
