package handler

import (
	"io"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/leondli/workspace/internal/domain/entity"
	"github.com/leondli/workspace/internal/infrastructure/middleware"
	"github.com/leondli/workspace/internal/usecase/object"
	"github.com/leondli/workspace/pkg/response"
)

// ObjectHandler handles object requests
type ObjectHandler struct {
	objectUseCase object.UseCase
}

// NewObjectHandler creates a new object handler
func NewObjectHandler(objectUseCase object.UseCase) *ObjectHandler {
	return &ObjectHandler{objectUseCase: objectUseCase}
}

// CreateDirectory godoc
// @Summary Create a new directory
// @Tags objects
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body object.CreateDirectoryInput true "Directory input"
// @Success 201 {object} response.Response{data=entity.ObjectResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 409 {object} response.Response
// @Router /api/v1/objects/directories [post]
func (h *ObjectHandler) CreateDirectory(c *gin.Context) {
	userIDStr := middleware.GetUserID(c)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user ID")
		return
	}

	appID := middleware.GetAppID(c)
	email := middleware.GetEmail(c)
	if appID == "" || email == "" {
		response.Unauthorized(c, "missing app ID or email")
		return
	}

	var input object.CreateDirectoryInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	obj, err := h.objectUseCase.CreateDirectory(c.Request.Context(), userID, appID, email, &input)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Created(c, obj)
}

// CreateFile godoc
// @Summary Create/Upload a new file
// @Tags objects
// @Security BearerAuth
// @Accept multipart/form-data
// @Produce json
// @Param name formData string true "File name"
// @Param type formData string false "File type"
// @Param parent_id formData int false "Parent directory ID"
// @Param description formData string false "Description"
// @Param content formData file true "File content"
// @Success 201 {object} response.Response{data=entity.ObjectResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 409 {object} response.Response
// @Router /api/v1/objects/files [post]
func (h *ObjectHandler) CreateFile(c *gin.Context) {
	userIDStr := middleware.GetUserID(c)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user ID")
		return
	}

	appID := middleware.GetAppID(c)
	email := middleware.GetEmail(c)
	if appID == "" || email == "" {
		response.Unauthorized(c, "missing app ID or email")
		return
	}

	// Parse form data
	name := c.PostForm("name")
	if name == "" {
		response.BadRequest(c, "name is required")
		return
	}

	objType := c.PostForm("type")
	parentIDStr := c.PostForm("parent_id")
	description := c.PostForm("description")

	var parentID *int64
	if parentIDStr != "" {
		pid, err := strconv.ParseInt(parentIDStr, 10, 64)
		if err != nil {
			response.BadRequest(c, "invalid parent_id")
			return
		}
		parentID = &pid
	}

	// Get file content
	file, _, err := c.Request.FormFile("content")
	if err != nil {
		response.BadRequest(c, "content is required")
		return
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		response.BadRequest(c, "failed to read file content")
		return
	}

	input := &object.CreateFileInput{
		Name:        name,
		Type:        entity.ObjectType(objType),
		ParentID:    parentID,
		Description: description,
		Content:     content,
	}

	obj, err := h.objectUseCase.CreateFile(c.Request.Context(), userID, appID, email, input)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Created(c, obj)
}

// GetByID godoc
// @Summary Get object by ID
// @Tags objects
// @Security BearerAuth
// @Produce json
// @Param id path int true "Object ID"
// @Success 200 {object} response.Response{data=entity.ObjectResponse}
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/objects/{id} [get]
func (h *ObjectHandler) GetByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	obj, err := h.objectUseCase.GetByID(c.Request.Context(), id)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, obj)
}

