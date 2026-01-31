package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/leondli/workspace/internal/adapter/handler"
	"github.com/leondli/workspace/internal/adapter/repository"
	"github.com/leondli/workspace/internal/adapter/storage"
	"github.com/leondli/workspace/internal/infrastructure/config"
	"github.com/leondli/workspace/internal/infrastructure/database"
	"github.com/leondli/workspace/internal/infrastructure/logger"
	"github.com/leondli/workspace/internal/infrastructure/server"
	"github.com/leondli/workspace/internal/usecase/auth"
	"github.com/leondli/workspace/internal/usecase/kernel"
	"github.com/leondli/workspace/internal/usecase/object"
	"github.com/leondli/workspace/internal/usecase/permission"
	"github.com/leondli/workspace/internal/usecase/search"
	"github.com/leondli/workspace/internal/usecase/tag"
	"github.com/leondli/workspace/internal/usecase/user"
	"github.com/leondli/workspace/internal/usecase/version"
	"github.com/leondli/workspace/pkg/jwt"
)

func main() {
	// Load configuration
	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "config/config.yaml"
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load configuration")
	}

	// Initialize logger
	logger.Init(&cfg.Log)
	log.Info().Msg("Starting Workspace Backend...")

	// Initialize database
	db, err := database.Init(&cfg.Database)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer database.Close()

	// Initialize file storage
	fileStorage := storage.NewLocalFileStorage(cfg.Storage.BasePath, cfg.Storage.VersionPath)

	// Initialize JWT manager
	jwtManager := jwt.NewJWTManager(
		cfg.JWT.Secret,
		cfg.JWT.GetAccessTokenExpiry(),
		cfg.JWT.GetRefreshTokenExpiry(),
		cfg.JWT.Issuer,
	)

	// Initialize repositories
	userRepo := repository.NewUserRepository(db)
	refreshTokenRepo := repository.NewRefreshTokenRepository(db)
	objectRepo := repository.NewObjectRepository(db)
	permissionRepo := repository.NewPermissionRepository(db)
	versionRepo := repository.NewVersionRepository(db)
	tagRepo := repository.NewTagRepository(db)

	// Initialize use cases
	authUseCase := auth.NewUseCase(userRepo, refreshTokenRepo, jwtManager, &cfg.Storage)
	userUseCase := user.NewUseCase(userRepo)
	objectUseCase := object.NewUseCase(objectRepo, versionRepo, permissionRepo, fileStorage)
	permissionUseCase := permission.NewUseCase(permissionRepo, objectRepo, userRepo)
	versionUseCase := version.NewUseCase(versionRepo, objectRepo, fileStorage)
	searchUseCase := search.NewUseCase(objectRepo, tagRepo, fileStorage)
	tagUseCase := tag.NewUseCase(tagRepo, objectRepo)

	// Initialize kernel use case with gateway support
	var kernelUseCase *kernel.UseCase
	if cfg.Kernel.Gateway.Enabled {
		log.Info().Str("gateway_url", cfg.Kernel.Gateway.URL).Msg("Initializing kernel with gateway support")
		var err error
		kernelUseCase, err = kernel.NewUseCaseWithGateway(cfg.Kernel.PythonPath, cfg.Storage.BasePath, &cfg.Kernel.Gateway)
		if err != nil {
			log.Warn().Err(err).Msg("Failed to initialize gateway, falling back to local kernel mode")
			kernelUseCase = kernel.NewUseCase(cfg.Kernel.PythonPath, cfg.Storage.BasePath)
		}
	} else {
		kernelUseCase = kernel.NewUseCase(cfg.Kernel.PythonPath, cfg.Storage.BasePath)
	}

	// Initialize handlers
	handlers := &handler.Handlers{
		Auth:       handler.NewAuthHandler(authUseCase),
		User:       handler.NewUserHandler(userUseCase),
		Object:     handler.NewObjectHandler(objectUseCase),
		Permission: handler.NewPermissionHandler(permissionUseCase),
		Version:    handler.NewVersionHandler(versionUseCase),
		Search:     handler.NewSearchHandler(searchUseCase),
		Tag:        handler.NewTagHandler(tagUseCase),
		Kernel:     handler.NewKernelHandler(kernelUseCase),
	}

	// Initialize HTTP server
	srv := server.New(&cfg.Server)
	handler.RegisterRoutes(srv.Router(), handlers, jwtManager)

	// Start server in goroutine
	go func() {
		if err := srv.Start(); err != nil {
			log.Fatal().Err(err).Msg("Failed to start server")
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("Server forced to shutdown")
	}

	log.Info().Msg("Server exited")
}
