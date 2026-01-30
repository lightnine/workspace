package entity

import (
	"time"

	"github.com/google/uuid"
)

// Version represents a file version entity
type Version struct {
	ID            uuid.UUID `json:"id"`
	ObjectID      int64     `json:"object_id"`
	VersionNumber int       `json:"version_number"`
	ContentHash   string    `json:"content_hash"`
	Size          int64     `json:"size"`
	StoragePath   string    `json:"storage_path"`
	Message       string    `json:"message,omitempty"`
	CreatorID     uuid.UUID `json:"creator_id"`
	CreatedAt     time.Time `json:"created_at"`

	// Relations (not stored in DB)
	Creator *User   `json:"creator,omitempty"`
	Object  *Object `json:"object,omitempty"`
}

// VersionCreate represents the data needed to create a version
type VersionCreate struct {
	ObjectID    int64
	ContentHash string
	Size        int64
	StoragePath string
	Message     string
	CreatorID   uuid.UUID
}

// VersionResponse represents the version data returned to client
type VersionResponse struct {
	ID            uuid.UUID     `json:"id"`
	VersionNumber int           `json:"version_number"`
	Size          int64         `json:"size"`
	Message       string        `json:"message,omitempty"`
	Creator       *UserResponse `json:"creator,omitempty"`
	CreatedAt     time.Time     `json:"created_at"`
}

// ToResponse converts Version to VersionResponse
func (v *Version) ToResponse() *VersionResponse {
	resp := &VersionResponse{
		ID:            v.ID,
		VersionNumber: v.VersionNumber,
		Size:          v.Size,
		Message:       v.Message,
		CreatedAt:     v.CreatedAt,
	}

	if v.Creator != nil {
		resp.Creator = v.Creator.ToResponse()
	}

	return resp
}
