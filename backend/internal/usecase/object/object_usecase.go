package object

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/adapter/storage"
	"github.com/leondli/workspace/internal/domain/entity"
	"github.com/leondli/workspace/internal/domain/repository"
	apperrors "github.com/leondli/workspace/pkg/errors"
)

// UseCase defines the object use case interface
type UseCase interface {
	// Directory operations
	CreateDirectory(ctx context.Context, creatorID uuid.UUID, input *CreateDirectoryInput) (*entity.ObjectResponse, error)

	// File operations
	CreateFile(ctx context.Context, creatorID uuid.UUID, input *CreateFileInput) (*entity.ObjectResponse, error)
	GetContent(ctx context.Context, objectID int64) ([]byte, error)
	SaveContent(ctx context.Context, objectID int64, userID uuid.UUID, content []byte, message string) (*entity.ObjectResponse, error)

	// Common operations
	GetByID(ctx context.Context, id int64) (*entity.ObjectResponse, error)
	GetByPath(ctx context.Context, path string) (*entity.ObjectResponse, error)
	List(ctx context.Context, filter *entity.ObjectFilter) ([]entity.ObjectResponse, int64, error)
	ListChildren(ctx context.Context, parentID *int64, page, pageSize int) ([]entity.ObjectResponse, int64, error)
	GetTree(ctx context.Context, userID uuid.UUID, depth int) ([]entity.ObjectResponse, error)
	Update(ctx context.Context, id int64, input *UpdateInput) (*entity.ObjectResponse, error)
	Delete(ctx context.Context, id int64) error
	Move(ctx context.Context, id int64, input *MoveInput) (*entity.ObjectResponse, error)
	Copy(ctx context.Context, id int64, creatorID uuid.UUID, input *CopyInput) (*entity.ObjectResponse, error)
}

// CreateDirectoryInput represents directory creation input
type CreateDirectoryInput struct {
	Name        string `json:"name" binding:"required,max=255"`
	ParentID    *int64 `json:"parent_id"`
	Description string `json:"description"`
}

// CreateFileInput represents file creation input
type CreateFileInput struct {
	Name        string            `json:"name" binding:"required,max=255"`
	Type        entity.ObjectType `json:"type"`
	ParentID    *int64            `json:"parent_id"`
	Description string            `json:"description"`
	Content     []byte            `json:"-"`
}

// UpdateInput represents object update input
type UpdateInput struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

// MoveInput represents object move input
type MoveInput struct {
	TargetParentID *int64  `json:"target_parent_id"`
	NewName        *string `json:"new_name"`
}

// CopyInput represents object copy input
type CopyInput struct {
	TargetParentID *int64  `json:"target_parent_id"`
	NewName        *string `json:"new_name"`
}

type objectUseCase struct {
	objectRepo     repository.ObjectRepository
	versionRepo    repository.VersionRepository
	permissionRepo repository.PermissionRepository
	storage        *storage.LocalFileStorage
}

// NewUseCase creates a new object use case
func NewUseCase(
	objectRepo repository.ObjectRepository,
	versionRepo repository.VersionRepository,
	permissionRepo repository.PermissionRepository,
	storage *storage.LocalFileStorage,
) UseCase {
	return &objectUseCase{
		objectRepo:     objectRepo,
		versionRepo:    versionRepo,
		permissionRepo: permissionRepo,
		storage:        storage,
	}
}

func (u *objectUseCase) CreateDirectory(ctx context.Context, creatorID uuid.UUID, input *CreateDirectoryInput) (*entity.ObjectResponse, error) {
	// Build path - 在用户目录下创建
	// 用户目录路径: /{userID}/{name}
	userDir := "/" + creatorID.String()
	path := userDir + "/" + input.Name

	// 确保用户目录存在
	if err := u.storage.CreateDirectory(ctx, userDir); err != nil {
		// 忽略已存在的错误
	}

	// Create directory in storage
	if err := u.storage.CreateDirectory(ctx, path); err != nil {
		return nil, apperrors.InternalError("failed to create directory in storage", err)
	}

	// Get inode
	inode, err := u.storage.GetInode(ctx, path)
	if err != nil {
		return nil, apperrors.InternalError("failed to get inode", err)
	}

	// Create object record - 只记录 inode 和创建人
	obj := &entity.Object{
		ID:          inode,
		Name:        input.Name,
		Type:        entity.ObjectTypeDirectory,
		Path:        path,
		ParentID:    nil, // 不记录父子关系
		CreatorID:   creatorID,
		Description: input.Description,
	}

	if err := u.objectRepo.Create(ctx, obj); err != nil {
		// Rollback storage
		_ = u.storage.Delete(ctx, path)
		return nil, apperrors.InternalError("failed to create object", err)
	}

	return obj.ToResponse(), nil
}