// List godoc
// @Summary List objects
// @Tags objects
// @Security BearerAuth
// @Produce json
// @Param parent_id query int false "Parent ID"
// @Param type query []string false "Object types"
// @Param search query string false "Search query"
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(20)
// @Success 200 {object} response.Response{data=response.PaginatedData}
// @Failure 401 {object} response.Response
// @Router /api/v1/objects [get]
func (h *ObjectHandler) List(c *gin.Context) {
	filter := &entity.ObjectFilter{
		Page:     1,
		PageSize: 20,
	}

	// Parse query parameters
	if parentIDStr := c.Query("parent_id"); parentIDStr != "" {
		pid, err := strconv.ParseInt(parentIDStr, 10, 64)
		if err == nil {
			filter.ParentID = &pid
		}
	}

	if types := c.QueryArray("type"); len(types) > 0 {
		for _, t := range types {
			filter.Type = append(filter.Type, entity.ObjectType(t))
		}
	}

	if search := c.Query("search"); search != "" {
		filter.Search = search
	}

	if page := c.Query("page"); page != "" {
		if p, err := strconv.Atoi(page); err == nil && p > 0 {
			filter.Page = p
		}
	}

	if pageSize := c.Query("page_size"); pageSize != "" {
		if ps, err := strconv.Atoi(pageSize); err == nil && ps > 0 && ps <= 100 {
			filter.PageSize = ps
		}
	}

	objects, total, err := h.objectUseCase.List(c.Request.Context(), filter)
	if err != nil {
		handleError(c, err)
		return
	}

	response.SuccessWithPagination(c, objects, filter.Page, filter.PageSize, total)
}

// GetTree godoc
// @Summary Get directory tree
// @Tags objects
// @Security BearerAuth
// @Produce json
// @Param parent_id query int false "Parent ID (root if not specified)"
// @Param depth query int false "Tree depth" default(3)
// @Success 200 {object} response.Response{data=[]entity.ObjectResponse}
// @Failure 401 {object} response.Response
// @Router /api/v1/objects/tree [get]
func (h *ObjectHandler) GetTree(c *gin.Context) {
	userIDStr := middleware.GetUserID(c)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user ID")
		return
	}

	appID := middleware.GetAppID(c)
	email := middleware.GetEmail(c)
	if appID == "" || email == "" {
		response.Unauthorized(c, "missing app ID or email")
		return
	}

	depth := 3
	if depthStr := c.Query("depth"); depthStr != "" {
		if d, err := strconv.Atoi(depthStr); err == nil && d > 0 && d <= 10 {
			depth = d
		}
	}

	tree, err := h.objectUseCase.GetTree(c.Request.Context(), userID, appID, email, depth)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, tree)
}

// GetContent godoc
// @Summary Get file content
// @Tags objects
// @Security BearerAuth
// @Produce octet-stream
// @Param id path int true "Object ID"
// @Success 200 {file} binary
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/objects/{id}/content [get]
func (h *ObjectHandler) GetContent(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	content, err := h.objectUseCase.GetContent(c.Request.Context(), id)
	if err != nil {
		handleError(c, err)
		return
	}

	c.Data(200, "application/octet-stream", content)
}

// Download godoc
// @Summary Download file
// @Tags objects
// @Security BearerAuth
// @Produce octet-stream
// @Param id path int true "Object ID"
// @Success 200 {file} binary
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/objects/{id}/download [get]
func (h *ObjectHandler) Download(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	obj, err := h.objectUseCase.GetByID(c.Request.Context(), id)
	if err != nil {
		handleError(c, err)
		return
	}

	content, err := h.objectUseCase.GetContent(c.Request.Context(), id)
	if err != nil {
		handleError(c, err)
		return
	}

	// Set Content-Disposition header for file download
	c.Header("Content-Disposition", "attachment; filename=\""+obj.Name+"\"")
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Length", strconv.Itoa(len(content)))
	c.Data(200, "application/octet-stream", content)
}

// SaveContent godoc
// @Summary Save file content
// @Tags objects
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path int true "Object ID"
// @Param request body saveContentRequest true "Content"
// @Success 200 {object} response.Response{data=entity.ObjectResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/objects/{id}/content [put]
func (h *ObjectHandler) SaveContent(c *gin.Context) {
	userIDStr := middleware.GetUserID(c)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user ID")
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	var req saveContentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	obj, err := h.objectUseCase.SaveContent(c.Request.Context(), id, userID, []byte(req.Content), req.Message)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, obj)
}

