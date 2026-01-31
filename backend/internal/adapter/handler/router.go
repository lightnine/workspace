package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/leondli/workspace/internal/infrastructure/middleware"
	"github.com/leondli/workspace/pkg/jwt"
)

// Handlers contains all HTTP handlers
type Handlers struct {
	Auth       *AuthHandler
	User       *UserHandler
	Object     *ObjectHandler
	Permission *PermissionHandler
	Version    *VersionHandler
	Search     *SearchHandler
	Tag        *TagHandler
	Kernel     *KernelHandler
}

// RegisterRoutes registers all API routes
func RegisterRoutes(router *gin.Engine, handlers *Handlers, jwtManager *jwt.JWTManager) {
	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// API v1
	v1 := router.Group("/api/v1")

	// Auth routes (public)
	auth := v1.Group("/auth")
	{
		auth.POST("/register", handlers.Auth.Register)
		auth.POST("/login", handlers.Auth.Login)
		auth.POST("/refresh", handlers.Auth.RefreshToken)
	}

	// Protected routes
	protected := v1.Group("")
	protected.Use(middleware.AuthMiddleware(jwtManager))
	{
		// Auth routes (protected)
		protected.POST("/auth/logout", handlers.Auth.Logout)

		// User routes
		users := protected.Group("/users")
		{
			users.GET("/me", handlers.User.GetMe)
			users.PUT("/me", handlers.User.UpdateMe)
			users.PUT("/me/password", handlers.Auth.ChangePassword)
			users.GET("/app", handlers.User.ListByAppID)
		}

		// Object routes
		objects := protected.Group("/objects")
		{
			objects.GET("", handlers.Object.List)
			objects.GET("/tree", handlers.Object.GetTree)
			objects.POST("/directories", handlers.Object.CreateDirectory)
			objects.POST("/files", handlers.Object.CreateFile)
			objects.GET("/:id", handlers.Object.GetByID)
			objects.PUT("/:id", handlers.Object.Update)
			objects.DELETE("/:id", handlers.Object.Delete)
			objects.GET("/:id/content", handlers.Object.GetContent)
			objects.PUT("/:id/content", handlers.Object.SaveContent)
			objects.PATCH("/:id/notebook", handlers.Object.PatchNotebook)
			objects.POST("/:id/move", handlers.Object.Move)
			objects.POST("/:id/copy", handlers.Object.Copy)
			objects.GET("/:id/download", handlers.Object.Download)
		}

		// Permission routes
		permissions := protected.Group("/permissions")
		{
			permissions.GET("/objects/:id", handlers.Permission.ListByObject)
			permissions.POST("/objects/:id", handlers.Permission.Grant)
			permissions.PUT("/objects/:id/:user_id", handlers.Permission.Update)
			permissions.DELETE("/objects/:id/:user_id", handlers.Permission.Revoke)
		}

		// Version routes
		versions := protected.Group("/versions")
		{
			versions.GET("/objects/:id", handlers.Version.ListByObject)
			versions.GET("/:version_id", handlers.Version.GetByID)
			versions.GET("/:version_id/content", handlers.Version.GetContent)
			versions.POST("/:version_id/restore", handlers.Version.Restore)
		}

		// Search routes
		search := protected.Group("/search")
		{
			search.GET("", handlers.Search.SearchByName)
			search.GET("/content", handlers.Search.SearchByContent)
			search.GET("/tags", handlers.Search.SearchByTag)
		}

		// Tag routes
		tags := protected.Group("/tags")
		{
			tags.GET("", handlers.Tag.List)
			tags.POST("", handlers.Tag.Create)
			tags.DELETE("/:id", handlers.Tag.Delete)
			tags.GET("/objects/:obj_id", handlers.Tag.GetObjectTags)
			tags.POST("/objects/:obj_id/:tag_id", handlers.Tag.AddToObject)
			tags.DELETE("/objects/:obj_id/:tag_id", handlers.Tag.RemoveFromObject)
		}

		// Kernel routes
		kernels := protected.Group("/kernels")
		{
			kernels.GET("/specs", handlers.Kernel.ListKernelSpecs)
			kernels.GET("", handlers.Kernel.ListKernels)
			kernels.POST("", handlers.Kernel.StartKernel)
			kernels.GET("/:kernel_id", handlers.Kernel.GetKernelStatus)
			kernels.DELETE("/:kernel_id", handlers.Kernel.StopKernel)
			kernels.POST("/:kernel_id/restart", handlers.Kernel.RestartKernel)
			kernels.POST("/:kernel_id/interrupt", handlers.Kernel.InterruptKernel)
			kernels.POST("/:kernel_id/execute", handlers.Kernel.ExecuteCode)
		}
	}

	// WebSocket route for kernel communication (needs special handling)
	// Note: Authentication is handled within the handler
	router.GET("/api/v1/kernels/:kernel_id/ws", handlers.Kernel.WebSocketConnect)
}
