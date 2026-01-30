package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/leondli/workspace/internal/domain/entity"
	"github.com/leondli/workspace/internal/usecase/search"
	"github.com/leondli/workspace/pkg/response"
)

// SearchHandler handles search requests
type SearchHandler struct {
	searchUseCase search.UseCase
}

// NewSearchHandler creates a new search handler
func NewSearchHandler(searchUseCase search.UseCase) *SearchHandler {
	return &SearchHandler{searchUseCase: searchUseCase}
}

// SearchByName godoc
// @Summary Search objects by name
// @Tags search
// @Security BearerAuth
// @Produce json
// @Param q query string true "Search query"
// @Param type query []string false "Object types"
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(20)
// @Success 200 {object} response.Response{data=response.PaginatedData}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Router /api/v1/search [get]
func (h *SearchHandler) SearchByName(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		response.BadRequest(c, "search query is required")
		return
	}

	var types []entity.ObjectType
	if typeStrs := c.QueryArray("type"); len(typeStrs) > 0 {
		for _, t := range typeStrs {
			types = append(types, entity.ObjectType(t))
		}
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

	results, total, err := h.searchUseCase.SearchByName(c.Request.Context(), query, types, page, pageSize)
	if err != nil {
		handleError(c, err)
		return
	}

	response.SuccessWithPagination(c, results, page, pageSize, total)
}

// SearchByContent godoc
// @Summary Search in file contents
// @Tags search
// @Security BearerAuth
// @Produce json
// @Param q query string true "Search query"
// @Param type query []string false "Object types"
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(20)
// @Success 200 {object} response.Response{data=response.PaginatedData}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Router /api/v1/search/content [get]
func (h *SearchHandler) SearchByContent(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		response.BadRequest(c, "search query is required")
		return
	}

	var types []entity.ObjectType
	if typeStrs := c.QueryArray("type"); len(typeStrs) > 0 {
		for _, t := range typeStrs {
			types = append(types, entity.ObjectType(t))
		}
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

	results, total, err := h.searchUseCase.SearchByContent(c.Request.Context(), query, types, page, pageSize)
	if err != nil {
		handleError(c, err)
		return
	}

	response.SuccessWithPagination(c, results, page, pageSize, total)
}

// SearchByTag godoc
// @Summary Search objects by tag
// @Tags search
// @Security BearerAuth
// @Produce json
// @Param tag query string true "Tag name"
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(20)
// @Success 200 {object} response.Response{data=response.PaginatedData}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Router /api/v1/search/tags [get]
func (h *SearchHandler) SearchByTag(c *gin.Context) {
	tagName := c.Query("tag")
	if tagName == "" {
		response.BadRequest(c, "tag name is required")
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

	results, total, err := h.searchUseCase.SearchByTag(c.Request.Context(), tagName, page, pageSize)
	if err != nil {
		handleError(c, err)
		return
	}

	response.SuccessWithPagination(c, results, page, pageSize, total)
}
