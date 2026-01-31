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

// UserModel is the Gorm model for users table
type UserModel struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey"`
	AppID        string    `gorm:"column:app_id;size:100;not null;index"`
	Username     string    `gorm:"uniqueIndex;size:50;not null"`
	Email        string    `gorm:"uniqueIndex;size:255;not null"`
	PasswordHash string    `gorm:"size:255;not null"`
	DisplayName  string    `gorm:"size:100"`
	AvatarURL    string    `gorm:"size:500"`
	Status       string    `gorm:"size:20;default:'active'"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// TableName returns the table name
func (UserModel) TableName() string {
	return "users"
}

// ToEntity converts UserModel to entity.User
func (m *UserModel) ToEntity() *entity.User {
	return &entity.User{
		ID:           m.ID,
		AppID:        m.AppID,
		Username:     m.Username,
		Email:        m.Email,
		PasswordHash: m.PasswordHash,
		DisplayName:  m.DisplayName,
		AvatarURL:    m.AvatarURL,
		Status:       entity.UserStatus(m.Status),
		CreatedAt:    m.CreatedAt,
		UpdatedAt:    m.UpdatedAt,
	}
}

// FromEntity converts entity.User to UserModel
func UserModelFromEntity(u *entity.User) *UserModel {
	return &UserModel{
		ID:           u.ID,
		AppID:        u.AppID,
		Username:     u.Username,
		Email:        u.Email,
		PasswordHash: u.PasswordHash,
		DisplayName:  u.DisplayName,
		AvatarURL:    u.AvatarURL,
		Status:       string(u.Status),
		CreatedAt:    u.CreatedAt,
		UpdatedAt:    u.UpdatedAt,
	}
}

// RefreshTokenModel is the Gorm model for refresh_tokens table
type RefreshTokenModel struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;index"`
	TokenHash string    `gorm:"size:64;not null;index"`
	ExpiresAt time.Time `gorm:"not null;index"`
	CreatedAt time.Time
	RevokedAt *time.Time
}

// TableName returns the table name
func (RefreshTokenModel) TableName() string {
	return "refresh_tokens"
}

// ToEntity converts RefreshTokenModel to entity.RefreshToken
func (m *RefreshTokenModel) ToEntity() *entity.RefreshToken {
	return &entity.RefreshToken{
		ID:        m.ID,
		UserID:    m.UserID,
		TokenHash: m.TokenHash,
		ExpiresAt: m.ExpiresAt,
		CreatedAt: m.CreatedAt,
		RevokedAt: m.RevokedAt,
	}
}

// userRepository implements repository.UserRepository
type userRepository struct {
	db *gorm.DB
}

// NewUserRepository creates a new user repository
func NewUserRepository(db *gorm.DB) repository.UserRepository {
	return &userRepository{db: db}
}

func (r *userRepository) Create(ctx context.Context, user *entity.User) error {
	if user.ID == uuid.Nil {
		user.ID = uuid.New()
	}
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()

	model := UserModelFromEntity(user)
	if err := r.db.WithContext(ctx).Create(model).Error; err != nil {
		return err
	}
	return nil
}

func (r *userRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.User, error) {
	var model UserModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}
		return nil, err
	}
	return model.ToEntity(), nil
}

func (r *userRepository) GetByEmail(ctx context.Context, email string) (*entity.User, error) {
	var model UserModel
	if err := r.db.WithContext(ctx).Where("email = ?", email).First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}
		return nil, err
	}
	return model.ToEntity(), nil
}

func (r *userRepository) GetByUsername(ctx context.Context, username string) (*entity.User, error) {
	var model UserModel
	if err := r.db.WithContext(ctx).Where("username = ?", username).First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}
		return nil, err
	}
	return model.ToEntity(), nil
}

func (r *userRepository) Update(ctx context.Context, user *entity.User) error {
	model := UserModelFromEntity(user)
	return r.db.WithContext(ctx).Save(model).Error
}

func (r *userRepository) UpdatePassword(ctx context.Context, id uuid.UUID, passwordHash string) error {
	return r.db.WithContext(ctx).Model(&UserModel{}).
		Where("id = ?", id).
		Update("password_hash", passwordHash).Error
}

func (r *userRepository) ExistsByEmail(ctx context.Context, email string) (bool, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&UserModel{}).Where("email = ?", email).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *userRepository) ExistsByUsername(ctx context.Context, username string) (bool, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&UserModel{}).Where("username = ?", username).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *userRepository) GetByAppID(ctx context.Context, appID string) ([]*entity.User, error) {
	var models []UserModel
	if err := r.db.WithContext(ctx).Where("app_id = ?", appID).Find(&models).Error; err != nil {
		return nil, err
	}
	users := make([]*entity.User, len(models))
	for i := range models {
		users[i] = models[i].ToEntity()
	}
	return users, nil
}

// refreshTokenRepository implements repository.RefreshTokenRepository
type refreshTokenRepository struct {
	db *gorm.DB
}

// NewRefreshTokenRepository creates a new refresh token repository
func NewRefreshTokenRepository(db *gorm.DB) repository.RefreshTokenRepository {
	return &refreshTokenRepository{db: db}
}

func (r *refreshTokenRepository) Create(ctx context.Context, token *entity.RefreshToken) error {
	if token.ID == uuid.Nil {
		token.ID = uuid.New()
	}
	token.CreatedAt = time.Now()

	model := &RefreshTokenModel{
		ID:        token.ID,
		UserID:    token.UserID,
		TokenHash: token.TokenHash,
		ExpiresAt: token.ExpiresAt,
		CreatedAt: token.CreatedAt,
	}
	return r.db.WithContext(ctx).Create(model).Error
}

func (r *refreshTokenRepository) GetByTokenHash(ctx context.Context, tokenHash string) (*entity.RefreshToken, error) {
	var model RefreshTokenModel
	if err := r.db.WithContext(ctx).Where("token_hash = ?", tokenHash).First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrNotFound
		}
		return nil, err
	}
	return model.ToEntity(), nil
}

func (r *refreshTokenRepository) Revoke(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	return r.db.WithContext(ctx).Model(&RefreshTokenModel{}).
		Where("id = ?", id).
		Update("revoked_at", &now).Error
}

func (r *refreshTokenRepository) RevokeAllForUser(ctx context.Context, userID uuid.UUID) error {
	now := time.Now()
	return r.db.WithContext(ctx).Model(&RefreshTokenModel{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", &now).Error
}

func (r *refreshTokenRepository) DeleteExpired(ctx context.Context) error {
	return r.db.WithContext(ctx).
		Where("expires_at < ?", time.Now()).
		Delete(&RefreshTokenModel{}).Error
}
