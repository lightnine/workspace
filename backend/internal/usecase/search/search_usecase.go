package search

import (
	"bufio"
	"context"
	"os"
	"strings"

	"github.com/leondli/workspace/internal/adapter/storage"
	"github.com/leondli/workspace/internal/domain/entity"
	"github.com/leondli/workspace/internal/domain/repository"
	apperrors "github.com/leondli/workspace/pkg/errors"
)

// UseCase defines the search use case interface
type UseCase interface {
	SearchByName(ctx context.Context, query string, types []entity.ObjectType, page, pageSize int) ([]entity.ObjectResponse, int64, error)
	SearchByContent(ctx context.Context, query string, types []entity.ObjectType, page, pageSize int) ([]ContentSearchResult, int64, error)
	SearchByTag(ctx context.Context, tagName string, page, pageSize int) ([]entity.ObjectResponse, int64, error)
}

// ContentSearchResult represents a content search match
type ContentSearchResult struct {
	Object  entity.ObjectResponse `json:"object"`
	Matches []ContentMatch        `json:"matches"`
}

// ContentMatch represents a single content match
type ContentMatch struct {
	Line    int    `json:"line"`
	Content string `json:"content"`
}

type searchUseCase struct {
	objectRepo repository.ObjectRepository
	tagRepo    repository.TagRepository
	storage    *storage.LocalFileStorage
}

// NewUseCase creates a new search use case
func NewUseCase(
	objectRepo repository.ObjectRepository,
	tagRepo repository.TagRepository,
	storage *storage.LocalFileStorage,
) UseCase {
	return &searchUseCase{
		objectRepo: objectRepo,
		tagRepo:    tagRepo,
		storage:    storage,
	}
}

func (u *searchUseCase) SearchByName(ctx context.Context, query string, types []entity.ObjectType, page, pageSize int) ([]entity.ObjectResponse, int64, error) {
	objects, total, err := u.objectRepo.Search(ctx, query, types, page, pageSize)
	if err != nil {
		return nil, 0, apperrors.InternalError("failed to search objects", err)
	}

	responses := make([]entity.ObjectResponse, len(objects))
	for i, obj := range objects {
		responses[i] = *obj.ToResponse()
	}

	return responses, total, nil
}

func (u *searchUseCase) SearchByContent(ctx context.Context, query string, types []entity.ObjectType, page, pageSize int) ([]ContentSearchResult, int64, error) {
	// Get all files (with pagination consideration)
	filter := &entity.ObjectFilter{
		Type:     types,
		Page:     1,
		PageSize: 1000, // Search in up to 1000 files
	}

	// Exclude directories from content search
	if len(filter.Type) == 0 {
		filter.Type = []entity.ObjectType{
			entity.ObjectTypeNotebook,
			entity.ObjectTypePython,
			entity.ObjectTypeSQL,
			entity.ObjectTypeMarkdown,
			entity.ObjectTypeConfig,
			entity.ObjectTypeFile,
		}
	}

	objects, _, err := u.objectRepo.List(ctx, filter)
	if err != nil {
		return nil, 0, apperrors.InternalError("failed to list objects", err)
	}

	var results []ContentSearchResult
	queryLower := strings.ToLower(query)

	for _, obj := range objects {
		if obj.IsDirectory() {
			continue
		}

		// Read file and search for content
		matches, err := u.searchInFile(ctx, &obj, queryLower)
		if err != nil {
			continue // Skip files that can't be read
		}

		if len(matches) > 0 {
			results = append(results, ContentSearchResult{
				Object:  *obj.ToResponse(),
				Matches: matches,
			})
		}
	}

	// Apply pagination to results
	total := int64(len(results))
	start := (page - 1) * pageSize
	end := start + pageSize

	if start >= len(results) {
		return []ContentSearchResult{}, total, nil
	}
	if end > len(results) {
		end = len(results)
	}

	return results[start:end], total, nil
}

func (u *searchUseCase) searchInFile(ctx context.Context, obj *entity.Object, query string) ([]ContentMatch, error) {
	fullPath := u.storage.GetFullPath(obj.Path)
	file, err := os.Open(fullPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var matches []ContentMatch
	scanner := bufio.NewScanner(file)
	lineNum := 0

	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		if strings.Contains(strings.ToLower(line), query) {
			matches = append(matches, ContentMatch{
				Line:    lineNum,
				Content: line,
			})
			// Limit matches per file
			if len(matches) >= 10 {
				break
			}
		}
	}

	return matches, scanner.Err()
}

func (u *searchUseCase) SearchByTag(ctx context.Context, tagName string, page, pageSize int) ([]entity.ObjectResponse, int64, error) {
	// Get tag by name
	tag, err := u.tagRepo.GetByName(ctx, tagName)
	if err != nil {
		if apperrors.IsNotFound(err) {
			return []entity.ObjectResponse{}, 0, nil
		}
		return nil, 0, apperrors.InternalError("failed to get tag", err)
	}

	// Get objects with this tag
	objects, total, err := u.tagRepo.GetObjectsByTag(ctx, tag.ID, page, pageSize)
	if err != nil {
		return nil, 0, apperrors.InternalError("failed to search by tag", err)
	}

	responses := make([]entity.ObjectResponse, len(objects))
	for i, obj := range objects {
		responses[i] = *obj.ToResponse()
	}

	return responses, total, nil
}
