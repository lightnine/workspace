package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"syscall"

	"github.com/rs/zerolog/log"
)

// FileStorage defines the interface for file storage operations
type FileStorage interface {
	// CreateDirectory creates a directory
	CreateDirectory(ctx context.Context, path string) error

	// WriteFile writes content to a file
	WriteFile(ctx context.Context, path string, content []byte) error

	// ReadFile reads content from a file
	ReadFile(ctx context.Context, path string) ([]byte, error)

	// Delete deletes a file or directory
	Delete(ctx context.Context, path string) error

	// Move moves a file or directory
	Move(ctx context.Context, srcPath, dstPath string) error

	// Copy copies a file
	Copy(ctx context.Context, srcPath, dstPath string) error

	// Exists checks if a file or directory exists
	Exists(ctx context.Context, path string) (bool, error)

	// IsDirectory checks if the path is a directory
	IsDirectory(ctx context.Context, path string) (bool, error)

	// GetSize returns the size of a file
	GetSize(ctx context.Context, path string) (int64, error)

	// GetInode returns the inode of a file or directory
	GetInode(ctx context.Context, path string) (int64, error)

	// CalculateHash calculates SHA256 hash of content
	CalculateHash(content []byte) string

	// GetFullPath returns the full storage path
	GetFullPath(relativePath string) string
}

// LocalFileStorage implements FileStorage for local filesystem (JuiceFS)
type LocalFileStorage struct {
	basePath    string
	versionPath string
}

// NewLocalFileStorage creates a new local file storage
func NewLocalFileStorage(basePath, versionPath string) *LocalFileStorage {
	return &LocalFileStorage{
		basePath:    basePath,
		versionPath: versionPath,
	}
}

func (s *LocalFileStorage) GetFullPath(relativePath string) string {
	return filepath.Join(s.basePath, relativePath)
}

func (s *LocalFileStorage) GetVersionPath(relativePath string) string {
	return filepath.Join(s.versionPath, relativePath)
}

func (s *LocalFileStorage) CreateDirectory(ctx context.Context, path string) error {
	fullPath := s.GetFullPath(path)
	log.Debug().Str("path", fullPath).Msg("Creating directory")
	return os.MkdirAll(fullPath, 0755)
}

func (s *LocalFileStorage) WriteFile(ctx context.Context, path string, content []byte) error {
	fullPath := s.GetFullPath(path)

	// Ensure parent directory exists
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create parent directory: %w", err)
	}

	log.Debug().Str("path", fullPath).Int("size", len(content)).Msg("Writing file")
	return os.WriteFile(fullPath, content, 0644)
}

func (s *LocalFileStorage) ReadFile(ctx context.Context, path string) ([]byte, error) {
	fullPath := s.GetFullPath(path)
	log.Debug().Str("path", fullPath).Msg("Reading file")
	return os.ReadFile(fullPath)
}

func (s *LocalFileStorage) Delete(ctx context.Context, path string) error {
	fullPath := s.GetFullPath(path)
	log.Debug().Str("path", fullPath).Msg("Deleting file/directory")
	return os.RemoveAll(fullPath)
}

func (s *LocalFileStorage) Move(ctx context.Context, srcPath, dstPath string) error {
	fullSrcPath := s.GetFullPath(srcPath)
	fullDstPath := s.GetFullPath(dstPath)

	// Ensure destination parent directory exists
	dstDir := filepath.Dir(fullDstPath)
	if err := os.MkdirAll(dstDir, 0755); err != nil {
		return fmt.Errorf("failed to create destination directory: %w", err)
	}

	log.Debug().Str("src", fullSrcPath).Str("dst", fullDstPath).Msg("Moving file/directory")
	return os.Rename(fullSrcPath, fullDstPath)
}

func (s *LocalFileStorage) Copy(ctx context.Context, srcPath, dstPath string) error {
	fullSrcPath := s.GetFullPath(srcPath)
	fullDstPath := s.GetFullPath(dstPath)

	// Ensure destination parent directory exists
	dstDir := filepath.Dir(fullDstPath)
	if err := os.MkdirAll(dstDir, 0755); err != nil {
		return fmt.Errorf("failed to create destination directory: %w", err)
	}

	log.Debug().Str("src", fullSrcPath).Str("dst", fullDstPath).Msg("Copying file")

	srcFile, err := os.Open(fullSrcPath)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	dstFile, err := os.Create(fullDstPath)
	if err != nil {
		return err
	}
	defer dstFile.Close()

	_, err = io.Copy(dstFile, srcFile)
	return err
}

func (s *LocalFileStorage) Exists(ctx context.Context, path string) (bool, error) {
	fullPath := s.GetFullPath(path)
	_, err := os.Stat(fullPath)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

func (s *LocalFileStorage) IsDirectory(ctx context.Context, path string) (bool, error) {
	fullPath := s.GetFullPath(path)
	info, err := os.Stat(fullPath)
	if err != nil {
		return false, err
	}
	return info.IsDir(), nil
}

func (s *LocalFileStorage) GetSize(ctx context.Context, path string) (int64, error) {
	fullPath := s.GetFullPath(path)
	info, err := os.Stat(fullPath)
	if err != nil {
		return 0, err
	}
	return info.Size(), nil
}

func (s *LocalFileStorage) GetInode(ctx context.Context, path string) (int64, error) {
	fullPath := s.GetFullPath(path)
	info, err := os.Stat(fullPath)
	if err != nil {
		return 0, err
	}

	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return 0, fmt.Errorf("failed to get inode: unsupported platform")
	}

	return int64(stat.Ino), nil
}

func (s *LocalFileStorage) CalculateHash(content []byte) string {
	hash := sha256.Sum256(content)
	return hex.EncodeToString(hash[:])
}

// SaveVersion saves a version snapshot of a file
func (s *LocalFileStorage) SaveVersion(ctx context.Context, objectPath string, versionNumber int, content []byte) (string, error) {
	versionFileName := fmt.Sprintf("%s.v%d", filepath.Base(objectPath), versionNumber)
	versionDir := filepath.Join(s.versionPath, filepath.Dir(objectPath))

	if err := os.MkdirAll(versionDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create version directory: %w", err)
	}

	versionPath := filepath.Join(versionDir, versionFileName)
	if err := os.WriteFile(versionPath, content, 0644); err != nil {
		return "", err
	}

	return versionPath, nil
}

// ReadVersion reads a version snapshot
func (s *LocalFileStorage) ReadVersion(ctx context.Context, storagePath string) ([]byte, error) {
	return os.ReadFile(storagePath)
}

// DeleteVersion deletes a version snapshot
func (s *LocalFileStorage) DeleteVersion(ctx context.Context, storagePath string) error {
	return os.Remove(storagePath)
}
