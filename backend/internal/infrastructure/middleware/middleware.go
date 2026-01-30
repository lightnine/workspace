package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

const (
	// ContextRequestID is the context key for request ID
	ContextRequestID = "request_id"
)

// RequestLogger creates a logging middleware
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		// Generate request ID
		requestID := uuid.New().String()
		c.Set(ContextRequestID, requestID)
		c.Header("X-Request-ID", requestID)

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
				requestID, _ := c.Get(ContextRequestID)
				log.Error().
					Str("request_id", requestID.(string)).
					Interface("error", err).
					Str("path", c.Request.URL.Path).
					Msg("Panic recovered")

				c.AbortWithStatusJSON(500, gin.H{
					"code":    50000,
					"message": "internal server error",
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
	requestID, exists := c.Get(ContextRequestID)
	if !exists {
		return ""
	}
	return requestID.(string)
}
