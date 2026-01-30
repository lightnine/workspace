package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"

	"github.com/leondli/workspace/internal/usecase/kernel"
	"github.com/leondli/workspace/pkg/response"
)

// KernelHandler handles kernel-related HTTP and WebSocket requests
type KernelHandler struct {
	kernelUseCase *kernel.UseCase
	upgrader      websocket.Upgrader
	connections   sync.Map // map[string]*websocket.Conn - sessionID -> connection
}

// NewKernelHandler creates a new KernelHandler
func NewKernelHandler(kernelUseCase *kernel.UseCase) *KernelHandler {
	return &KernelHandler{
		kernelUseCase: kernelUseCase,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all origins in development
			},
		},
	}
}

// ListKernelSpecs returns available kernel specifications
func (h *KernelHandler) ListKernelSpecs(c *gin.Context) {
	specs, err := h.kernelUseCase.ListKernelSpecs(c.Request.Context())
	if err != nil {
		response.InternalError(c, err.Error())
		return
	}
	response.Success(c, specs)
}

// StartKernelRequest represents the request to start a kernel
type StartKernelRequest struct {
	Name string `json:"name" binding:"required"` // kernel spec name, e.g., "python3"
}

// StartKernel starts a new kernel instance
func (h *KernelHandler) StartKernel(c *gin.Context) {
	var req StartKernelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	userID, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	kernelInfo, err := h.kernelUseCase.StartKernel(c.Request.Context(), req.Name, userID.(string))
	if err != nil {
		response.InternalError(c, "Failed to start kernel: "+err.Error())
		return
	}

	response.Success(c, kernelInfo)
}

// StopKernel stops a running kernel
func (h *KernelHandler) StopKernel(c *gin.Context) {
	kernelID := c.Param("kernel_id")
	if kernelID == "" {
		response.BadRequest(c, "Kernel ID is required")
		return
	}

	if err := h.kernelUseCase.StopKernel(c.Request.Context(), kernelID); err != nil {
		response.InternalError(c, "Failed to stop kernel: "+err.Error())
		return
	}

	response.Success(c, gin.H{"message": "Kernel stopped"})
}

// RestartKernel restarts a kernel
func (h *KernelHandler) RestartKernel(c *gin.Context) {
	kernelID := c.Param("kernel_id")
	if kernelID == "" {
		response.BadRequest(c, "Kernel ID is required")
		return
	}

	if err := h.kernelUseCase.RestartKernel(c.Request.Context(), kernelID); err != nil {
		response.InternalError(c, "Failed to restart kernel: "+err.Error())
		return
	}

	response.Success(c, gin.H{"message": "Kernel restarted"})
}

// InterruptKernel interrupts a running kernel
func (h *KernelHandler) InterruptKernel(c *gin.Context) {
	kernelID := c.Param("kernel_id")
	if kernelID == "" {
		response.BadRequest(c, "Kernel ID is required")
		return
	}

	if err := h.kernelUseCase.InterruptKernel(c.Request.Context(), kernelID); err != nil {
		response.InternalError(c, "Failed to interrupt kernel: "+err.Error())
		return
	}

	response.Success(c, gin.H{"message": "Kernel interrupted"})
}

// GetKernelStatus returns the status of a kernel
func (h *KernelHandler) GetKernelStatus(c *gin.Context) {
	kernelID := c.Param("kernel_id")
	if kernelID == "" {
		response.BadRequest(c, "Kernel ID is required")
		return
	}

	status, err := h.kernelUseCase.GetKernelStatus(c.Request.Context(), kernelID)
	if err != nil {
		response.InternalError(c, "Failed to get kernel status: "+err.Error())
		return
	}

	response.Success(c, status)
}

// ListKernels returns all running kernels for the current user
func (h *KernelHandler) ListKernels(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	kernels, err := h.kernelUseCase.ListKernels(c.Request.Context(), userID.(string))
	if err != nil {
		response.InternalError(c, "Failed to list kernels: "+err.Error())
		return
	}

	response.Success(c, kernels)
}

