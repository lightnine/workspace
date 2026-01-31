package entity

import (
	"time"

	"github.com/google/uuid"
)

// UserStatus represents the user status
type UserStatus string

const (
	UserStatusActive   UserStatus = "active"
	UserStatusDisabled UserStatus = "disabled"
)

// User represents the user entity
type User struct {
	ID           uuid.UUID  `json:"id"`
	AppID        string     `json:"app_id"`        // Application ID
	Username     string     `json:"username"`
	Email        string     `json:"email"`
	PasswordHash string     `json:"-"`
	DisplayName  string     `json:"display_name,omitempty"`
	AvatarURL    string     `json:"avatar_url,omitempty"`
	Status       UserStatus `json:"status"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// UserCreate represents the data needed to create a new user
type UserCreate struct {
	AppID       string
	Username    string
	Email       string
	Password    string
	DisplayName string
}

// UserUpdate represents the data that can be updated
type UserUpdate struct {
	DisplayName *string
	AvatarURL   *string
}

// UserResponse represents the user data returned to client
type UserResponse struct {
	ID          uuid.UUID `json:"id"`
	AppID       string    `json:"app_id"`
	Username    string    `json:"username"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name,omitempty"`
	AvatarURL   string    `json:"avatar_url,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// ToResponse converts User to UserResponse
func (u *User) ToResponse() *UserResponse {
	return &UserResponse{
		ID:          u.ID,
		AppID:       u.AppID,
		Username:    u.Username,
		Email:       u.Email,
		DisplayName: u.DisplayName,
		AvatarURL:   u.AvatarURL,
		CreatedAt:   u.CreatedAt,
	}
}

// GetWorkspacePath returns the user's workspace directory path: /{appId}/{email}
func (u *User) GetWorkspacePath() string {
	return "/" + u.AppID + "/" + u.Email
}

// RefreshToken represents a refresh token entity
type RefreshToken struct {
	ID        uuid.UUID  `json:"id"`
	UserID    uuid.UUID  `json:"user_id"`
	TokenHash string     `json:"-"`
	ExpiresAt time.Time  `json:"expires_at"`
	CreatedAt time.Time  `json:"created_at"`
	RevokedAt *time.Time `json:"revoked_at,omitempty"`
}

// IsExpired checks if the refresh token is expired
func (r *RefreshToken) IsExpired() bool {
	return time.Now().After(r.ExpiresAt)
}

// IsRevoked checks if the refresh token is revoked
func (r *RefreshToken) IsRevoked() bool {
	return r.RevokedAt != nil
}