func (u *objectUseCase) CreateFile(ctx context.Context, creatorID uuid.UUID, input *CreateFileInput) (*entity.ObjectResponse, error) {
	// Infer type from extension if not provided
	if input.Type == "" {
		input.Type = entity.InferTypeFromExtension(input.Name)
	}

	// Build path - 在用户目录下创建
	// 用户目录路径: /{userID}/{name}
	userDir := "/" + creatorID.String()
	path := userDir + "/" + input.Name

	// 确保用户目录存在
	if err := u.storage.CreateDirectory(ctx, userDir); err != nil {
		// 忽略已存在的错误
	}

	// Write file to storage
	if err := u.storage.WriteFile(ctx, path, input.Content); err != nil {
		return nil, apperrors.InternalError("failed to write file to storage", err)
	}

	// Get inode and size
	inode, err := u.storage.GetInode(ctx, path)
	if err != nil {
		return nil, apperrors.InternalError("failed to get inode", err)
	}

	contentHash := u.storage.CalculateHash(input.Content)

	// Create object record - 只记录 inode 和创建人
	obj := &entity.Object{
		ID:             inode,
		Name:           input.Name,
		Type:           input.Type,
		Path:           path,
		ParentID:       nil, // 不记录父子关系
		CreatorID:      creatorID,
		Size:           int64(len(input.Content)),
		ContentHash:    contentHash,
		Description:    input.Description,
		CurrentVersion: 1,
	}

	if err := u.objectRepo.Create(ctx, obj); err != nil {
		_ = u.storage.Delete(ctx, path)
		return nil, apperrors.InternalError("failed to create object", err)
	}

	return obj.ToResponse(), nil
}

func (u *objectUseCase) GetContent(ctx context.Context, objectID int64) ([]byte, error) {
	obj, err := u.objectRepo.GetByID(ctx, objectID)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("object")
		}
		return nil, apperrors.InternalError("failed to get object", err)
	}

	if obj.IsDirectory() {
		return nil, apperrors.ValidationError("cannot read content of a directory")
	}

	content, err := u.storage.ReadFile(ctx, obj.Path)
	if err != nil {
		return nil, apperrors.InternalError("failed to read file", err)
	}

	return content, nil
}

func (u *objectUseCase) SaveContent(ctx context.Context, objectID int64, userID uuid.UUID, content []byte, message string) (*entity.ObjectResponse, error) {
	obj, err := u.objectRepo.GetByID(ctx, objectID)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("object")
		}
		return nil, apperrors.InternalError("failed to get object", err)
	}

	if obj.IsDirectory() {
		return nil, apperrors.ValidationError("cannot write content to a directory")
	}

	// Calculate hash
	contentHash := u.storage.CalculateHash(content)

	// Skip if content hasn't changed
	if contentHash == obj.ContentHash {
		return obj.ToResponse(), nil
	}

	// Write to storage
	if err := u.storage.WriteFile(ctx, obj.Path, content); err != nil {
		return nil, apperrors.InternalError("failed to write file", err)
	}

	// Get next version number
	nextVersion, err := u.versionRepo.GetNextVersionNumber(ctx, objectID)
	if err != nil {
		return nil, apperrors.InternalError("failed to get next version", err)
	}

	// Save version snapshot
	versionPath, err := u.storage.SaveVersion(ctx, obj.Path, nextVersion, content)
	if err != nil {
		return nil, apperrors.InternalError("failed to save version", err)
	}

	// Create version record
	version := &entity.Version{
		ObjectID:      objectID,
		VersionNumber: nextVersion,
		ContentHash:   contentHash,
		Size:          int64(len(content)),
		StoragePath:   versionPath,
		Message:       message,
		CreatorID:     userID,
	}

	if err := u.versionRepo.Create(ctx, version); err != nil {
		return nil, apperrors.InternalError("failed to create version", err)
	}

	// Update object
	obj.Size = int64(len(content))
	obj.ContentHash = contentHash
	obj.CurrentVersion = nextVersion

	if err := u.objectRepo.Update(ctx, obj); err != nil {
		return nil, apperrors.InternalError("failed to update object", err)
	}

	return obj.ToResponse(), nil
}

func (u *objectUseCase) GetByID(ctx context.Context, id int64) (*entity.ObjectResponse, error) {
	obj, err := u.objectRepo.GetByID(ctx, id)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("object")
		}
		return nil, apperrors.InternalError("failed to get object", err)
	}
	return obj.ToResponse(), nil
}

func (u *objectUseCase) GetByPath(ctx context.Context, path string) (*entity.ObjectResponse, error) {
	obj, err := u.objectRepo.GetByPath(ctx, path)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("object")
		}
		return nil, apperrors.InternalError("failed to get object", err)
	}
	return obj.ToResponse(), nil
}

