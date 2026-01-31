package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"

	"github.com/leondli/workspace/pkg/jwt"
	"github.com/leondli/workspace/pkg/response"
)

const (
	// AuthorizationHeader is the header key for authorization
	AuthorizationHeader = "Authorization"
	// BearerPrefix is the prefix for bearer tokens
	BearerPrefix = "Bearer "
	// ContextUserID is the context key for user ID
	ContextUserID = "user_id"
	// ContextAppID is the context key for app ID (application ID)
	ContextAppID = "app_id"
	// ContextUsername is the context key for username
	ContextUsername = "username"
	// ContextEmail is the context key for email
	ContextEmail = "email"
)

// AuthMiddleware creates a JWT authentication middleware
func AuthMiddleware(jwtManager *jwt.JWTManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader(AuthorizationHeader)
		if authHeader == "" {
			response.Unauthorized(c, "missing authorization header")
			c.Abort()
			return
		}

		if !strings.HasPrefix(authHeader, BearerPrefix) {
			response.Unauthorized(c, "invalid authorization header format")
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, BearerPrefix)
		claims, err := jwtManager.ValidateAccessToken(tokenString)
		if err != nil {
			log.Debug().Err(err).Msg("Token validation failed")
			if err == jwt.ErrExpiredToken {
				response.Unauthorized(c, "token has expired")
			} else {
				response.Unauthorized(c, "invalid token")
			}
			c.Abort()
			return
		}

		// Set user info in context
		c.Set(ContextUserID, claims.UserID)
		c.Set(ContextAppID, claims.AppID)
		c.Set(ContextUsername, claims.Username)
		c.Set(ContextEmail, claims.Email)

		c.Next()
	}
}

// GetUserID retrieves the user ID from context
func GetUserID(c *gin.Context) string {
	userID, exists := c.Get(ContextUserID)
	if !exists {
		return ""
	}
	return userID.(string)
}

// GetAppID retrieves the app ID (application ID) from context
func GetAppID(c *gin.Context) string {
	appID, exists := c.Get(ContextAppID)
	if !exists {
		return ""
	}
	return appID.(string)
}

// GetUsername retrieves the username from context
func GetUsername(c *gin.Context) string {
	username, exists := c.Get(ContextUsername)
	if !exists {
		return ""
	}
	return username.(string)
}

// GetEmail retrieves the email from context
func GetEmail(c *gin.Context) string {
	email, exists := c.Get(ContextEmail)
	if !exists {
		return ""
	}
	return email.(string)
}
