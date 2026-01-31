package middleware

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/leondli/workspace/pkg/response"
	"github.com/rs/zerolog/log"
)

const (
	// ContextRequestID is the context key for request ID
	ContextRequestID = "request_id"
)

// RequestID creates a middleware to handle request ID
// It will use the X-Request-ID header from frontend if provided, otherwise generate a new one
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Try to get request ID from header (frontend provided)
		requestID := c.GetHeader(response.RequestIDKey)
		
		// If not provided, generate a new one
		if requestID == "" {
			requestID = "req-" + uuid.New().String()
		}
		
		// Store in context and set response header
		c.Set(response.RequestIDKey, requestID)
		c.Set(ContextRequestID, requestID) // Keep backward compatibility
		c.Header(response.RequestIDKey, requestID)
		
		c.Next()
	}
}

// RequestLogger creates a logging middleware
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		// Get request ID (should be set by RequestID middleware)
		requestID := response.GetRequestID(c)

		// Process request
		c.Next()

		// Log request details
		latency := time.Since(start)
		status := c.Writer.Status()

		logger := log.Info()
		if status >= 400 && status < 500 {
			logger = log.Warn()
		} else if status >= 500 {
			logger = log.Error()
		}

		logger.
			Str("request_id", requestID).
			Str("method", c.Request.Method).
			Str("path", c.Request.URL.Path).
			Int("status", status).
			Dur("latency", latency).
			Str("client_ip", c.ClientIP()).
			Str("user_agent", c.Request.UserAgent()).
			Msg("Request completed")
	}
}

// Recovery creates a recovery middleware
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				requestID := response.GetRequestID(c)
				log.Error().
					Str("request_id", requestID).
					Interface("error", err).
					Str("path", c.Request.URL.Path).
					Msg("Panic recovered")

				c.AbortWithStatusJSON(http.StatusInternalServerError, response.ErrorResponse{
					Code:      response.CodeInternalError,
					HTTPCode:  http.StatusInternalServerError,
					Message:   "internal server error",
					RequestID: requestID,
				})
			}
		}()
		c.Next()
	}
}

// CORS creates a CORS middleware
func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization, X-Request-ID")
		c.Header("Access-Control-Expose-Headers", "X-Request-ID")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

// GetRequestID retrieves the request ID from context
func GetRequestID(c *gin.Context) string {
	return response.GetRequestID(c)
}
