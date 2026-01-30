package permission

import (
	"context"

	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/domain/entity"
	"github.com/leondli/workspace/internal/domain/repository"
	apperrors "github.com/leondli/workspace/pkg/errors"
)

// UseCase defines the permission use case interface
type UseCase interface {
	Grant(ctx context.Context, objectID int64, input *GrantInput, grantedBy uuid.UUID) (*entity.PermissionResponse, error)
	Update(ctx context.Context, objectID int64, userID uuid.UUID, input *UpdateInput) (*entity.PermissionResponse, error)
	Revoke(ctx context.Context, objectID int64, userID uuid.UUID) error
	ListByObject(ctx context.Context, objectID int64) ([]entity.PermissionResponse, error)
	CheckPermission(ctx context.Context, objectID int64, userID uuid.UUID, minRole entity.Role) (bool, error)
	GetEffective(ctx context.Context, objectID int64, userID uuid.UUID) (*entity.PermissionResponse, error)
}

// GrantInput represents permission grant input
type GrantInput struct {
	UserID uuid.UUID   `json:"user_id" binding:"required"`
	Role   entity.Role `json:"role" binding:"required"`
}

// UpdateInput represents permission update input
type UpdateInput struct {
	Role entity.Role `json:"role" binding:"required"`
}

type permissionUseCase struct {
	permissionRepo repository.PermissionRepository
	objectRepo     repository.ObjectRepository
	userRepo       repository.UserRepository
}

// NewUseCase creates a new permission use case
func NewUseCase(
	permissionRepo repository.PermissionRepository,
	objectRepo repository.ObjectRepository,
	userRepo repository.UserRepository,
) UseCase {
	return &permissionUseCase{
		permissionRepo: permissionRepo,
		objectRepo:     objectRepo,
		userRepo:       userRepo,
	}
}

func (u *permissionUseCase) Grant(ctx context.Context, objectID int64, input *GrantInput, grantedBy uuid.UUID) (*entity.PermissionResponse, error) {
	// Validate role
	if !input.Role.IsValid() {
		return nil, apperrors.ValidationError("invalid role")
	}

	// Check if object exists
	obj, err := u.objectRepo.GetByID(ctx, objectID)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("object")
		}
		return nil, apperrors.InternalError("failed to get object", err)
	}

	// Check if user exists
	user, err := u.userRepo.GetByID(ctx, input.UserID)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("user")
		}
		return nil, apperrors.InternalError("failed to get user", err)
	}

	// Check if permission already exists
	existing, err := u.permissionRepo.GetByObjectAndUser(ctx, objectID, input.UserID)
	if err == nil {
		// Update existing permission
		existing.Role = input.Role
		if err := u.permissionRepo.Update(ctx, existing); err != nil {
			return nil, apperrors.InternalError("failed to update permission", err)
		}
		existing.User = user
		return existing.ToResponse(), nil
	}
	if !apperrors.IsNotFound(err) {
		return nil, apperrors.InternalError("failed to check permission", err)
	}

	// Create new permission
	perm := &entity.Permission{
		ObjectID:  objectID,
		UserID:    input.UserID,
		Role:      input.Role,
		GrantedBy: grantedBy,
	}

	if err := u.permissionRepo.Create(ctx, perm); err != nil {
		return nil, apperrors.InternalError("failed to create permission", err)
	}

	// Create inherited permissions for children if object is a directory
	if obj.IsDirectory() {
		if err := u.permissionRepo.CreateInherited(ctx, objectID, input.UserID, input.Role, grantedBy); err != nil {
			return nil, apperrors.InternalError("failed to create inherited permissions", err)
		}
	}

	perm.User = user
	return perm.ToResponse(), nil
}

func (u *permissionUseCase) Update(ctx context.Context, objectID int64, userID uuid.UUID, input *UpdateInput) (*entity.PermissionResponse, error) {
	// Validate role
	if !input.Role.IsValid() {
		return nil, apperrors.ValidationError("invalid role")
	}

	perm, err := u.permissionRepo.GetByObjectAndUser(ctx, objectID, userID)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("permission")
		}
		return nil, apperrors.InternalError("failed to get permission", err)
	}

	perm.Role = input.Role
	if err := u.permissionRepo.Update(ctx, perm); err != nil {
		return nil, apperrors.InternalError("failed to update permission", err)
	}

	return perm.ToResponse(), nil
}

func (u *permissionUseCase) Revoke(ctx context.Context, objectID int64, userID uuid.UUID) error {
	// Check if permission exists
	perm, err := u.permissionRepo.GetByObjectAndUser(ctx, objectID, userID)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return apperrors.NotFoundError("permission")
		}
		return apperrors.InternalError("failed to get permission", err)
	}

	// Cannot revoke owner permission if it's the only owner
	if perm.Role == entity.RoleOwner {
		perms, err := u.permissionRepo.ListByObject(ctx, objectID)
		if err != nil {
			return apperrors.InternalError("failed to list permissions", err)
		}
		ownerCount := 0
		for _, p := range perms {
			if p.Role == entity.RoleOwner {
				ownerCount++
			}
		}
		if ownerCount <= 1 {
			return apperrors.ValidationError("cannot revoke the only owner permission")
		}
	}

	// Delete permission
	if err := u.permissionRepo.Delete(ctx, perm.ID); err != nil {
		return apperrors.InternalError("failed to delete permission", err)
	}

	// Delete inherited permissions
	obj, err := u.objectRepo.GetByID(ctx, objectID)
	if err == nil && obj.IsDirectory() {
		if err := u.permissionRepo.DeleteInherited(ctx, objectID, userID); err != nil {
			return apperrors.InternalError("failed to delete inherited permissions", err)
		}
	}

	return nil
}

func (u *permissionUseCase) ListByObject(ctx context.Context, objectID int64) ([]entity.PermissionResponse, error) {
	perms, err := u.permissionRepo.ListByObject(ctx, objectID)
	if err != nil {
		return nil, apperrors.InternalError("failed to list permissions", err)
	}

	responses := make([]entity.PermissionResponse, len(perms))
	for i, perm := range perms {
		responses[i] = *perm.ToResponse()
	}

	return responses, nil
}

func (u *permissionUseCase) CheckPermission(ctx context.Context, objectID int64, userID uuid.UUID, minRole entity.Role) (bool, error) {
	return u.permissionRepo.HasPermission(ctx, objectID, userID, minRole)
}

func (u *permissionUseCase) GetEffective(ctx context.Context, objectID int64, userID uuid.UUID) (*entity.PermissionResponse, error) {
	perm, err := u.permissionRepo.GetEffectivePermission(ctx, objectID, userID)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("permission")
		}
		return nil, apperrors.InternalError("failed to get permission", err)
	}
	return perm.ToResponse(), nil
}