func (u *objectUseCase) List(ctx context.Context, filter *entity.ObjectFilter) ([]entity.ObjectResponse, int64, error) {
	objects, total, err := u.objectRepo.List(ctx, filter)
	if err != nil {
		return nil, 0, apperrors.InternalError("failed to list objects", err)
	}

	responses := make([]entity.ObjectResponse, len(objects))
	for i, obj := range objects {
		responses[i] = *obj.ToResponse()
	}

	return responses, total, nil
}

func (u *objectUseCase) ListChildren(ctx context.Context, parentID *int64, page, pageSize int) ([]entity.ObjectResponse, int64, error) {
	objects, total, err := u.objectRepo.ListChildren(ctx, parentID, page, pageSize)
	if err != nil {
		return nil, 0, apperrors.InternalError("failed to list children", err)
	}

	responses := make([]entity.ObjectResponse, len(objects))
	for i, obj := range objects {
		responses[i] = *obj.ToResponse()
	}

	return responses, total, nil
}

func (u *objectUseCase) GetTree(ctx context.Context, userID uuid.UUID, depth int) ([]entity.ObjectResponse, error) {
	// 获取用户目录下的所有对象
	objects, err := u.objectRepo.ListByCreator(ctx, userID)
	if err != nil {
		return nil, apperrors.InternalError("failed to get tree", err)
	}

	responses := make([]entity.ObjectResponse, len(objects))
	for i, obj := range objects {
		responses[i] = *obj.ToResponse()
	}

	return responses, nil
}

func (u *objectUseCase) Update(ctx context.Context, id int64, input *UpdateInput) (*entity.ObjectResponse, error) {
	obj, err := u.objectRepo.GetByID(ctx, id)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("object")
		}
		return nil, apperrors.InternalError("failed to get object", err)
	}

	// Update name (rename)
	if input.Name != nil && *input.Name != obj.Name {
		// Build new path
		newPath := filepath.Dir(obj.Path) + "/" + *input.Name
		if newPath == "/"+*input.Name {
			newPath = "/" + *input.Name
		}

		// Check if new name exists
		exists, err := u.objectRepo.ExistsByPath(ctx, newPath)
		if err != nil {
			return nil, apperrors.InternalError("failed to check path", err)
		}
		if exists {
			return nil, apperrors.AlreadyExistsError("object with this name")
		}

		// Rename in storage
		if err := u.storage.Move(ctx, obj.Path, newPath); err != nil {
			return nil, apperrors.InternalError("failed to rename in storage", err)
		}

		// Update path in DB
		oldPath := obj.Path
		obj.Name = *input.Name
		obj.Path = newPath

		// Update descendants paths if directory
		if obj.IsDirectory() {
			descendants, err := u.objectRepo.GetDescendants(ctx, oldPath)
			if err != nil {
				return nil, apperrors.InternalError("failed to get descendants", err)
			}
			for _, desc := range descendants {
				descNewPath := strings.Replace(desc.Path, oldPath, newPath, 1)
				if err := u.objectRepo.UpdatePath(ctx, desc.ID, descNewPath); err != nil {
					return nil, apperrors.InternalError("failed to update descendant path", err)
				}
			}
		}
	}

	if input.Description != nil {
		obj.Description = *input.Description
	}

	if err := u.objectRepo.Update(ctx, obj); err != nil {
		return nil, apperrors.InternalError("failed to update object", err)
	}

	return obj.ToResponse(), nil
}

func (u *objectUseCase) Delete(ctx context.Context, id int64) error {
	obj, err := u.objectRepo.GetByID(ctx, id)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return apperrors.NotFoundError("object")
		}
		return apperrors.InternalError("failed to get object", err)
	}

	// Delete from storage
	if err := u.storage.Delete(ctx, obj.Path); err != nil {
		return apperrors.InternalError("failed to delete from storage", err)
	}

	// Soft delete in DB
	if err := u.objectRepo.Delete(ctx, id); err != nil {
		return apperrors.InternalError("failed to delete object", err)
	}

	return nil
}