// WebSocketConnect handles WebSocket connections for kernel communication
func (h *KernelHandler) WebSocketConnect(c *gin.Context) {
	kernelID := c.Param("kernel_id")
	if kernelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kernel ID is required"})
		return
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Error().Err(err).Msg("Failed to upgrade to WebSocket")
		return
	}

	sessionID := uuid.New().String()
	h.connections.Store(sessionID, conn)

	// Create a context for this WebSocket connection that won't be cancelled
	// when the HTTP request ends
	ctx, cancel := context.WithCancel(context.Background())

	defer func() {
		cancel()
		h.connections.Delete(sessionID)
		conn.Close()
	}()

	// Create a channel to receive messages from kernel
	outputChan := make(chan *kernel.KernelMessage, 100)
	doneChan := make(chan struct{})

	// Register this connection to receive kernel output
	h.kernelUseCase.RegisterOutputChannel(kernelID, sessionID, outputChan)
	defer h.kernelUseCase.UnregisterOutputChannel(kernelID, sessionID)

	// Goroutine to send kernel output to WebSocket client
	go func() {
		for {
			select {
			case msg := <-outputChan:
				if msg == nil {
					return
				}
				data, err := json.Marshal(msg)
				if err != nil {
					log.Error().Err(err).Msg("Failed to marshal kernel message")
					continue
				}
				if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
					log.Error().Err(err).Msg("Failed to write WebSocket message")
					return
				}
			case <-doneChan:
				return
			case <-ctx.Done():
				return
			}
		}
	}()

	// Read messages from WebSocket client
	for {
		messageType, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Error().Err(err).Msg("WebSocket read error")
			}
			close(doneChan)
			break
		}

		if messageType != websocket.TextMessage {
			continue
		}

		var execReq kernel.ExecuteRequest
		if err := json.Unmarshal(message, &execReq); err != nil {
			log.Error().Err(err).Msg("Failed to unmarshal execute request")
			continue
		}

		// Execute code on kernel using the WebSocket context
		go func(req kernel.ExecuteRequest) {
			if err := h.kernelUseCase.ExecuteCode(ctx, kernelID, sessionID, &req); err != nil {
				// Send error message to client
				errMsg := &kernel.KernelMessage{
					MsgType:  "error",
					ParentID: req.MsgID,
					Content: map[string]interface{}{
						"ename":     "ExecutionError",
						"evalue":    err.Error(),
						"traceback": []string{},
					},
				}
				if data, err := json.Marshal(errMsg); err == nil {
					conn.WriteMessage(websocket.TextMessage, data)
				}
			}
		}(execReq)
	}
}

// ExecuteCodeRequest represents a code execution request
type ExecuteCodeRequest struct {
	Code    string `json:"code" binding:"required"`
	Silent  bool   `json:"silent"`
	StoreHistory bool `json:"store_history"`
}

// ExecuteCode executes code and returns result (non-streaming)
func (h *KernelHandler) ExecuteCode(c *gin.Context) {
	kernelID := c.Param("kernel_id")
	if kernelID == "" {
		response.BadRequest(c, "Kernel ID is required")
		return
	}

	var req ExecuteCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	execReq := &kernel.ExecuteRequest{
		MsgID:        uuid.New().String(),
		Code:         req.Code,
		Silent:       req.Silent,
		StoreHistory: req.StoreHistory,
	}

	// Create temporary channel for this execution
	outputChan := make(chan *kernel.KernelMessage, 100)
	sessionID := fmt.Sprintf("http-%s", uuid.New().String())

	h.kernelUseCase.RegisterOutputChannel(kernelID, sessionID, outputChan)
	defer h.kernelUseCase.UnregisterOutputChannel(kernelID, sessionID)

	// Execute code
	if err := h.kernelUseCase.ExecuteCode(c.Request.Context(), kernelID, sessionID, execReq); err != nil {
		response.InternalError(c, "Failed to execute code: "+err.Error())
		return
	}

	// Collect outputs with timeout
	var outputs []*kernel.KernelMessage
	timeout := time.After(60 * time.Second)

	for {
		select {
		case msg := <-outputChan:
			if msg == nil {
				response.Success(c, gin.H{
					"msg_id":  execReq.MsgID,
					"outputs": outputs,
				})
				return
			}
			outputs = append(outputs, msg)
			// Check if execution is complete
			if msg.MsgType == "execute_reply" || msg.MsgType == "error" {
				response.Success(c, gin.H{
					"msg_id":  execReq.MsgID,
					"outputs": outputs,
				})
				return
			}
		case <-timeout:
			response.Error(c, http.StatusRequestTimeout, response.CodeInternalError, "Execution timed out")
			return
		case <-c.Request.Context().Done():
			return
		}
	}
}
