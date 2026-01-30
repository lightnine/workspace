package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/infrastructure/middleware"
	"github.com/leondli/workspace/internal/usecase/auth"
	apperrors "github.com/leondli/workspace/pkg/errors"
	"github.com/leondli/workspace/pkg/response"
)

// AuthHandler handles authentication requests
type AuthHandler struct {
	authUseCase auth.UseCase
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(authUseCase auth.UseCase) *AuthHandler {
	return &AuthHandler{authUseCase: authUseCase}
}

// Register godoc
// @Summary Register a new user
// @Tags auth
// @Accept json
// @Produce json
// @Param request body auth.RegisterInput true "Register input"
// @Success 201 {object} response.Response{data=auth.AuthOutput}
// @Failure 400 {object} response.Response
// @Failure 409 {object} response.Response
// @Router /api/v1/auth/register [post]
func (h *AuthHandler) Register(c *gin.Context) {
	var input auth.RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	output, err := h.authUseCase.Register(c.Request.Context(), &input)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Created(c, output)
}

// Login godoc
// @Summary Login user
// @Tags auth
// @Accept json
// @Produce json
// @Param request body auth.LoginInput true "Login input"
// @Success 200 {object} response.Response{data=auth.AuthOutput}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Router /api/v1/auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var input auth.LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	output, err := h.authUseCase.Login(c.Request.Context(), &input)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, output)
}

// RefreshToken godoc
// @Summary Refresh access token
// @Tags auth
// @Accept json
// @Produce json
// @Param request body refreshTokenRequest true "Refresh token"
// @Success 200 {object} response.Response{data=auth.AuthOutput}
// @Failure 401 {object} response.Response
// @Router /api/v1/auth/refresh [post]
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req refreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	output, err := h.authUseCase.RefreshToken(c.Request.Context(), req.RefreshToken)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, output)
}

// Logout godoc
// @Summary Logout user
// @Tags auth
// @Security BearerAuth
// @Success 200 {object} response.Response
// @Failure 401 {object} response.Response
// @Router /api/v1/auth/logout [post]
func (h *AuthHandler) Logout(c *gin.Context) {
	userIDStr := middleware.GetUserID(c)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user ID")
		return
	}

	if err := h.authUseCase.Logout(c.Request.Context(), userID); err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, gin.H{"message": "logged out successfully"})
}

// ChangePassword godoc
// @Summary Change user password
// @Tags auth
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body changePasswordRequest true "Password change input"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Router /api/v1/users/me/password [put]
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userIDStr := middleware.GetUserID(c)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user ID")
		return
	}

	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	if err := h.authUseCase.ChangePassword(c.Request.Context(), userID, req.OldPassword, req.NewPassword); err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, gin.H{"message": "password changed successfully"})
}

type refreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type changePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

// handleError converts app errors to HTTP responses
func handleError(c *gin.Context, err error) {
	if appErr, ok := err.(*apperrors.AppError); ok {
		switch {
		case apperrors.IsNotFound(appErr.Err):
			response.NotFound(c, appErr.Message)
		case apperrors.IsAlreadyExists(appErr.Err):
			response.Conflict(c, appErr.Message)
		case apperrors.IsUnauthorized(appErr.Err):
			response.Unauthorized(c, appErr.Message)
		case apperrors.IsForbidden(appErr.Err):
			response.Forbidden(c, appErr.Message)
		default:
			response.InternalError(c, appErr.Message)
		}
		return
	}
	response.InternalError(c, "internal server error")
}
