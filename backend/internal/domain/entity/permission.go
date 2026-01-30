package entity

import (
	"time"

	"github.com/google/uuid"
)

// Role represents the permission role
type Role string

const (
	RoleOwner  Role = "owner"
	RoleEditor Role = "editor"
	RoleViewer Role = "viewer"
)

// Permission represents the permission entity
type Permission struct {
	ID          uuid.UUID `json:"id"`
	ObjectID    int64     `json:"object_id"`
	UserID      uuid.UUID `json:"user_id"`
	Role        Role      `json:"role"`
	IsInherited bool      `json:"is_inherited"`
	GrantedBy   uuid.UUID `json:"granted_by,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	// Relations (not stored in DB)
	User          *User   `json:"user,omitempty"`
	Object        *Object `json:"object,omitempty"`
	GrantedByUser *User   `json:"granted_by_user,omitempty"`
}

// PermissionCreate represents the data needed to create a permission
type PermissionCreate struct {
	ObjectID  int64
	UserID    uuid.UUID
	Role      Role
	GrantedBy uuid.UUID
}

// PermissionUpdate represents the data to update a permission
type PermissionUpdate struct {
	Role Role
}

// PermissionResponse represents the permission data returned to client
type PermissionResponse struct {
	ID          uuid.UUID     `json:"id"`
	Role        Role          `json:"role"`
	IsInherited bool          `json:"is_inherited"`
	User        *UserResponse `json:"user,omitempty"`
	GrantedAt   time.Time     `json:"granted_at"`
}

// ToResponse converts Permission to PermissionResponse
func (p *Permission) ToResponse() *PermissionResponse {
	resp := &PermissionResponse{
		ID:          p.ID,
		Role:        p.Role,
		IsInherited: p.IsInherited,
		GrantedAt:   p.CreatedAt,
	}

	if p.User != nil {
		resp.User = p.User.ToResponse()
	}

	return resp
}

// CanRead checks if the role can read
func (r Role) CanRead() bool {
	return r == RoleOwner || r == RoleEditor || r == RoleViewer
}

// CanWrite checks if the role can write
func (r Role) CanWrite() bool {
	return r == RoleOwner || r == RoleEditor
}

// CanManage checks if the role can manage permissions
func (r Role) CanManage() bool {
	return r == RoleOwner
}

// IsValid checks if the role is valid
func (r Role) IsValid() bool {
	return r == RoleOwner || r == RoleEditor || r == RoleViewer
}

// RolePriority returns the priority of a role (higher is more privileged)
func (r Role) Priority() int {
	switch r {
	case RoleOwner:
		return 3
	case RoleEditor:
		return 2
	case RoleViewer:
		return 1
	default:
		return 0
	}
}
