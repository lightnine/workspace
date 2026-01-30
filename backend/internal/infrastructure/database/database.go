package database

import (
	"fmt"

	"github.com/rs/zerolog/log"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/leondli/workspace/internal/infrastructure/config"
)

var db *gorm.DB

// Init initializes the database connection
func Init(cfg *config.DatabaseConfig) (*gorm.DB, error) {
	dsn := cfg.GetDSN()

	gormConfig := &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Info),
	}

	var err error
	db, err = gorm.Open(postgres.Open(dsn), gormConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get underlying sql.DB: %w", err)
	}

	// Configure connection pool
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetConnMaxLifetime(cfg.GetConnMaxLifetime())

	log.Info().
		Str("host", cfg.Host).
		Int("port", cfg.Port).
		Str("dbname", cfg.DBName).
		Msg("Database connected successfully")

	return db, nil
}

// GetDB returns the database instance
func GetDB() *gorm.DB {
	return db
}

// Close closes the database connection
func Close() error {
	if db != nil {
		sqlDB, err := db.DB()
		if err != nil {
			return err
		}
		return sqlDB.Close()
	}
	return nil
}
