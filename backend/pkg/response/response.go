package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	apperrors "github.com/leondli/workspace/pkg/errors"
)

// Error codes as strings
const (
	CodeSuccess          = "SUCCESS"
	CodeBadRequest       = "BAD_REQUEST"
	CodeUnauthorized     = "UNAUTHORIZED"
	CodeForbidden        = "PERMISSION_DENIED"
	CodeNotFound         = "NOT_FOUND"
	CodeConflict         = "ALREADY_EXISTS"
	CodeInternalError    = "INTERNAL_ERROR"
	CodeValidationError  = "VALIDATION_ERROR"
	CodeInvalidArgument  = "INVALID_ARGUMENT"
	CodeResourceExhausted = "RESOURCE_EXHAUSTED"
)

// RequestIDKey is the key used to store request ID in gin context
const RequestIDKey = "X-Request-ID"

// Response is the standard API response structure for success
type Response struct {
	Code      string      `json:"code"`
	Message   string      `json:"message"`
	Data      interface{} `json:"data,omitempty"`
	RequestID string      `json:"requestId"`
}

// ErrorDetail provides additional error information
type ErrorDetail struct {
	Reason   string            `json:"reason"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// ErrorResponse is the standard API response structure for errors
type ErrorResponse struct {
	Code      string        `json:"code"`
	HTTPCode  int           `json:"httpCode"`
	Message   string        `json:"message"`
	Details   []ErrorDetail `json:"details,omitempty"`
	RequestID string        `json:"requestId"`
}

// Pagination holds pagination info
type Pagination struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"page_size"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

// PaginatedData holds paginated response data
type PaginatedData struct {
	Items      interface{} `json:"items"`
	Pagination Pagination  `json:"pagination"`
}

// GetRequestID retrieves the request ID from context, or generates a new one
func GetRequestID(c *gin.Context) string {
	// Try to get from context (set by middleware)
	if requestID, exists := c.Get(RequestIDKey); exists {
		if id, ok := requestID.(string); ok && id != "" {
			return id
		}
	}
	
	// Try to get from header (sent by frontend)
	if requestID := c.GetHeader(RequestIDKey); requestID != "" {
		return requestID
	}
	
	// Generate a new one
	return "req-" + uuid.New().String()
}

// Success sends a success response
func Success(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Response{
		Code:      CodeSuccess,
		Message:   "success",
		Data:      data,
		RequestID: GetRequestID(c),
	})
}

// Created sends a created response
func Created(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, Response{
		Code:      CodeSuccess,
		Message:   "created",
		Data:      data,
		RequestID: GetRequestID(c),
	})
}

// SuccessWithPagination sends a paginated success response
func SuccessWithPagination(c *gin.Context, items interface{}, page, pageSize int, total int64) {
	totalPages := int(total) / pageSize
	if int(total)%pageSize > 0 {
		totalPages++
	}

	c.JSON(http.StatusOK, Response{
		Code:      CodeSuccess,
		Message:   "success",
		Data: PaginatedData{
			Items: items,
			Pagination: Pagination{
				Page:       page,
				PageSize:   pageSize,
				Total:      total,
				TotalPages: totalPages,
			},
		},
		RequestID: GetRequestID(c),
	})
}

// Error sends an error response with details
func Error(c *gin.Context, httpStatus int, code string, message string, details ...ErrorDetail) {
	c.JSON(httpStatus, ErrorResponse{
		Code:      code,
		HTTPCode:  httpStatus,
		Message:   message,
		Details:   details,
		RequestID: GetRequestID(c),
	})
}

// ErrorWithReason sends an error response with a reason and optional metadata
func ErrorWithReason(c *gin.Context, httpStatus int, code string, message string, reason string, metadata map[string]string) {
	details := []ErrorDetail{
		{
			Reason:   reason,
			Metadata: metadata,
		},
	}
	Error(c, httpStatus, code, message, details...)
}

// BadRequest sends a bad request response
func BadRequest(c *gin.Context, message string) {
	Error(c, http.StatusBadRequest, CodeBadRequest, message)
}

// BadRequestWithReason sends a bad request response with reason
func BadRequestWithReason(c *gin.Context, message string, reason string, metadata map[string]string) {
	ErrorWithReason(c, http.StatusBadRequest, CodeBadRequest, message, reason, metadata)
}

// Unauthorized sends an unauthorized response
func Unauthorized(c *gin.Context, message string) {
	Error(c, http.StatusUnauthorized, CodeUnauthorized, message)
}

// UnauthorizedWithReason sends an unauthorized response with reason
func UnauthorizedWithReason(c *gin.Context, message string, reason string, metadata map[string]string) {
	ErrorWithReason(c, http.StatusUnauthorized, CodeUnauthorized, message, reason, metadata)
}

// Forbidden sends a forbidden response
func Forbidden(c *gin.Context, message string) {
	Error(c, http.StatusForbidden, CodeForbidden, message)
}

// ForbiddenWithReason sends a forbidden response with reason
func ForbiddenWithReason(c *gin.Context, message string, reason string, metadata map[string]string) {
	ErrorWithReason(c, http.StatusForbidden, CodeForbidden, message, reason, metadata)
}

// NotFound sends a not found response
func NotFound(c *gin.Context, message string) {
	Error(c, http.StatusNotFound, CodeNotFound, message)
}

// NotFoundWithReason sends a not found response with reason
func NotFoundWithReason(c *gin.Context, message string, reason string, metadata map[string]string) {
	ErrorWithReason(c, http.StatusNotFound, CodeNotFound, message, reason, metadata)
}

// Conflict sends a conflict response
func Conflict(c *gin.Context, message string) {
	Error(c, http.StatusConflict, CodeConflict, message)
}

// ConflictWithReason sends a conflict response with reason
func ConflictWithReason(c *gin.Context, message string, reason string, metadata map[string]string) {
	ErrorWithReason(c, http.StatusConflict, CodeConflict, message, reason, metadata)
}

// InternalError sends an internal server error response
func InternalError(c *gin.Context, message string) {
	Error(c, http.StatusInternalServerError, CodeInternalError, message)
}

// InternalErrorWithReason sends an internal server error response with reason
func InternalErrorWithReason(c *gin.Context, message string, reason string, metadata map[string]string) {
	ErrorWithReason(c, http.StatusInternalServerError, CodeInternalError, message, reason, metadata)
}

// ValidationError sends a validation error response
func ValidationError(c *gin.Context, message string) {
	Error(c, http.StatusBadRequest, CodeValidationError, message)
}

// ValidationErrorWithReason sends a validation error response with reason
func ValidationErrorWithReason(c *gin.Context, message string, reason string, metadata map[string]string) {
	ErrorWithReason(c, http.StatusBadRequest, CodeValidationError, message, reason, metadata)
}

// HandleError handles an error and sends the appropriate response
// It supports both AppError and regular errors
func HandleError(c *gin.Context, err error) {
	if err == nil {
		return
	}

	// Check if it's an AppError
	if appErr := apperrors.GetAppError(err); appErr != nil {
		// Convert AppError details to response ErrorDetails
		var details []ErrorDetail
		for _, d := range appErr.Details {
			details = append(details, ErrorDetail{
				Reason:   d.Reason,
				Metadata: d.Metadata,
			})
		}
		Error(c, appErr.HTTPCode, appErr.Code, appErr.Message, details...)
		return
	}

	// Default to internal error for unknown errors
	InternalError(c, "internal server error")
}
