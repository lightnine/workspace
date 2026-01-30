package user

import (
	"context"

	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/domain/entity"
	"github.com/leondli/workspace/internal/domain/repository"
	apperrors "github.com/leondli/workspace/pkg/errors"
)

// UseCase defines the user use case interface
type UseCase interface {
	GetByID(ctx context.Context, id uuid.UUID) (*entity.UserResponse, error)
	GetByEmail(ctx context.Context, email string) (*entity.UserResponse, error)
	Update(ctx context.Context, id uuid.UUID, input *UpdateInput) (*entity.UserResponse, error)
}

// UpdateInput represents user update input
type UpdateInput struct {
	DisplayName *string `json:"display_name"`
	AvatarURL   *string `json:"avatar_url"`
}

type userUseCase struct {
	userRepo repository.UserRepository
}

// NewUseCase creates a new user use case
func NewUseCase(userRepo repository.UserRepository) UseCase {
	return &userUseCase{userRepo: userRepo}
}

func (u *userUseCase) GetByID(ctx context.Context, id uuid.UUID) (*entity.UserResponse, error) {
	user, err := u.userRepo.GetByID(ctx, id)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("user")
		}
		return nil, apperrors.InternalError("failed to get user", err)
	}
	return user.ToResponse(), nil
}

func (u *userUseCase) GetByEmail(ctx context.Context, email string) (*entity.UserResponse, error) {
	user, err := u.userRepo.GetByEmail(ctx, email)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("user")
		}
		return nil, apperrors.InternalError("failed to get user", err)
	}
	return user.ToResponse(), nil
}

func (u *userUseCase) Update(ctx context.Context, id uuid.UUID, input *UpdateInput) (*entity.UserResponse, error) {
	user, err := u.userRepo.GetByID(ctx, id)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("user")
		}
		return nil, apperrors.InternalError("failed to get user", err)
	}

	// Update fields
	if input.DisplayName != nil {
		user.DisplayName = *input.DisplayName
	}
	if input.AvatarURL != nil {
		user.AvatarURL = *input.AvatarURL
	}

	if err := u.userRepo.Update(ctx, user); err != nil {
		return nil, apperrors.InternalError("failed to update user", err)
	}

	return user.ToResponse(), nil
}
