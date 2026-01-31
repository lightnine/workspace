package gateway

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// ChannelHandler handles messages for different Jupyter channels
type ChannelHandler struct {
	kernelID    string
	sessionID   string
	username    string
	wsConn      *WebSocketConnection
	commManager *CommManager
	
	// Channels for different message types
	shellChan   chan *Message
	iopubChan   chan *Message
	stdinChan   chan *Message
	controlChan chan *Message
	
	// Subscribers for output messages
	subscribers     map[string]*ChannelSubscriber
	subscriberMu    sync.RWMutex
	
	// Execution state
	executionCount  int
	executionState  string
	executionMu     sync.RWMutex
	
	// Pending requests (waiting for reply)
	pendingRequests map[string]*PendingRequest
	pendingMu       sync.RWMutex
	
	// Stop channel
	stopChan chan struct{}
	stopped  bool
	stopMu   sync.Mutex
}

// ChannelSubscriber represents a subscriber to kernel output
type ChannelSubscriber struct {
	ID          string
	ShellChan   chan *Message
	IOPubChan   chan *Message
	StdinChan   chan *Message
	ControlChan chan *Message
}

// PendingRequest represents a request waiting for a reply
type PendingRequest struct {
	MsgID     string
	MsgType   string
	ReplyChan chan *Message
	Timeout   time.Duration
	Created   time.Time
}

// NewChannelHandler creates a new channel handler
func NewChannelHandler(kernelID, sessionID, username string, wsConn *WebSocketConnection) *ChannelHandler {
	ch := &ChannelHandler{
		kernelID:        kernelID,
		sessionID:       sessionID,
		username:        username,
		wsConn:          wsConn,
		commManager:     NewCommManager(),
		shellChan:       make(chan *Message, 100),
		iopubChan:       make(chan *Message, 100),
		stdinChan:       make(chan *Message, 100),
		controlChan:     make(chan *Message, 100),
		subscribers:     make(map[string]*ChannelSubscriber),
		pendingRequests: make(map[string]*PendingRequest),
		executionState:  ExecutionStateIdle,
		stopChan:        make(chan struct{}),
	}
	
	// Register widget targets
	ch.commManager.RegisterWidgetTargets()
	
	return ch
}

// Start starts the channel handler
func (ch *ChannelHandler) Start() {
	// Start reading messages from WebSocket
	go ch.readLoop()
	
	// Start processing messages for each channel
	go ch.processShell()
	go ch.processIOPub()
	go ch.processStdin()
	go ch.processControl()
	
	// Start forwarding comm messages
	go ch.forwardCommMessages()
	
	log.Info().Str("kernel_id", ch.kernelID).Msg("Channel handler started")
}

// Stop stops the channel handler
func (ch *ChannelHandler) Stop() {
	ch.stopMu.Lock()
	if ch.stopped {
		ch.stopMu.Unlock()
		return
	}
	ch.stopped = true
	close(ch.stopChan)
	ch.stopMu.Unlock()
	
	// Close comm manager
	ch.commManager.Close()
	
	log.Info().Str("kernel_id", ch.kernelID).Msg("Channel handler stopped")
}

// readLoop reads messages from the WebSocket and routes them to appropriate channels
func (ch *ChannelHandler) readLoop() {
	for {
		select {
		case <-ch.stopChan:
			return
		default:
			data, err := ch.wsConn.ReadMessage()
			if err != nil {
				if ch.wsConn.IsClosed() {
					return
				}
				log.Debug().Err(err).Str("kernel_id", ch.kernelID).Msg("Error reading from WebSocket")
				continue
			}
			
			var msg Message
			if err := json.Unmarshal(data, &msg); err != nil {
				log.Debug().Err(err).Str("kernel_id", ch.kernelID).Msg("Failed to parse message")
				continue
			}
			
			// Route message to appropriate channel
			ch.routeMessage(&msg)
		}
	}
}

