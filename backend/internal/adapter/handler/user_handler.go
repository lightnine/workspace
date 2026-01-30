package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/infrastructure/middleware"
	"github.com/leondli/workspace/internal/usecase/user"
	"github.com/leondli/workspace/pkg/response"
)

// UserHandler handles user requests
type UserHandler struct {
	userUseCase user.UseCase
}

// NewUserHandler creates a new user handler
func NewUserHandler(userUseCase user.UseCase) *UserHandler {
	return &UserHandler{userUseCase: userUseCase}
}

// GetMe godoc
// @Summary Get current user info
// @Tags users
// @Security BearerAuth
// @Produce json
// @Success 200 {object} response.Response{data=entity.UserResponse}
// @Failure 401 {object} response.Response
// @Router /api/v1/users/me [get]
func (h *UserHandler) GetMe(c *gin.Context) {
	userIDStr := middleware.GetUserID(c)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user ID")
		return
	}

	userResp, err := h.userUseCase.GetByID(c.Request.Context(), userID)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, userResp)
}

// UpdateMe godoc
// @Summary Update current user info
// @Tags users
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body user.UpdateInput true "Update input"
// @Success 200 {object} response.Response{data=entity.UserResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Router /api/v1/users/me [put]
func (h *UserHandler) UpdateMe(c *gin.Context) {
	userIDStr := middleware.GetUserID(c)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user ID")
		return
	}

	var input user.UpdateInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	userResp, err := h.userUseCase.Update(c.Request.Context(), userID, &input)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, userResp)
}
