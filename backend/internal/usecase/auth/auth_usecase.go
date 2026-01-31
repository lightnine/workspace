package auth

import (
	"context"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/leondli/workspace/internal/domain/entity"
	"github.com/leondli/workspace/internal/domain/repository"
	"github.com/leondli/workspace/internal/infrastructure/config"
	apperrors "github.com/leondli/workspace/pkg/errors"
	"github.com/leondli/workspace/pkg/jwt"
)

// UseCase defines the auth use case interface
type UseCase interface {
	Register(ctx context.Context, input *RegisterInput) (*AuthOutput, error)
	Login(ctx context.Context, input *LoginInput) (*AuthOutput, error)
	RefreshToken(ctx context.Context, refreshToken string) (*AuthOutput, error)
	Logout(ctx context.Context, userID uuid.UUID) error
	ChangePassword(ctx context.Context, userID uuid.UUID, oldPassword, newPassword string) error
}

// RegisterInput represents registration input data
type RegisterInput struct {
	AppID       string `json:"app_id" binding:"required"`
	Username    string `json:"username" binding:"required,min=3,max=50"`
	Email       string `json:"email" binding:"required,email"`
	Password    string `json:"password" binding:"required,min=8"`
	DisplayName string `json:"display_name"`
}

// LoginInput represents login input data
type LoginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// AuthOutput represents authentication output
type AuthOutput struct {
	User         *entity.UserResponse `json:"user"`
	AccessToken  string               `json:"access_token"`
	RefreshToken string               `json:"refresh_token"`
	ExpiresIn    int64                `json:"expires_in"`
}

type authUseCase struct {
	userRepo         repository.UserRepository
	refreshTokenRepo repository.RefreshTokenRepository
	jwtManager       *jwt.JWTManager
	storageConfig    *config.StorageConfig
}

// NewUseCase creates a new auth use case
func NewUseCase(
	userRepo repository.UserRepository,
	refreshTokenRepo repository.RefreshTokenRepository,
	jwtManager *jwt.JWTManager,
	storageConfig *config.StorageConfig,
) UseCase {
	return &authUseCase{
		userRepo:         userRepo,
		refreshTokenRepo: refreshTokenRepo,
		jwtManager:       jwtManager,
		storageConfig:    storageConfig,
	}
}

// ensureUserDirectory creates the user's workspace directory if it doesn't exist
// Directory structure: /{appId}/{email}/
func (u *authUseCase) ensureUserDirectory(appID, email string) error {
	// Create app directory first: basePath/{appId}
	appDir := filepath.Join(u.storageConfig.BasePath, appID)
	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		if err := os.MkdirAll(appDir, 0755); err != nil {
			return err
		}
	}
	
	// Create user directory: basePath/{appId}/{email}
	userDir := filepath.Join(appDir, email)
	if _, err := os.Stat(userDir); os.IsNotExist(err) {
		if err := os.MkdirAll(userDir, 0755); err != nil {
			return err
		}
	}
	return nil
}

func (u *authUseCase) Register(ctx context.Context, input *RegisterInput) (*AuthOutput, error) {
	// Check if email already exists
	exists, err := u.userRepo.ExistsByEmail(ctx, input.Email)
	if err != nil {
		return nil, apperrors.InternalError("failed to check email", err)
	}
	if exists {
		return nil, apperrors.AlreadyExistsError("email")
	}

	// Check if username already exists
	exists, err = u.userRepo.ExistsByUsername(ctx, input.Username)
	if err != nil {
		return nil, apperrors.InternalError("failed to check username", err)
	}
	if exists {
		return nil, apperrors.AlreadyExistsError("username")
	}

	// Hash password
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, apperrors.InternalError("failed to hash password", err)
	}

	// Create user
	user := &entity.User{
		ID:           uuid.New(),
		AppID:        input.AppID,
		Username:     input.Username,
		Email:        input.Email,
		PasswordHash: string(passwordHash),
		DisplayName:  input.DisplayName,
		Status:       entity.UserStatusActive,
	}

	if err := u.userRepo.Create(ctx, user); err != nil {
		return nil, apperrors.InternalError("failed to create user", err)
	}

	// Create user workspace directory: /{appId}/{email}/
	if err := u.ensureUserDirectory(user.AppID, user.Email); err != nil {
		return nil, apperrors.InternalError("failed to create user directory", err)
	}

	// Generate tokens
	tokenPair, err := u.jwtManager.GenerateTokenPair(user.ID.String(), user.AppID, user.Username, user.Email)
	if err != nil {
		return nil, apperrors.InternalError("failed to generate tokens", err)
	}

	// Store refresh token
	refreshTokenEntity := &entity.RefreshToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: jwt.HashRefreshToken(tokenPair.RefreshToken),
		ExpiresAt: time.Now().Add(u.jwtManager.GetRefreshTokenExpiry()),
	}

	if err := u.refreshTokenRepo.Create(ctx, refreshTokenEntity); err != nil {
		return nil, apperrors.InternalError("failed to store refresh token", err)
	}

	return &AuthOutput{
		User:         user.ToResponse(),
		AccessToken:  tokenPair.AccessToken,
		RefreshToken: tokenPair.RefreshToken,
		ExpiresIn:    tokenPair.ExpiresIn,
	}, nil
}

