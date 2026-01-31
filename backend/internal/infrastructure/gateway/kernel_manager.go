package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// GatewayKernel represents a kernel managed through the gateway
type GatewayKernel struct {
	ID             string
	Name           string
	Status         string
	ExecutionState string
	LastActivity   time.Time
	UserID         string
	SessionID      string

	wsConn          *WebSocketConnection
	channelHandler  *ChannelHandler
	outputChannels  map[string]chan *KernelOutputMessage
	channelMu       sync.RWMutex
	stopChan        chan struct{}
	client          *Client
}

// KernelOutputMessage represents an output message from the kernel
type KernelOutputMessage struct {
	MsgID    string                 `json:"msg_id"`
	MsgType  string                 `json:"msg_type"`
	ParentID string                 `json:"parent_id,omitempty"`
	Content  map[string]interface{} `json:"content"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
	Channel  string                 `json:"channel,omitempty"`
}

// KernelManager manages gateway kernels
type KernelManager struct {
	client  *Client
	kernels sync.Map // map[string]*GatewayKernel
	mu      sync.RWMutex
}

// NewKernelManager creates a new kernel manager
func NewKernelManager(client *Client) *KernelManager {
	return &KernelManager{
		client: client,
	}
}

// GetClient returns the gateway client
func (km *KernelManager) GetClient() *Client {
	return km.client
}

// StartKernel starts a new kernel via the gateway
func (km *KernelManager) StartKernel(ctx context.Context, specName, userID string) (*GatewayKernel, error) {
	// Start kernel on gateway
	kernel, err := km.client.StartKernel(ctx, specName, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to start kernel on gateway: %w", err)
	}

	// Wait for kernel to be ready
	launchTimeout := km.client.config.LaunchTimeout
	if launchTimeout <= 0 {
		launchTimeout = 60
	}

	readyCtx, cancel := context.WithTimeout(ctx, time.Duration(launchTimeout)*time.Second)
	defer cancel()

	// Poll for kernel ready state
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-readyCtx.Done():
			// Timeout, but kernel might still work
			log.Warn().Str("kernel_id", kernel.ID).Msg("Kernel launch timeout, continuing anyway")
			goto connect
		case <-ticker.C:
			k, err := km.client.GetKernel(ctx, kernel.ID)
			if err != nil {
				log.Debug().Err(err).Str("kernel_id", kernel.ID).Msg("Failed to get kernel status")
				continue
			}
			if k.ExecutionState == "idle" || k.ExecutionState == "busy" {
				goto connect
			}
		}
	}

connect:
	// Connect WebSocket to kernel channels
	wsConn, err := km.client.ConnectWebSocket(ctx, kernel.ID)
	if err != nil {
		// Clean up the kernel if WebSocket connection fails
		_ = km.client.DeleteKernel(ctx, kernel.ID)
		return nil, fmt.Errorf("failed to connect WebSocket: %w", err)
	}

	sessionID := uuid.New().String()

	gk := &GatewayKernel{
		ID:             kernel.ID,
		Name:           kernel.Name,
		Status:         kernel.ExecutionState,
		ExecutionState: kernel.ExecutionState,
		LastActivity:   kernel.LastActivity,
		UserID:         userID,
		SessionID:      sessionID,
		wsConn:         wsConn,
		outputChannels: make(map[string]chan *KernelOutputMessage),
		stopChan:       make(chan struct{}),
		client:         km.client,
	}

	// Create channel handler for proper Jupyter protocol handling
	gk.channelHandler = NewChannelHandler(kernel.ID, sessionID, userID, wsConn)
	gk.channelHandler.Start()

	km.kernels.Store(kernel.ID, gk)

	// Start reading messages from channel handler and broadcasting
	go km.forwardChannelMessages(gk)

	log.Info().
		Str("kernel_id", kernel.ID).
		Str("name", kernel.Name).
		Str("user_id", userID).
		Msg("Gateway kernel started successfully")

	return gk, nil
}

// forwardChannelMessages forwards messages from channel handler to output channels
func (km *KernelManager) forwardChannelMessages(gk *GatewayKernel) {
	// Subscribe to channel handler
	sub := gk.channelHandler.Subscribe("kernel_manager")
	defer gk.channelHandler.Unsubscribe("kernel_manager")

	for {
		select {
		case <-gk.stopChan:
			return
		case msg := <-sub.IOPubChan:
			km.broadcastMessage(gk, msg)
		case msg := <-sub.ShellChan:
			km.broadcastMessage(gk, msg)
		case msg := <-sub.StdinChan:
			km.broadcastMessage(gk, msg)
		case msg := <-sub.ControlChan:
			km.broadcastMessage(gk, msg)
		}
	}
}

// broadcastMessage broadcasts a message to all registered output channels
func (km *KernelManager) broadcastMessage(gk *GatewayKernel, msg *Message) {
	if msg == nil {
		return
	}

	// Update kernel state
	gk.LastActivity = time.Now()
	if msg.Header.MsgType == MsgTypeStatus {
		if content, ok := msg.Content.(*StatusContent); ok {
			gk.Status = content.ExecutionState
			gk.ExecutionState = content.ExecutionState
		} else if content, ok := msg.Content.(map[string]interface{}); ok {
			if state, ok := content["execution_state"].(string); ok {
				gk.Status = state
				gk.ExecutionState = state
			}
		}
	}

	// Convert to output message
	contentMap := make(map[string]interface{})
	if msg.Content != nil {
		if bytes, err := json.Marshal(msg.Content); err == nil {
			json.Unmarshal(bytes, &contentMap)
		}
	}

	outputMsg := &KernelOutputMessage{
		MsgID:    msg.Header.MsgID,
		MsgType:  msg.Header.MsgType,
		ParentID: msg.ParentHeader.MsgID,
		Content:  contentMap,
		Metadata: msg.Metadata,
		Channel:  string(msg.Channel),
	}

	// Broadcast to all registered channels
	gk.channelMu.RLock()
	for _, ch := range gk.outputChannels {
		select {
		case ch <- outputMsg:
		default:
			// Channel full, skip
		}
	}
	gk.channelMu.RUnlock()
}

// StopKernel stops a kernel
func (km *KernelManager) StopKernel(ctx context.Context, kernelID string) error {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	// Stop channel handler
	if gk.channelHandler != nil {
		gk.channelHandler.Stop()
	}

	// Close stop channel
	select {
	case <-gk.stopChan:
		// Already closed
	default:
		close(gk.stopChan)
	}

	// Close WebSocket connection
	if gk.wsConn != nil {
		gk.wsConn.Close()
	}

	// Delete kernel on gateway
	if err := km.client.DeleteKernel(ctx, kernelID); err != nil {
		log.Warn().Err(err).Str("kernel_id", kernelID).Msg("Failed to delete kernel on gateway")
	}

	// Remove from local map
	km.kernels.Delete(kernelID)

	log.Info().Str("kernel_id", kernelID).Msg("Gateway kernel stopped")

	return nil
}

// RestartKernel restarts a kernel
func (km *KernelManager) RestartKernel(ctx context.Context, kernelID string) error {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	// Stop channel handler
	if gk.channelHandler != nil {
		gk.channelHandler.Stop()
	}

	// Restart on gateway
	kernel, err := km.client.RestartKernel(ctx, kernelID)
	if err != nil {
		return fmt.Errorf("failed to restart kernel on gateway: %w", err)
	}

	// Reconnect WebSocket
	gk.wsConn.Close()

	newWsConn, err := km.client.ConnectWebSocket(ctx, kernelID)
	if err != nil {
		return fmt.Errorf("failed to reconnect WebSocket after restart: %w", err)
	}

	// Create new stop channel
	select {
	case <-gk.stopChan:
		gk.stopChan = make(chan struct{})
	default:
	}

	gk.wsConn = newWsConn
	gk.Status = kernel.ExecutionState
	gk.LastActivity = kernel.LastActivity

	// Create new channel handler
	gk.channelHandler = NewChannelHandler(kernelID, gk.SessionID, gk.UserID, newWsConn)
	gk.channelHandler.Start()

	// Start forwarding messages again
	go km.forwardChannelMessages(gk)

	log.Info().Str("kernel_id", kernelID).Msg("Gateway kernel restarted")

	return nil
}

// InterruptKernel interrupts a kernel
func (km *KernelManager) InterruptKernel(ctx context.Context, kernelID string) error {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	// Try to send interrupt via channel handler first
	if gk.channelHandler != nil {
		if _, err := gk.channelHandler.Interrupt(); err == nil {
			return nil
		}
	}

	// Fall back to REST API
	return km.client.InterruptKernel(ctx, kernelID)
}

// GetKernel returns a kernel by ID
func (km *KernelManager) GetKernel(kernelID string) (*GatewayKernel, bool) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return nil, false
	}
	return value.(*GatewayKernel), true
}

// ListKernels returns all kernels for a user
func (km *KernelManager) ListKernels(userID string) []*GatewayKernel {
	var kernels []*GatewayKernel
	km.kernels.Range(func(key, value interface{}) bool {
		gk := value.(*GatewayKernel)
		if gk.UserID == userID {
			kernels = append(kernels, gk)
		}
		return true
	})
	return kernels
}

// RegisterOutputChannel registers a channel to receive kernel output
func (km *KernelManager) RegisterOutputChannel(kernelID, sessionID string, ch chan *KernelOutputMessage) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return
	}

	gk := value.(*GatewayKernel)
	gk.channelMu.Lock()
	gk.outputChannels[sessionID] = ch
	gk.channelMu.Unlock()
}

// UnregisterOutputChannel unregisters an output channel
func (km *KernelManager) UnregisterOutputChannel(kernelID, sessionID string) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return
	}

	gk := value.(*GatewayKernel)
	gk.channelMu.Lock()
	delete(gk.outputChannels, sessionID)
	gk.channelMu.Unlock()
}

// ============================================================================
// Execution Methods using Channel Handler
// ============================================================================

// ExecuteCode executes code on a kernel
func (km *KernelManager) ExecuteCode(ctx context.Context, kernelID string, code string, msgID string, silent bool, storeHistory bool) error {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	if gk.Status == "dead" {
		return fmt.Errorf("kernel is dead, please restart")
	}

	if gk.channelHandler == nil {
		return fmt.Errorf("channel handler not initialized")
	}

	// Use channel handler to execute
	_, err := gk.channelHandler.Execute(code, silent, storeHistory, false, true)
	return err
}

// ExecuteSync executes code synchronously and waits for the reply
func (km *KernelManager) ExecuteSync(ctx context.Context, kernelID string, code string, silent, storeHistory bool) (*Message, error) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return nil, fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	if gk.channelHandler == nil {
		return nil, fmt.Errorf("channel handler not initialized")
	}

	return gk.channelHandler.ExecuteSync(ctx, code, silent, storeHistory)
}

// Complete requests code completion from the kernel
func (km *KernelManager) Complete(ctx context.Context, kernelID string, code string, cursorPos int) (string, error) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return "", fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	if gk.channelHandler == nil {
		return "", fmt.Errorf("channel handler not initialized")
	}

	return gk.channelHandler.Complete(code, cursorPos)
}

// CompleteSync requests code completion synchronously
func (km *KernelManager) CompleteSync(ctx context.Context, kernelID string, code string, cursorPos int) (*Message, error) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return nil, fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	if gk.channelHandler == nil {
		return nil, fmt.Errorf("channel handler not initialized")
	}

	return gk.channelHandler.CompleteSync(ctx, code, cursorPos)
}

// Inspect requests introspection from the kernel
func (km *KernelManager) Inspect(ctx context.Context, kernelID string, code string, cursorPos int, detailLevel int) (string, error) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return "", fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	if gk.channelHandler == nil {
		return "", fmt.Errorf("channel handler not initialized")
	}

	return gk.channelHandler.Inspect(code, cursorPos, detailLevel)
}

// InspectSync requests introspection synchronously
func (km *KernelManager) InspectSync(ctx context.Context, kernelID string, code string, cursorPos int, detailLevel int) (*Message, error) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return nil, fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	if gk.channelHandler == nil {
		return nil, fmt.Errorf("channel handler not initialized")
	}

	return gk.channelHandler.InspectSync(ctx, code, cursorPos, detailLevel)
}

// IsComplete checks if code is complete
func (km *KernelManager) IsComplete(ctx context.Context, kernelID string, code string) (string, error) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return "", fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	if gk.channelHandler == nil {
		return "", fmt.Errorf("channel handler not initialized")
	}

	return gk.channelHandler.IsComplete(code)
}

// IsCompleteSync checks if code is complete synchronously
func (km *KernelManager) IsCompleteSync(ctx context.Context, kernelID string, code string) (*Message, error) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return nil, fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	if gk.channelHandler == nil {
		return nil, fmt.Errorf("channel handler not initialized")
	}

	return gk.channelHandler.IsCompleteSync(ctx, code)
}

// KernelInfo gets kernel info
func (km *KernelManager) KernelInfo(ctx context.Context, kernelID string) (*Message, error) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return nil, fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	if gk.channelHandler == nil {
		return nil, fmt.Errorf("channel handler not initialized")
	}

	return gk.channelHandler.KernelInfoSync(ctx)
}

// History gets execution history
func (km *KernelManager) History(ctx context.Context, kernelID string, output, raw bool, accessType string, n int) (string, error) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return "", fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	if gk.channelHandler == nil {
		return "", fmt.Errorf("channel handler not initialized")
	}

	return gk.channelHandler.History(output, raw, accessType, 0, 0, 0, n, "", false)
}

// CommInfo gets information about comms
func (km *KernelManager) CommInfo(ctx context.Context, kernelID string, targetName string) (string, error) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return "", fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	if gk.channelHandler == nil {
		return "", fmt.Errorf("channel handler not initialized")
	}

	return gk.channelHandler.CommInfo(targetName)
}

// Shutdown shuts down the kernel
func (km *KernelManager) Shutdown(ctx context.Context, kernelID string, restart bool) error {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := value.(*GatewayKernel)

	if gk.channelHandler != nil {
		_, err := gk.channelHandler.Shutdown(restart)
		if err != nil {
			log.Warn().Err(err).Msg("Failed to send shutdown request")
		}
	}

	if restart {
		return km.RestartKernel(ctx, kernelID)
	}

	return km.StopKernel(ctx, kernelID)
}

// InputReply sends an input reply (for stdin requests)
func (km *KernelManager) InputReply(ctx context.Context, kernelID string, value string) error {
	v, exists := km.kernels.Load(kernelID)
	if !exists {
		return fmt.Errorf("kernel not found: %s", kernelID)
	}

	gk := v.(*GatewayKernel)

	if gk.channelHandler == nil {
		return fmt.Errorf("channel handler not initialized")
	}

	return gk.channelHandler.InputReply(value)
}

// GetChannelHandler returns the channel handler for a kernel
func (km *KernelManager) GetChannelHandler(kernelID string) (*ChannelHandler, bool) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return nil, false
	}

	gk := value.(*GatewayKernel)
	return gk.channelHandler, gk.channelHandler != nil
}

// GetCommManager returns the comm manager for a kernel
func (km *KernelManager) GetCommManager(kernelID string) (*CommManager, bool) {
	value, exists := km.kernels.Load(kernelID)
	if !exists {
		return nil, false
	}

	gk := value.(*GatewayKernel)
	if gk.channelHandler == nil {
		return nil, false
	}

	return gk.channelHandler.GetCommManager(), true
}
