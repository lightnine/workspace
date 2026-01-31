package errors

import (
	"errors"
	"fmt"
	"net/http"
)

// Error codes as strings (matching response package)
const (
	CodeSuccess           = "SUCCESS"
	CodeBadRequest        = "BAD_REQUEST"
	CodeUnauthorized      = "UNAUTHORIZED"
	CodeForbidden         = "PERMISSION_DENIED"
	CodeNotFound          = "NOT_FOUND"
	CodeConflict          = "ALREADY_EXISTS"
	CodeInternalError     = "INTERNAL_ERROR"
	CodeValidationError   = "VALIDATION_ERROR"
	CodeInvalidArgument   = "INVALID_ARGUMENT"
	CodeResourceExhausted = "RESOURCE_EXHAUSTED"
)

// Application error codes
var (
	ErrNotFound          = errors.New("resource not found")
	ErrAlreadyExists     = errors.New("resource already exists")
	ErrUnauthorized      = errors.New("unauthorized")
	ErrForbidden         = errors.New("forbidden")
	ErrInvalidInput      = errors.New("invalid input")
	ErrInternalServer    = errors.New("internal server error")
	ErrInvalidCredential = errors.New("invalid credentials")
	ErrTokenExpired      = errors.New("token expired")
	ErrTokenInvalid      = errors.New("invalid token")
)

// ErrorDetail provides additional error information
type ErrorDetail struct {
	Reason   string            `json:"reason"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// AppError represents an application-specific error
type AppError struct {
	Code     string        // Error code string
	HTTPCode int           // HTTP status code
	Message  string        // User-friendly message
	Details  []ErrorDetail // Additional error details
	Err      error         // Underlying error
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

func (e *AppError) Unwrap() error {
	return e.Err
}

// WithDetail adds a detail to the error
func (e *AppError) WithDetail(reason string, metadata map[string]string) *AppError {
	e.Details = append(e.Details, ErrorDetail{
		Reason:   reason,
		Metadata: metadata,
	})
	return e
}

// NewAppError creates a new application error
func NewAppError(code string, httpCode int, message string, err error) *AppError {
	return &AppError{
		Code:     code,
		HTTPCode: httpCode,
		Message:  message,
		Err:      err,
	}
}

// NotFoundError creates a not found error
func NotFoundError(resource string) *AppError {
	return &AppError{
		Code:     CodeNotFound,
		HTTPCode: http.StatusNotFound,
		Message:  fmt.Sprintf("%s not found", resource),
		Err:      ErrNotFound,
	}
}

// AlreadyExistsError creates an already exists error
func AlreadyExistsError(resource string) *AppError {
	return &AppError{
		Code:     CodeConflict,
		HTTPCode: http.StatusConflict,
		Message:  fmt.Sprintf("%s already exists", resource),
		Err:      ErrAlreadyExists,
	}
}

// UnauthorizedError creates an unauthorized error
func UnauthorizedError(message string) *AppError {
	return &AppError{
		Code:     CodeUnauthorized,
		HTTPCode: http.StatusUnauthorized,
		Message:  message,
		Err:      ErrUnauthorized,
	}
}

// ForbiddenError creates a forbidden error
func ForbiddenError(message string) *AppError {
	return &AppError{
		Code:     CodeForbidden,
		HTTPCode: http.StatusForbidden,
		Message:  message,
		Err:      ErrForbidden,
	}
}

// ForbiddenErrorWithPermission creates a forbidden error with permission detail
func ForbiddenErrorWithPermission(message string, permission string) *AppError {
	return &AppError{
		Code:     CodeForbidden,
		HTTPCode: http.StatusForbidden,
		Message:  message,
		Err:      ErrForbidden,
		Details: []ErrorDetail{
			{
				Reason: "IAM_PERMISSION_DENIED",
				Metadata: map[string]string{
					"permission": permission,
				},
			},
		},
	}
}

// ValidationError creates a validation error
func ValidationError(message string) *AppError {
	return &AppError{
		Code:     CodeValidationError,
		HTTPCode: http.StatusBadRequest,
		Message:  message,
		Err:      ErrInvalidInput,
	}
}

// InvalidArgumentError creates an invalid argument error
func InvalidArgumentError(message string, field string) *AppError {
	return &AppError{
		Code:     CodeInvalidArgument,
		HTTPCode: http.StatusBadRequest,
		Message:  message,
		Err:      ErrInvalidInput,
		Details: []ErrorDetail{
			{
				Reason: "INVALID_FIELD",
				Metadata: map[string]string{
					"field": field,
				},
			},
		},
	}
}

// InternalError creates an internal server error
func InternalError(message string, err error) *AppError {
	return &AppError{
		Code:     CodeInternalError,
		HTTPCode: http.StatusInternalServerError,
		Message:  message,
		Err:      err,
	}
}

// BadRequestError creates a bad request error
func BadRequestError(message string) *AppError {
	return &AppError{
		Code:     CodeBadRequest,
		HTTPCode: http.StatusBadRequest,
		Message:  message,
		Err:      ErrInvalidInput,
	}
}

// IsNotFound checks if the error is a not found error
func IsNotFound(err error) bool {
	return errors.Is(err, ErrNotFound)
}

// IsAlreadyExists checks if the error is an already exists error
func IsAlreadyExists(err error) bool {
	return errors.Is(err, ErrAlreadyExists)
}

// IsUnauthorized checks if the error is an unauthorized error
func IsUnauthorized(err error) bool {
	return errors.Is(err, ErrUnauthorized)
}

// IsForbidden checks if the error is a forbidden error
func IsForbidden(err error) bool {
	return errors.Is(err, ErrForbidden)
}

// GetAppError attempts to extract AppError from error chain
func GetAppError(err error) *AppError {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr
	}
	return nil
}