// PatchNotebook godoc
// @Summary Patch notebook content incrementally
// @Description Incrementally update notebook cells without sending the entire file
// @Tags objects
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path int true "Object ID"
// @Param request body patchNotebookRequest true "Patch operations"
// @Success 200 {object} response.Response{data=entity.ObjectResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/objects/{id}/notebook [patch]
func (h *ObjectHandler) PatchNotebook(c *gin.Context) {
	userIDStr := middleware.GetUserID(c)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user ID")
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	var req patchNotebookRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	// Convert to usecase input
	ops := make([]object.CellOperation, len(req.Operations))
	for i, op := range req.Operations {
		ops[i] = object.CellOperation{
			Op:       op.Op,
			CellID:   op.CellID,
			Index:    op.Index,
			Cell:     op.Cell,
			OldIndex: op.OldIndex,
		}
	}

	input := &object.PatchNotebookInput{
		Operations: ops,
		Message:    req.Message,
	}

	obj, err := h.objectUseCase.PatchNotebook(c.Request.Context(), id, userID, input)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, obj)
}

// Update godoc
// @Summary Update object metadata
// @Tags objects
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path int true "Object ID"
// @Param request body object.UpdateInput true "Update input"
// @Success 200 {object} response.Response{data=entity.ObjectResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/objects/{id} [put]
func (h *ObjectHandler) Update(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	var input object.UpdateInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	obj, err := h.objectUseCase.Update(c.Request.Context(), id, &input)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, obj)
}

// Delete godoc
// @Summary Delete object
// @Tags objects
// @Security BearerAuth
// @Param id path int true "Object ID"
// @Success 200 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/objects/{id} [delete]
func (h *ObjectHandler) Delete(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	if err := h.objectUseCase.Delete(c.Request.Context(), id); err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, gin.H{"message": "deleted successfully"})
}

// Move godoc
// @Summary Move object
// @Tags objects
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path int true "Object ID"
// @Param request body object.MoveInput true "Move input"
// @Success 200 {object} response.Response{data=entity.ObjectResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/objects/{id}/move [post]
func (h *ObjectHandler) Move(c *gin.Context) {
	userIDStr := middleware.GetUserID(c)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user ID")
		return
	}

	appID := middleware.GetAppID(c)
	email := middleware.GetEmail(c)
	if appID == "" || email == "" {
		response.Unauthorized(c, "missing app ID or email")
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	var input object.MoveInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	// Set user info from middleware
	input.UserID = userID
	input.AppID = appID
	input.Email = email

	obj, err := h.objectUseCase.Move(c.Request.Context(), id, &input)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Success(c, obj)
}

// Copy godoc
// @Summary Copy object
// @Tags objects
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path int true "Object ID"
// @Param request body object.CopyInput true "Copy input"
// @Success 201 {object} response.Response{data=entity.ObjectResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Router /api/v1/objects/{id}/copy [post]
func (h *ObjectHandler) Copy(c *gin.Context) {
	userIDStr := middleware.GetUserID(c)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		response.Unauthorized(c, "invalid user ID")
		return
	}

	appID := middleware.GetAppID(c)
	email := middleware.GetEmail(c)
	if appID == "" || email == "" {
		response.Unauthorized(c, "missing app ID or email")
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(c, "invalid object ID")
		return
	}

	var input object.CopyInput
	if err := c.ShouldBindJSON(&input); err != nil {
		response.BadRequest(c, err.Error())
		return
	}

	obj, err := h.objectUseCase.Copy(c.Request.Context(), id, userID, appID, email, &input)
	if err != nil {
		handleError(c, err)
		return
	}

	response.Created(c, obj)
}

type saveContentRequest struct {
	Content string `json:"content" binding:"required"`
	Message string `json:"message"`
}

// NotebookCellOperation represents a single cell operation for incremental update
type NotebookCellOperation struct {
	Op       string `json:"op" binding:"required,oneof=add update delete move"`       // Operation type: add, update, delete, move
	CellID   string `json:"cell_id,omitempty"`                                         // Cell ID for update/delete/move
	Index    *int   `json:"index,omitempty"`                                           // Target index for add/move
	Cell     any    `json:"cell,omitempty"`                                            // Cell data for add/update
	OldIndex *int   `json:"old_index,omitempty"`                                       // Original index for move
}

type patchNotebookRequest struct {
	Operations []NotebookCellOperation `json:"operations" binding:"required,min=1"`
	Message    string                  `json:"message"`
}