func (u *authUseCase) Login(ctx context.Context, input *LoginInput) (*AuthOutput, error) {
	// Get user by email
	user, err := u.userRepo.GetByEmail(ctx, input.Email)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.UnauthorizedError("invalid credentials")
		}
		return nil, apperrors.InternalError("failed to get user", err)
	}

	// Check if user is active
	if user.Status != entity.UserStatusActive {
		return nil, apperrors.UnauthorizedError("user account is disabled")
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		return nil, apperrors.UnauthorizedError("invalid credentials")
	}

	// Ensure user workspace directory exists: /{appId}/{email}/
	if err := u.ensureUserDirectory(user.AppID, user.Email); err != nil {
		return nil, apperrors.InternalError("failed to create user directory", err)
	}

	// Generate tokens
	tokenPair, err := u.jwtManager.GenerateTokenPair(user.ID.String(), user.AppID, user.Username, user.Email)
	if err != nil {
		return nil, apperrors.InternalError("failed to generate tokens", err)
	}

	// Store refresh token
	refreshTokenEntity := &entity.RefreshToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: jwt.HashRefreshToken(tokenPair.RefreshToken),
		ExpiresAt: time.Now().Add(u.jwtManager.GetRefreshTokenExpiry()),
	}

	if err := u.refreshTokenRepo.Create(ctx, refreshTokenEntity); err != nil {
		return nil, apperrors.InternalError("failed to store refresh token", err)
	}

	return &AuthOutput{
		User:         user.ToResponse(),
		AccessToken:  tokenPair.AccessToken,
		RefreshToken: tokenPair.RefreshToken,
		ExpiresIn:    tokenPair.ExpiresIn,
	}, nil
}

func (u *authUseCase) RefreshToken(ctx context.Context, refreshToken string) (*AuthOutput, error) {
	// Find refresh token
	tokenHash := jwt.HashRefreshToken(refreshToken)
	storedToken, err := u.refreshTokenRepo.GetByTokenHash(ctx, tokenHash)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return nil, apperrors.UnauthorizedError("invalid refresh token")
		}
		return nil, apperrors.InternalError("failed to get refresh token", err)
	}

	// Check if token is expired or revoked
	if storedToken.IsExpired() || storedToken.IsRevoked() {
		return nil, apperrors.UnauthorizedError("refresh token expired or revoked")
	}

	// Get user
	user, err := u.userRepo.GetByID(ctx, storedToken.UserID)
	if err != nil {
		return nil, apperrors.InternalError("failed to get user", err)
	}

	// Revoke old refresh token
	if err := u.refreshTokenRepo.Revoke(ctx, storedToken.ID); err != nil {
		return nil, apperrors.InternalError("failed to revoke old refresh token", err)
	}

	// Generate new tokens
	tokenPair, err := u.jwtManager.GenerateTokenPair(user.ID.String(), user.AppID, user.Username, user.Email)
	if err != nil {
		return nil, apperrors.InternalError("failed to generate tokens", err)
	}

	// Store new refresh token
	newRefreshToken := &entity.RefreshToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: jwt.HashRefreshToken(tokenPair.RefreshToken),
		ExpiresAt: time.Now().Add(u.jwtManager.GetRefreshTokenExpiry()),
	}

	if err := u.refreshTokenRepo.Create(ctx, newRefreshToken); err != nil {
		return nil, apperrors.InternalError("failed to store refresh token", err)
	}

	return &AuthOutput{
		User:         user.ToResponse(),
		AccessToken:  tokenPair.AccessToken,
		RefreshToken: tokenPair.RefreshToken,
		ExpiresIn:    tokenPair.ExpiresIn,
	}, nil
}

func (u *authUseCase) Logout(ctx context.Context, userID uuid.UUID) error {
	if err := u.refreshTokenRepo.RevokeAllForUser(ctx, userID); err != nil {
		return apperrors.InternalError("failed to revoke tokens", err)
	}
	return nil
}

func (u *authUseCase) ChangePassword(ctx context.Context, userID uuid.UUID, oldPassword, newPassword string) error {
	// Get user
	user, err := u.userRepo.GetByID(ctx, userID)
	if err != nil {
		return apperrors.InternalError("failed to get user", err)
	}

	// Verify old password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(oldPassword)); err != nil {
		return apperrors.UnauthorizedError("invalid old password")
	}

	// Hash new password
	newPasswordHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return apperrors.InternalError("failed to hash password", err)
	}

	// Update password
	if err := u.userRepo.UpdatePassword(ctx, userID, string(newPasswordHash)); err != nil {
		return apperrors.InternalError("failed to update password", err)
	}

	// Revoke all refresh tokens
	if err := u.refreshTokenRepo.RevokeAllForUser(ctx, userID); err != nil {
		return apperrors.InternalError("failed to revoke tokens", err)
	}

	return nil
}
