package logger

import (
	"io"
	"os"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/leondli/workspace/internal/infrastructure/config"
)

// Init initializes the global zerolog logger
func Init(cfg *config.LogConfig) {
	// Set log level
	level, err := zerolog.ParseLevel(cfg.Level)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)

	// Configure output
	var output io.Writer
	switch cfg.Output {
	case "file":
		file, err := os.OpenFile(cfg.FilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
		if err != nil {
			output = os.Stdout
		} else {
			output = file
		}
	default:
		output = os.Stdout
	}

	// Configure format
	if cfg.Format == "console" {
		output = zerolog.ConsoleWriter{
			Out:        output,
			TimeFormat: time.RFC3339,
		}
	}

	// Set global logger
	log.Logger = zerolog.New(output).With().Timestamp().Caller().Logger()
}

// NewLogger creates a new logger with the given component name
func NewLogger(component string) zerolog.Logger {
	return log.With().Str("component", component).Logger()
}
