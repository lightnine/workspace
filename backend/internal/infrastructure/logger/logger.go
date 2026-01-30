package logger

import (
	"io"
	"os"
	"path/filepath"
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
		// Output only to file (no colors)
		file, err := openLogFile(cfg.FilePath)
		if err != nil {
			// Fallback to stdout with console format
			output = zerolog.ConsoleWriter{
				Out:        os.Stdout,
				TimeFormat: time.RFC3339,
				NoColor:    false,
			}
			log.Logger = zerolog.New(output).With().Timestamp().Caller().Logger()
			log.Error().Err(err).Msg("Failed to open log file, falling back to stdout")
			return
		}
		if cfg.Format == "console" {
			// File output with console format but NO colors
			output = zerolog.ConsoleWriter{
				Out:        file,
				TimeFormat: time.RFC3339,
				NoColor:    true, // No colors for file
			}
		} else {
			// JSON format
			output = file
		}

	case "both":
		// Output to both stdout (with colors) and file (without colors)
		var stdoutWriter io.Writer
		var fileWriter io.Writer

		if cfg.Format == "console" {
			// Stdout with colors
			stdoutWriter = zerolog.ConsoleWriter{
				Out:        os.Stdout,
				TimeFormat: time.RFC3339,
				NoColor:    false, // Colors for terminal
			}
		} else {
			stdoutWriter = os.Stdout
		}

		if cfg.FilePath != "" {
			file, err := openLogFile(cfg.FilePath)
			if err != nil {
				log.Error().Err(err).Msg("Failed to open log file, using stdout only")
			} else {
				if cfg.Format == "console" {
					// File output without colors
					fileWriter = zerolog.ConsoleWriter{
						Out:        file,
						TimeFormat: time.RFC3339,
						NoColor:    true, // No colors for file
					}
				} else {
					fileWriter = file
				}
			}
		}

		if fileWriter != nil {
			output = io.MultiWriter(stdoutWriter, fileWriter)
		} else {
			output = stdoutWriter
		}

	default:
		// Default: stdout only
		if cfg.Format == "console" {
			output = zerolog.ConsoleWriter{
				Out:        os.Stdout,
				TimeFormat: time.RFC3339,
				NoColor:    false,
			}
		} else {
			output = os.Stdout
		}
	}

	// Set global logger
	log.Logger = zerolog.New(output).With().Timestamp().Caller().Logger()
}

// openLogFile opens or creates a log file, creating parent directories if needed
func openLogFile(filePath string) (*os.File, error) {
	// Create parent directory if not exists
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	return os.OpenFile(filePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
}

// NewLogger creates a new logger with the given component name
func NewLogger(component string) zerolog.Logger {
	return log.With().Str("component", component).Logger()
}