// routeMessage routes a message to the appropriate channel based on message type
func (ch *ChannelHandler) routeMessage(msg *Message) {
	msgType := msg.Header.MsgType
	
	// Determine channel based on message type
	switch msgType {
	// Shell replies
	case MsgTypeExecuteReply, MsgTypeInspectReply, MsgTypeCompleteReply,
		MsgTypeHistoryReply, MsgTypeIsCompleteReply, MsgTypeKernelInfoReply,
		MsgTypeCommInfoReply:
		msg.Channel = ChannelShell
		ch.handleReply(msg)
		ch.shellChan <- msg
		
	// IOPub messages
	case MsgTypeStream, MsgTypeDisplayData, MsgTypeUpdateDisplayData,
		MsgTypeExecuteInput, MsgTypeExecuteResult, MsgTypeError,
		MsgTypeStatus, MsgTypeClearOutput, MsgTypeDebugEvent:
		msg.Channel = ChannelIOPub
		ch.handleIOPub(msg)
		ch.iopubChan <- msg
		
	// Stdin messages
	case MsgTypeInputRequest:
		msg.Channel = ChannelStdin
		ch.stdinChan <- msg
		
	// Control replies
	case MsgTypeShutdownReply, MsgTypeInterruptReply, MsgTypeDebugReply:
		msg.Channel = ChannelControl
		ch.handleReply(msg)
		ch.controlChan <- msg
		
	// Comm messages (can come on shell or iopub)
	case MsgTypeCommOpen, MsgTypeCommMsg, MsgTypeCommClose:
		ch.handleComm(msg)
		ch.iopubChan <- msg
		
	default:
		log.Debug().Str("msg_type", msgType).Msg("Unknown message type")
		// Default to IOPub
		msg.Channel = ChannelIOPub
		ch.iopubChan <- msg
	}
}

// handleReply handles reply messages and notifies pending requests
func (ch *ChannelHandler) handleReply(msg *Message) {
	parentID := msg.ParentHeader.MsgID
	if parentID == "" {
		return
	}
	
	ch.pendingMu.RLock()
	pending, exists := ch.pendingRequests[parentID]
	ch.pendingMu.RUnlock()
	
	if exists {
		select {
		case pending.ReplyChan <- msg:
		default:
			log.Warn().Str("msg_id", parentID).Msg("Reply channel full or closed")
		}
	}
}

// handleIOPub handles IOPub messages
func (ch *ChannelHandler) handleIOPub(msg *Message) {
	// Handle status messages
	if msg.Header.MsgType == MsgTypeStatus {
		if content, ok := msg.Content.(map[string]interface{}); ok {
			if state, ok := content["execution_state"].(string); ok {
				ch.executionMu.Lock()
				ch.executionState = state
				ch.executionMu.Unlock()
			}
		}
	}
}

// handleComm handles comm messages
func (ch *ChannelHandler) handleComm(msg *Message) {
	switch msg.Header.MsgType {
	case MsgTypeCommOpen:
		ch.commManager.HandleCommOpen(msg)
	case MsgTypeCommMsg:
		ch.commManager.HandleCommMsg(msg)
	case MsgTypeCommClose:
		ch.commManager.HandleCommClose(msg)
	}
}

// processShell processes shell channel messages
func (ch *ChannelHandler) processShell() {
	for {
		select {
		case <-ch.stopChan:
			return
		case msg := <-ch.shellChan:
			ch.broadcastToSubscribers(msg, func(sub *ChannelSubscriber) chan *Message {
				return sub.ShellChan
			})
		}
	}
}

// processIOPub processes IOPub channel messages
func (ch *ChannelHandler) processIOPub() {
	for {
		select {
		case <-ch.stopChan:
			return
		case msg := <-ch.iopubChan:
			ch.broadcastToSubscribers(msg, func(sub *ChannelSubscriber) chan *Message {
				return sub.IOPubChan
			})
		}
	}
}

// processStdin processes stdin channel messages
func (ch *ChannelHandler) processStdin() {
	for {
		select {
		case <-ch.stopChan:
			return
		case msg := <-ch.stdinChan:
			ch.broadcastToSubscribers(msg, func(sub *ChannelSubscriber) chan *Message {
				return sub.StdinChan
			})
		}
	}
}

// processControl processes control channel messages
func (ch *ChannelHandler) processControl() {
	for {
		select {
		case <-ch.stopChan:
			return
		case msg := <-ch.controlChan:
			ch.broadcastToSubscribers(msg, func(sub *ChannelSubscriber) chan *Message {
				return sub.ControlChan
			})
		}
	}
}

// forwardCommMessages forwards comm messages to the WebSocket
func (ch *ChannelHandler) forwardCommMessages() {
	outChan := ch.commManager.GetOutChannel()
	for {
		select {
		case <-ch.stopChan:
			return
		case msg, ok := <-outChan:
			if !ok {
				return
			}
			if err := ch.sendMessage(msg); err != nil {
				log.Warn().Err(err).Msg("Failed to send comm message")
			}
		}
	}
}

// broadcastToSubscribers broadcasts a message to all subscribers
func (ch *ChannelHandler) broadcastToSubscribers(msg *Message, getChan func(*ChannelSubscriber) chan *Message) {
	ch.subscriberMu.RLock()
	defer ch.subscriberMu.RUnlock()
	
	for _, sub := range ch.subscribers {
		targetChan := getChan(sub)
		if targetChan != nil {
			select {
			case targetChan <- msg:
			default:
				// Channel full, skip
			}
		}
	}
}

