package server

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"

	"github.com/leondli/workspace/internal/infrastructure/config"
	"github.com/leondli/workspace/internal/infrastructure/middleware"
)

// Server represents the HTTP server
type Server struct {
	router     *gin.Engine
	httpServer *http.Server
	config     *config.ServerConfig
}

// New creates a new HTTP server
func New(cfg *config.ServerConfig) *Server {
	// Set Gin mode
	gin.SetMode(cfg.Mode)

	router := gin.New()

	// Apply global middleware
	router.Use(middleware.Recovery())
	router.Use(middleware.RequestLogger())
	router.Use(middleware.CORS())

	return &Server{
		router: router,
		config: cfg,
	}
}

// Router returns the Gin router
func (s *Server) Router() *gin.Engine {
	return s.router
}

// Start starts the HTTP server
func (s *Server) Start() error {
	s.httpServer = &http.Server{
		Addr:         s.config.GetAddress(),
		Handler:      s.router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Info().
		Str("address", s.config.GetAddress()).
		Str("mode", s.config.Mode).
		Msg("Starting HTTP server")

	if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

// Shutdown gracefully shuts down the server
func (s *Server) Shutdown(ctx context.Context) error {
	log.Info().Msg("Shutting down HTTP server...")
	return s.httpServer.Shutdown(ctx)
}
