package config

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/rs/zerolog/log"
	"github.com/spf13/viper"
)

// Config holds all configuration for the application
type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	JWT      JWTConfig      `mapstructure:"jwt"`
	Storage  StorageConfig  `mapstructure:"storage"`
	Log      LogConfig      `mapstructure:"log"`
	Kernel   KernelConfig   `mapstructure:"kernel"`
}

type ServerConfig struct {
	Host string `mapstructure:"host"`
	Port int    `mapstructure:"port"`
	Mode string `mapstructure:"mode"`
}

type DatabaseConfig struct {
	Host            string `mapstructure:"host"`
	Port            int    `mapstructure:"port"`
	User            string `mapstructure:"user"`
	Password        string `mapstructure:"password"`
	DBName          string `mapstructure:"dbname"`
	SSLMode         string `mapstructure:"sslmode"`
	MaxIdleConns    int    `mapstructure:"max_idle_conns"`
	MaxOpenConns    int    `mapstructure:"max_open_conns"`
	ConnMaxLifetime int    `mapstructure:"conn_max_lifetime"`
}

type JWTConfig struct {
	Secret             string `mapstructure:"secret"`
	AccessTokenExpiry  int    `mapstructure:"access_token_expiry"`
	RefreshTokenExpiry int    `mapstructure:"refresh_token_expiry"`
	Issuer             string `mapstructure:"issuer"`
}

type StorageConfig struct {
	BasePath    string `mapstructure:"base_path"`
	VersionPath string `mapstructure:"version_path"`
}

type LogConfig struct {
	Level    string `mapstructure:"level"`
	Format   string `mapstructure:"format"`
	Output   string `mapstructure:"output"`
	FilePath string `mapstructure:"file_path"`
}

type KernelConfig struct {
	PythonPath       string        `mapstructure:"python_path"`
	ExecutionTimeout int           `mapstructure:"execution_timeout"`
	Gateway          GatewayConfig `mapstructure:"gateway"`
}

// GatewayConfig holds configuration for remote Jupyter Gateway
type GatewayConfig struct {
	Enabled           bool   `mapstructure:"enabled"`             // Enable remote gateway mode
	URL               string `mapstructure:"url"`                 // Gateway server URL, e.g., http://gateway:8888
	AuthToken         string `mapstructure:"auth_token"`          // Authentication token for gateway
	ConnectTimeout    int    `mapstructure:"connect_timeout"`     // Connection timeout in seconds (default: 30)
	RequestTimeout    int    `mapstructure:"request_timeout"`     // Request timeout in seconds (default: 60)
	WSPingInterval    int    `mapstructure:"ws_ping_interval"`    // WebSocket ping interval in seconds (default: 30)
	ValidateCert      bool   `mapstructure:"validate_cert"`       // Validate SSL certificate (default: true)
	LaunchTimeout     int    `mapstructure:"launch_timeout"`      // Kernel launch timeout in seconds (default: 60)
	HTTPUser          string `mapstructure:"http_user"`           // HTTP Basic Auth username
	HTTPPassword      string `mapstructure:"http_password"`       // HTTP Basic Auth password
	Headers           string `mapstructure:"headers"`             // Custom headers as JSON string
	ClientCert        string `mapstructure:"client_cert"`         // Client certificate path
	ClientKey         string `mapstructure:"client_key"`          // Client key path
	CACerts           string `mapstructure:"ca_certs"`            // CA certificates path
}

var (
	cfg  *Config
	once sync.Once
	mu   sync.RWMutex
)

// Load initializes the configuration from config file
func Load(configPath string) (*Config, error) {
	var loadErr error

	once.Do(func() {
		viper.SetConfigFile(configPath)
		viper.SetConfigType("yaml")

		// Enable environment variable override
		viper.AutomaticEnv()
		viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

		if err := viper.ReadInConfig(); err != nil {
			loadErr = fmt.Errorf("failed to read config file: %w", err)
			return
		}

		cfg = &Config{}
		if err := viper.Unmarshal(cfg); err != nil {
			loadErr = fmt.Errorf("failed to unmarshal config: %w", err)
			return
		}

		// Enable hot reload
		viper.WatchConfig()
		viper.OnConfigChange(func(e fsnotify.Event) {
			log.Info().Str("file", e.Name).Msg("Config file changed, reloading...")
			mu.Lock()
			defer mu.Unlock()
			if err := viper.Unmarshal(cfg); err != nil {
				log.Error().Err(err).Msg("Failed to reload config")
			} else {
				log.Info().Msg("Config reloaded successfully")
			}
		})
	})

	return cfg, loadErr
}

// Get returns the current configuration (thread-safe)
func Get() *Config {
	mu.RLock()
	defer mu.RUnlock()
	return cfg
}

// GetDSN returns the PostgreSQL connection string
func (d *DatabaseConfig) GetDSN() string {
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		d.Host, d.Port, d.User, d.Password, d.DBName, d.SSLMode,
	)
}

// GetConnMaxLifetime returns the connection max lifetime as time.Duration
func (d *DatabaseConfig) GetConnMaxLifetime() time.Duration {
	return time.Duration(d.ConnMaxLifetime) * time.Second
}

// GetAccessTokenExpiry returns access token expiry as time.Duration
func (j *JWTConfig) GetAccessTokenExpiry() time.Duration {
	return time.Duration(j.AccessTokenExpiry) * time.Second
}

// GetRefreshTokenExpiry returns refresh token expiry as time.Duration
func (j *JWTConfig) GetRefreshTokenExpiry() time.Duration {
	return time.Duration(j.RefreshTokenExpiry) * time.Second
}

// GetAddress returns the server address
func (s *ServerConfig) GetAddress() string {
	return fmt.Sprintf("%s:%d", s.Host, s.Port)
}