func (u *objectUseCase) Move(ctx context.Context, id int64, input *MoveInput) (*entity.ObjectResponse, error) {
	obj, err := u.objectRepo.GetByID(ctx, id)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("object")
		}
		return nil, apperrors.InternalError("failed to get object", err)
	}

	newName := obj.Name
	if input.NewName != nil {
		newName = *input.NewName
	}

	// Build new path
	var newPath string
	if input.TargetParentID != nil {
		parent, err := u.objectRepo.GetByID(ctx, *input.TargetParentID)
		if err != nil {
			if apperrors.IsNotFound(err) {
				return nil, apperrors.NotFoundError("target directory")
			}
			return nil, apperrors.InternalError("failed to get target", err)
		}
		if !parent.IsDirectory() {
			return nil, apperrors.ValidationError("target must be a directory")
		}
		newPath = parent.Path + "/" + newName
	} else {
		newPath = "/" + newName
	}

	// Check if target exists
	exists, err := u.objectRepo.ExistsByPath(ctx, newPath)
	if err != nil {
		return nil, apperrors.InternalError("failed to check path", err)
	}
	if exists && newPath != obj.Path {
		return nil, apperrors.AlreadyExistsError("object at target path")
	}

	// Move in storage
	if newPath != obj.Path {
		if err := u.storage.Move(ctx, obj.Path, newPath); err != nil {
			return nil, apperrors.InternalError("failed to move in storage", err)
		}
	}

	// Update descendants paths if directory
	oldPath := obj.Path
	if obj.IsDirectory() && newPath != oldPath {
		descendants, err := u.objectRepo.GetDescendants(ctx, oldPath)
		if err != nil {
			return nil, apperrors.InternalError("failed to get descendants", err)
		}
		for _, desc := range descendants {
			descNewPath := strings.Replace(desc.Path, oldPath, newPath, 1)
			if err := u.objectRepo.UpdatePath(ctx, desc.ID, descNewPath); err != nil {
				return nil, apperrors.InternalError("failed to update descendant path", err)
			}
		}
	}

	// Update object
	obj.Name = newName
	obj.Path = newPath
	obj.ParentID = input.TargetParentID

	if err := u.objectRepo.Update(ctx, obj); err != nil {
		return nil, apperrors.InternalError("failed to update object", err)
	}

	return obj.ToResponse(), nil
}

func (u *objectUseCase) Copy(ctx context.Context, id int64, creatorID uuid.UUID, input *CopyInput) (*entity.ObjectResponse, error) {
	obj, err := u.objectRepo.GetByID(ctx, id)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.NotFoundError("object")
		}
		return nil, apperrors.InternalError("failed to get object", err)
	}

	if obj.IsDirectory() {
		return nil, apperrors.ValidationError("cannot copy directories (not implemented)")
	}

	newName := obj.Name
	if input.NewName != nil {
		newName = *input.NewName
	} else {
		// Generate copy name
		ext := filepath.Ext(obj.Name)
		base := strings.TrimSuffix(obj.Name, ext)
		newName = fmt.Sprintf("%s_copy%s", base, ext)
	}

	// Build new path
	var newPath string
	var parentID *int64
	if input.TargetParentID != nil {
		parent, err := u.objectRepo.GetByID(ctx, *input.TargetParentID)
		if err != nil {
			if apperrors.IsNotFound(err) {
				return nil, apperrors.NotFoundError("target directory")
			}
			return nil, apperrors.InternalError("failed to get target", err)
		}
		if !parent.IsDirectory() {
			return nil, apperrors.ValidationError("target must be a directory")
		}
		newPath = parent.Path + "/" + newName
		parentID = input.TargetParentID
	} else {
		newPath = "/" + newName
		parentID = nil
	}

	// Check if target exists
	exists, err := u.objectRepo.ExistsByPath(ctx, newPath)
	if err != nil {
		return nil, apperrors.InternalError("failed to check path", err)
	}
	if exists {
		return nil, apperrors.AlreadyExistsError("object at target path")
	}

	// Copy in storage
	if err := u.storage.Copy(ctx, obj.Path, newPath); err != nil {
		return nil, apperrors.InternalError("failed to copy in storage", err)
	}

	// Get new inode
	inode, err := u.storage.GetInode(ctx, newPath)
	if err != nil {
		return nil, apperrors.InternalError("failed to get inode", err)
	}

	// Create new object
	newObj := &entity.Object{
		ID:             inode,
		Name:           newName,
		Type:           obj.Type,
		Path:           newPath,
		ParentID:       parentID,
		CreatorID:      creatorID,
		Size:           obj.Size,
		ContentHash:    obj.ContentHash,
		Description:    obj.Description,
		CurrentVersion: 1,
	}

	if err := u.objectRepo.Create(ctx, newObj); err != nil {
		_ = u.storage.Delete(ctx, newPath)
		return nil, apperrors.InternalError("failed to create object", err)
	}

	// Create owner permission
	perm := &entity.Permission{
		ObjectID:  newObj.ID,
		UserID:    creatorID,
		Role:      entity.RoleOwner,
		GrantedBy: creatorID,
	}
	if err := u.permissionRepo.Create(ctx, perm); err != nil {
		return nil, apperrors.InternalError("failed to create permission", err)
	}

	// Get created object with relations
	created, err := u.objectRepo.GetByID(ctx, newObj.ID)
	if err != nil {
		return nil, apperrors.InternalError("failed to get created object", err)
	}

	return created.ToResponse(), nil
}
