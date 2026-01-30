package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/domain/entity"
	"github.com/leondli/workspace/internal/infrastructure/middleware"
	"github.com/leondli/workspace/internal/usecase/permission"
	"github.com/leondli/workspace/pkg/response"
)

// PermissionHandler handles permission requests
type PermissionHandler struct {
	permissionUseCase permission.UseCase
}

// NewPermissionHandler creates a new permission handler
func NewPermissionHandler(permissionUseCase permission.UseCase) *PermissionHandler {
	return &PermissionHandler{permissionUseCase: permissionUseCase}
}

// Grant godoc
// @Summary Grant permission on object
// @Tags permissions
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path int true "Object ID"
// @Param request body permission.GrantInput true "Grant input"
// @Success 201 {object} response.Response{data=entity.PermissionResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/permissions/objects/{id} [post]
func (h *PermissionHandler) Grant(c *gin.Context) {
	userIDStr := middleware.GetUserID(c)
	grantedBy, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user ID")
		return
	}

	idStr := c.Param("id")
	objectID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	var input permission.GrantInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	perm, err := h.permissionUseCase.Grant(c.Request.Context(), objectID, &input, grantedBy)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Created(c, perm)
}

// Update godoc
// @Summary Update permission
// @Tags permissions
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path int true "Object ID"
// @Param user_id path string true "User ID"
// @Param request body permission.UpdateInput true "Update input"
// @Success 200 {object} response.Response{data=entity.PermissionResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/permissions/objects/{id}/{user_id} [put]
func (h *PermissionHandler) Update(c *gin.Context) {
	idStr := c.Param("id")
	objectID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	userIDStr := c.Param("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.BadRequest(c, "invalid user ID")
		return
	}

	var input permission.UpdateInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	perm, err := h.permissionUseCase.Update(c.Request.Context(), objectID, userID, &input)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, perm)
}

// Revoke godoc
// @Summary Revoke permission
// @Tags permissions
// @Security BearerAuth
// @Param id path int true "Object ID"
// @Param user_id path string true "User ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/permissions/objects/{id}/{user_id} [delete]
func (h *PermissionHandler) Revoke(c *gin.Context) {
	idStr := c.Param("id")
	objectID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	userIDStr := c.Param("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.BadRequest(c, "invalid user ID")
		return
	}

	if err := h.permissionUseCase.Revoke(c.Request.Context(), objectID, userID); err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, gin.H{"message": "permission revoked"})
}

// ListByObject godoc
// @Summary List permissions for object
// @Tags permissions
// @Security BearerAuth
// @Produce json
// @Param id path int true "Object ID"
// @Success 200 {object} response.Response{data=[]entity.PermissionResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Router /api/v1/permissions/objects/{id} [get]
func (h *PermissionHandler) ListByObject(c *gin.Context) {
	idStr := c.Param("id")
	objectID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	perms, err := h.permissionUseCase.ListByObject(c.Request.Context(), objectID)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, gin.H{"permissions": perms})
}

// PermissionMiddleware creates a middleware to check permissions
func PermissionMiddleware(permUseCase permission.UseCase, minRole entity.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := middleware.GetUserID(c)
		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			response.Unauthorized(c, "invalid user ID")
			c.Abort()
			return
		}

		idStr := c.Param("id")
		objectID, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			response.BadRequest(c, "invalid object ID")
			c.Abort()
			return
		}

		hasPermission, err := permUseCase.CheckPermission(c.Request.Context(), objectID, userID, minRole)
		if err != nil {
			response.InternalError(c, "failed to check permission")
			c.Abort()
			return
		}

		if !hasPermission {
			response.Forbidden(c, "insufficient permissions")
			c.Abort()
			return
		}

		c.Next()
	}
}
