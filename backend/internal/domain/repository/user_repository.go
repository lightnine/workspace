package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/domain/entity"
)

// UserRepository defines the interface for user data access
type UserRepository interface {
	// Create creates a new user
	Create(ctx context.Context, user *entity.User) error

	// GetByID retrieves a user by ID
	GetByID(ctx context.Context, id uuid.UUID) (*entity.User, error)

	// GetByEmail retrieves a user by email
	GetByEmail(ctx context.Context, email string) (*entity.User, error)

	// GetByUsername retrieves a user by username
	GetByUsername(ctx context.Context, username string) (*entity.User, error)

	// Update updates a user
	Update(ctx context.Context, user *entity.User) error

	// UpdatePassword updates user password
	UpdatePassword(ctx context.Context, id uuid.UUID, passwordHash string) error

	// ExistsByEmail checks if a user exists by email
	ExistsByEmail(ctx context.Context, email string) (bool, error)

	// ExistsByUsername checks if a user exists by username
	ExistsByUsername(ctx context.Context, username string) (bool, error)
}

// RefreshTokenRepository defines the interface for refresh token data access
type RefreshTokenRepository interface {
	// Create creates a new refresh token
	Create(ctx context.Context, token *entity.RefreshToken) error

	// GetByTokenHash retrieves a refresh token by hash
	GetByTokenHash(ctx context.Context, tokenHash string) (*entity.RefreshToken, error)

	// Revoke revokes a refresh token
	Revoke(ctx context.Context, id uuid.UUID) error

	// RevokeAllForUser revokes all refresh tokens for a user
	RevokeAllForUser(ctx context.Context, userID uuid.UUID) error

	// DeleteExpired deletes all expired refresh tokens
	DeleteExpired(ctx context.Context) error
}
