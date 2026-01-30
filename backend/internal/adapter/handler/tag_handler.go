package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/usecase/tag"
	"github.com/leondli/workspace/pkg/response"
)

// TagHandler handles tag requests
type TagHandler struct {
	tagUseCase tag.UseCase
}

// NewTagHandler creates a new tag handler
func NewTagHandler(tagUseCase tag.UseCase) *TagHandler {
	return &TagHandler{tagUseCase: tagUseCase}
}

// Create godoc
// @Summary Create a new tag
// @Tags tags
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body tag.CreateInput true "Tag input"
// @Success 201 {object} response.Response{data=entity.TagResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 409 {object} response.Response
// @Router /api/v1/tags [post]
func (h *TagHandler) Create(c *gin.Context) {
	var input tag.CreateInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	t, err := h.tagUseCase.Create(c.Request.Context(), &input)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Created(c, t)
}

// List godoc
// @Summary List all tags
// @Tags tags
// @Security BearerAuth
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(50)
// @Success 200 {object} response.Response{data=response.PaginatedData}
// @Failure 401 {object} response.Response
// @Router /api/v1/tags [get]
func (h *TagHandler) List(c *gin.Context) {
	page := 1
	pageSize := 50

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

	tags, total, err := h.tagUseCase.List(c.Request.Context(), page, pageSize)
	if err != nil {
		handleError(c, err)
		return
	}

	response.SuccessWithPagination(c, tags, page, pageSize, total)
}

// Delete godoc
// @Summary Delete a tag
// @Tags tags
// @Security BearerAuth
// @Param id path string true "Tag ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/tags/{id} [delete]
func (h *TagHandler) Delete(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.BadRequest(c, "invalid tag ID")
		return
	}

	if err := h.tagUseCase.Delete(c.Request.Context(), id); err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, gin.H{"message": "tag deleted"})
}

// AddToObject godoc
// @Summary Add tag to object
// @Tags tags
// @Security BearerAuth
// @Param obj_id path int true "Object ID"
// @Param tag_id path string true "Tag ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/tags/objects/{obj_id}/{tag_id} [post]
func (h *TagHandler) AddToObject(c *gin.Context) {
	objIDStr := c.Param("obj_id")
	objectID, err := strconv.ParseInt(objIDStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	tagIDStr := c.Param("tag_id")
	tagID, err := uuid.Parse(tagIDStr)
	if err != nil {
		response.BadRequest(c, "invalid tag ID")
		return
	}

	if err := h.tagUseCase.AddToObject(c.Request.Context(), objectID, tagID); err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, gin.H{"message": "tag added to object"})
}

// RemoveFromObject godoc
// @Summary Remove tag from object
// @Tags tags
// @Security BearerAuth
// @Param obj_id path int true "Object ID"
// @Param tag_id path string true "Tag ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Router /api/v1/tags/objects/{obj_id}/{tag_id} [delete]
func (h *TagHandler) RemoveFromObject(c *gin.Context) {
	objIDStr := c.Param("obj_id")
	objectID, err := strconv.ParseInt(objIDStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	tagIDStr := c.Param("tag_id")
	tagID, err := uuid.Parse(tagIDStr)
	if err != nil {
		response.BadRequest(c, "invalid tag ID")
		return
	}

	if err := h.tagUseCase.RemoveFromObject(c.Request.Context(), objectID, tagID); err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, gin.H{"message": "tag removed from object"})
}

// GetObjectTags godoc
// @Summary Get tags for object
// @Tags tags
// @Security BearerAuth
// @Produce json
// @Param obj_id path int true "Object ID"
// @Success 200 {object} response.Response{data=[]entity.TagResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Router /api/v1/tags/objects/{obj_id} [get]
func (h *TagHandler) GetObjectTags(c *gin.Context) {
	objIDStr := c.Param("obj_id")
	objectID, err := strconv.ParseInt(objIDStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	tags, err := h.tagUseCase.GetObjectTags(c.Request.Context(), objectID)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, gin.H{"tags": tags})
}