// Subscribe adds a subscriber to receive kernel output
func (ch *ChannelHandler) Subscribe(id string) *ChannelSubscriber {
	sub := &ChannelSubscriber{
		ID:          id,
		ShellChan:   make(chan *Message, 100),
		IOPubChan:   make(chan *Message, 100),
		StdinChan:   make(chan *Message, 100),
		ControlChan: make(chan *Message, 100),
	}
	
	ch.subscriberMu.Lock()
	ch.subscribers[id] = sub
	ch.subscriberMu.Unlock()
	
	return sub
}

// Unsubscribe removes a subscriber
func (ch *ChannelHandler) Unsubscribe(id string) {
	ch.subscriberMu.Lock()
	delete(ch.subscribers, id)
	ch.subscriberMu.Unlock()
}

// sendMessage sends a message through the WebSocket
func (ch *ChannelHandler) sendMessage(msg *Message) error {
	return ch.wsConn.SendMessage(msg)
}

// ============================================================================
// Request Methods
// ============================================================================

// Execute sends an execute_request and returns immediately
func (ch *ChannelHandler) Execute(code string, silent, storeHistory, allowStdin, stopOnError bool) (string, error) {
	ch.executionMu.Lock()
	ch.executionCount++
	ch.executionMu.Unlock()
	
	content := &ExecuteRequestContent{
		Code:            code,
		Silent:          silent,
		StoreHistory:    storeHistory,
		UserExpressions: make(map[string]interface{}),
		AllowStdin:      allowStdin,
		StopOnError:     stopOnError,
	}
	
	msg := &Message{
		Header:   NewHeader(MsgTypeExecuteRequest, ch.username, ch.sessionID),
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelShell,
	}
	
	if err := ch.sendMessage(msg); err != nil {
		return "", err
	}
	
	return msg.Header.MsgID, nil
}

// ExecuteSync sends an execute_request and waits for the reply
func (ch *ChannelHandler) ExecuteSync(ctx context.Context, code string, silent, storeHistory bool) (*Message, error) {
	msgID, err := ch.Execute(code, silent, storeHistory, false, true)
	if err != nil {
		return nil, err
	}
	
	return ch.waitForReply(ctx, msgID, MsgTypeExecuteReply)
}

// Inspect sends an inspect_request
func (ch *ChannelHandler) Inspect(code string, cursorPos, detailLevel int) (string, error) {
	content := &InspectRequestContent{
		Code:        code,
		CursorPos:   cursorPos,
		DetailLevel: detailLevel,
	}
	
	msg := &Message{
		Header:   NewHeader(MsgTypeInspectRequest, ch.username, ch.sessionID),
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelShell,
	}
	
	if err := ch.sendMessage(msg); err != nil {
		return "", err
	}
	
	return msg.Header.MsgID, nil
}

// InspectSync sends an inspect_request and waits for the reply
func (ch *ChannelHandler) InspectSync(ctx context.Context, code string, cursorPos, detailLevel int) (*Message, error) {
	msgID, err := ch.Inspect(code, cursorPos, detailLevel)
	if err != nil {
		return nil, err
	}
	
	return ch.waitForReply(ctx, msgID, MsgTypeInspectReply)
}

// Complete sends a complete_request
func (ch *ChannelHandler) Complete(code string, cursorPos int) (string, error) {
	content := &CompleteRequestContent{
		Code:      code,
		CursorPos: cursorPos,
	}
	
	msg := &Message{
		Header:   NewHeader(MsgTypeCompleteRequest, ch.username, ch.sessionID),
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelShell,
	}
	
	if err := ch.sendMessage(msg); err != nil {
		return "", err
	}
	
	return msg.Header.MsgID, nil
}

// CompleteSync sends a complete_request and waits for the reply
func (ch *ChannelHandler) CompleteSync(ctx context.Context, code string, cursorPos int) (*Message, error) {
	msgID, err := ch.Complete(code, cursorPos)
	if err != nil {
		return nil, err
	}
	
	return ch.waitForReply(ctx, msgID, MsgTypeCompleteReply)
}

// History sends a history_request
func (ch *ChannelHandler) History(output, raw bool, accessType string, session, start, stop, n int, pattern string, unique bool) (string, error) {
	content := &HistoryRequestContent{
		Output:         output,
		Raw:            raw,
		HistAccessType: accessType,
		Session:        session,
		Start:          start,
		Stop:           stop,
		N:              n,
		Pattern:        pattern,
		Unique:         unique,
	}
	
	msg := &Message{
		Header:   NewHeader(MsgTypeHistoryRequest, ch.username, ch.sessionID),
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelShell,
	}
	
	if err := ch.sendMessage(msg); err != nil {
		return "", err
	}
	
	return msg.Header.MsgID, nil
}

