.PHONY: build run test clean fmt lint docker-build docker-run migrate-up migrate-down

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GORUN=$(GOCMD) run
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOFMT=gofmt
GOMOD=$(GOCMD) mod

# Binary name
BINARY_NAME=workspace-server
BINARY_DIR=bin

# Main package
MAIN_PACKAGE=./cmd/server

# Build the application
build:
	@echo "Building..."
	@mkdir -p $(BINARY_DIR)
	$(GOBUILD) -o $(BINARY_DIR)/$(BINARY_NAME) $(MAIN_PACKAGE)

# Run the application
run:
	$(GORUN) $(MAIN_PACKAGE)

# Run tests
test:
	$(GOTEST) -v -cover ./...

# Run tests with coverage report
test-coverage:
	$(GOTEST) -v -coverprofile=coverage.out ./...
	$(GOCMD) tool cover -html=coverage.out -o coverage.html

# Clean build artifacts
clean:
	@echo "Cleaning..."
	@rm -rf $(BINARY_DIR)
	@rm -f coverage.out coverage.html

# Format code
fmt:
	$(GOFMT) -s -w .

# Run linter
lint:
	golangci-lint run

# Download dependencies
deps:
	$(GOMOD) download

# Tidy dependencies
tidy:
	$(GOMOD) tidy

# Build Docker image
docker-build:
	docker build -t workspace-backend:latest .

# Run with Docker Compose
docker-run:
	docker-compose up -d

# Stop Docker Compose
docker-stop:
	docker-compose down

# Database migrations (requires golang-migrate)
DB_URL=postgres://postgres:leondli123@localhost:5432/workspace?sslmode=disable

migrate-up:
	migrate -path migrations -database "$(DB_URL)" up

migrate-down:
	migrate -path migrations -database "$(DB_URL)" down

# Create new migration
migrate-create:
	@read -p "Enter migration name: " name; \
	migrate create -ext sql -dir migrations -seq $$name

# Generate Swagger docs (requires swag)
swagger:
	swag init -g cmd/server/main.go -o docs

# Install development tools
tools:
	go install github.com/swaggo/swag/cmd/swag@latest
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Help
help:
	@echo "Available targets:"
	@echo "  build          - Build the application"
	@echo "  run            - Run the application"
	@echo "  test           - Run tests"
	@echo "  test-coverage  - Run tests with coverage"
	@echo "  clean          - Clean build artifacts"
	@echo "  fmt            - Format code"
	@echo "  lint           - Run linter"
	@echo "  deps           - Download dependencies"
	@echo "  tidy           - Tidy dependencies"
	@echo "  docker-build   - Build Docker image"
	@echo "  docker-run     - Run with Docker Compose"
	@echo "  docker-stop    - Stop Docker Compose"
	@echo "  migrate-up     - Run database migrations"
	@echo "  migrate-down   - Rollback database migrations"
	@echo "  migrate-create - Create new migration"
	@echo "  swagger        - Generate Swagger docs"
	@echo "  tools          - Install development tools"
