package entity

import (
	"time"

	"github.com/google/uuid"
)

// Tag represents a tag entity
type Tag struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	CreatedAt time.Time `json:"created_at"`
}

// TagCreate represents the data needed to create a tag
type TagCreate struct {
	Name  string
	Color string
}

// TagResponse represents the tag data returned to client
type TagResponse struct {
	ID    uuid.UUID `json:"id"`
	Name  string    `json:"name"`
	Color string    `json:"color"`
}

// ToResponse converts Tag to TagResponse
func (t *Tag) ToResponse() *TagResponse {
	return &TagResponse{
		ID:    t.ID,
		Name:  t.Name,
		Color: t.Color,
	}
}

// ObjectTag represents the junction between object and tag
type ObjectTag struct {
	ObjectID  int64     `json:"object_id"`
	TagID     uuid.UUID `json:"tag_id"`
	CreatedAt time.Time `json:"created_at"`
}
