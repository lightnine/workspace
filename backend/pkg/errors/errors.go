package errors

import (
	"errors"
	"fmt"
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

// AppError represents an application-specific error
type AppError struct {
	Code    int
	Message string
	Err     error
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

// NewAppError creates a new application error
func NewAppError(code int, message string, err error) *AppError {
	return &AppError{
		Code:    code,
		Message: message,
		Err:     err,
	}
}

// NotFoundError creates a not found error
func NotFoundError(resource string) *AppError {
	return &AppError{
		Code:    40400,
		Message: fmt.Sprintf("%s not found", resource),
		Err:     ErrNotFound,
	}
}

// AlreadyExistsError creates an already exists error
func AlreadyExistsError(resource string) *AppError {
	return &AppError{
		Code:    40900,
		Message: fmt.Sprintf("%s already exists", resource),
		Err:     ErrAlreadyExists,
	}
}

// UnauthorizedError creates an unauthorized error
func UnauthorizedError(message string) *AppError {
	return &AppError{
		Code:    40100,
		Message: message,
		Err:     ErrUnauthorized,
	}
}

// ForbiddenError creates a forbidden error
func ForbiddenError(message string) *AppError {
	return &AppError{
		Code:    40300,
		Message: message,
		Err:     ErrForbidden,
	}
}

// ValidationError creates a validation error
func ValidationError(message string) *AppError {
	return &AppError{
		Code:    40000,
		Message: message,
		Err:     ErrInvalidInput,
	}
}

// InternalError creates an internal server error
func InternalError(message string, err error) *AppError {
	return &AppError{
		Code:    50000,
		Message: message,
		Err:     err,
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
