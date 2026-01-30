package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/infrastructure/middleware"
	"github.com/leondli/workspace/internal/usecase/version"
	"github.com/leondli/workspace/pkg/response"
)

// VersionHandler handles version requests
type VersionHandler struct {
	versionUseCase version.UseCase
}

// NewVersionHandler creates a new version handler
func NewVersionHandler(versionUseCase version.UseCase) *VersionHandler {
	return &VersionHandler{versionUseCase: versionUseCase}
}

// ListByObject godoc
// @Summary List versions for object
// @Tags versions
// @Security BearerAuth
// @Produce json
// @Param id path int true "Object ID"
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(20)
// @Success 200 {object} response.Response{data=response.PaginatedData}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Router /api/v1/versions/objects/{id} [get]
func (h *VersionHandler) ListByObject(c *gin.Context) {
	idStr := c.Param("id")
	objectID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	page := 1
	pageSize := 20

	if p := c.Query("page"); p != "" {
		if pInt, err := strconv.Atoi(p); err == nil && pInt > 0 {
			page = pInt
		}
	}

	if ps := c.Query("page_size"); ps != "" {
		if psInt, err := strconv.Atoi(ps); err == nil && psInt > 0 && psInt <= 100 {
			pageSize = psInt
		}
	}

	versions, total, err := h.versionUseCase.ListByObject(c.Request.Context(), objectID, page, pageSize)
	if err != nil {
		handleError(c, err)
		return
	}

	response.SuccessWithPagination(c, versions, page, pageSize, total)
}

// GetByID godoc
// @Summary Get version by ID
// @Tags versions
// @Security BearerAuth
// @Produce json
// @Param version_id path string true "Version ID"
// @Success 200 {object} response.Response{data=entity.VersionResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/versions/{version_id} [get]
func (h *VersionHandler) GetByID(c *gin.Context) {
	versionIDStr := c.Param("version_id")
	versionID, err := uuid.Parse(versionIDStr)
	if err != nil {
		response.BadRequest(c, "invalid version ID")
		return
	}

	ver, err := h.versionUseCase.GetByID(c.Request.Context(), versionID)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, ver)
}

// GetContent godoc
// @Summary Get version content
// @Tags versions
// @Security BearerAuth
// @Produce octet-stream
// @Param version_id path string true "Version ID"
// @Success 200 {file} binary
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/versions/{version_id}/content [get]
func (h *VersionHandler) GetContent(c *gin.Context) {
	versionIDStr := c.Param("version_id")
	versionID, err := uuid.Parse(versionIDStr)
	if err != nil {
		response.BadRequest(c, "invalid version ID")
		return
	}

	content, err := h.versionUseCase.GetContent(c.Request.Context(), versionID)
	if err != nil {
		handleError(c, err)
		return
	}

	c.Data(200, "application/octet-stream", content)
}

// Restore godoc
// @Summary Restore to version
// @Tags versions
// @Security BearerAuth
// @Produce json
// @Param version_id path string true "Version ID"
// @Success 200 {object} response.Response{data=entity.ObjectResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/versions/{version_id}/restore [post]
func (h *VersionHandler) Restore(c *gin.Context) {
	userIDStr := middleware.GetUserID(c)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user ID")
		return
	}

	versionIDStr := c.Param("version_id")
	versionID, err := uuid.Parse(versionIDStr)
	if err != nil {
		response.BadRequest(c, "invalid version ID")
		return
	}

	obj, err := h.versionUseCase.Restore(c.Request.Context(), versionID, userID)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, obj)
}