// IsComplete sends an is_complete_request
func (ch *ChannelHandler) IsComplete(code string) (string, error) {
	content := &IsCompleteRequestContent{
		Code: code,
	}
	
	msg := &Message{
		Header:   NewHeader(MsgTypeIsCompleteRequest, ch.username, ch.sessionID),
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelShell,
	}
	
	if err := ch.sendMessage(msg); err != nil {
		return "", err
	}
	
	return msg.Header.MsgID, nil
}

// IsCompleteSync sends an is_complete_request and waits for the reply
func (ch *ChannelHandler) IsCompleteSync(ctx context.Context, code string) (*Message, error) {
	msgID, err := ch.IsComplete(code)
	if err != nil {
		return nil, err
	}
	
	return ch.waitForReply(ctx, msgID, MsgTypeIsCompleteReply)
}

// KernelInfo sends a kernel_info_request
func (ch *ChannelHandler) KernelInfo() (string, error) {
	msg := &Message{
		Header:   NewHeader(MsgTypeKernelInfoRequest, ch.username, ch.sessionID),
		Metadata: make(map[string]interface{}),
		Content:  make(map[string]interface{}),
		Channel:  ChannelShell,
	}
	
	if err := ch.sendMessage(msg); err != nil {
		return "", err
	}
	
	return msg.Header.MsgID, nil
}

// KernelInfoSync sends a kernel_info_request and waits for the reply
func (ch *ChannelHandler) KernelInfoSync(ctx context.Context) (*Message, error) {
	msgID, err := ch.KernelInfo()
	if err != nil {
		return nil, err
	}
	
	return ch.waitForReply(ctx, msgID, MsgTypeKernelInfoReply)
}

// CommInfo sends a comm_info_request
func (ch *ChannelHandler) CommInfo(targetName string) (string, error) {
	content := &CommInfoRequestContent{
		TargetName: targetName,
	}
	
	msg := &Message{
		Header:   NewHeader(MsgTypeCommInfoRequest, ch.username, ch.sessionID),
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelShell,
	}
	
	if err := ch.sendMessage(msg); err != nil {
		return "", err
	}
	
	return msg.Header.MsgID, nil
}

// ============================================================================
// Control Channel Methods
// ============================================================================

// Shutdown sends a shutdown_request
func (ch *ChannelHandler) Shutdown(restart bool) (string, error) {
	content := &ShutdownRequestContent{
		Restart: restart,
	}
	
	msg := &Message{
		Header:   NewHeader(MsgTypeShutdownRequest, ch.username, ch.sessionID),
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelControl,
	}
	
	if err := ch.sendMessage(msg); err != nil {
		return "", err
	}
	
	return msg.Header.MsgID, nil
}

// Interrupt sends an interrupt_request
func (ch *ChannelHandler) Interrupt() (string, error) {
	msg := &Message{
		Header:   NewHeader(MsgTypeInterruptRequest, ch.username, ch.sessionID),
		Metadata: make(map[string]interface{}),
		Content:  make(map[string]interface{}),
		Channel:  ChannelControl,
	}
	
	if err := ch.sendMessage(msg); err != nil {
		return "", err
	}
	
	return msg.Header.MsgID, nil
}

// ============================================================================
// Stdin Channel Methods
// ============================================================================

// InputReply sends an input_reply
func (ch *ChannelHandler) InputReply(value string) error {
	content := &InputReplyContent{
		Value: value,
	}
	
	msg := &Message{
		Header:   NewHeader(MsgTypeInputReply, ch.username, ch.sessionID),
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelStdin,
	}
	
	return ch.sendMessage(msg)
}

// ============================================================================
// Helper Methods
// ============================================================================

// waitForReply waits for a reply to a specific message
func (ch *ChannelHandler) waitForReply(ctx context.Context, msgID, expectedType string) (*Message, error) {
	replyChan := make(chan *Message, 1)
	
	pending := &PendingRequest{
		MsgID:     msgID,
		MsgType:   expectedType,
		ReplyChan: replyChan,
		Created:   time.Now(),
	}
	
	ch.pendingMu.Lock()
	ch.pendingRequests[msgID] = pending
	ch.pendingMu.Unlock()
	
	defer func() {
		ch.pendingMu.Lock()
		delete(ch.pendingRequests, msgID)
		ch.pendingMu.Unlock()
	}()
	
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case reply := <-replyChan:
		return reply, nil
	}
}

// GetExecutionState returns the current execution state
func (ch *ChannelHandler) GetExecutionState() string {
	ch.executionMu.RLock()
	defer ch.executionMu.RUnlock()
	return ch.executionState
}

// GetExecutionCount returns the current execution count
func (ch *ChannelHandler) GetExecutionCount() int {
	ch.executionMu.RLock()
	defer ch.executionMu.RUnlock()
	return ch.executionCount
}

// GetCommManager returns the comm manager
func (ch *ChannelHandler) GetCommManager() *CommManager {
	return ch.commManager
}
