package gateway

import (
	"sync"

	"github.com/rs/zerolog/log"
)

// CommTargetFunc is a function that handles comm open messages
type CommTargetFunc func(comm *Comm, data map[string]interface{})

// CommManager manages Jupyter Comms (Widget communication)
type CommManager struct {
	comms   map[string]*Comm
	targets map[string]CommTargetFunc
	mu      sync.RWMutex
	
	// Channel for sending comm messages back to the kernel
	outChan chan *Message
}

// NewCommManager creates a new CommManager
func NewCommManager() *CommManager {
	return &CommManager{
		comms:   make(map[string]*Comm),
		targets: make(map[string]CommTargetFunc),
		outChan: make(chan *Message, 100),
	}
}

// Comm represents a single comm channel
type Comm struct {
	ID         string
	TargetName string
	Data       map[string]interface{}
	manager    *CommManager
	onMsg      func(data map[string]interface{})
	onClose    func(data map[string]interface{})
	mu         sync.RWMutex
	closed     bool
}

// RegisterTarget registers a target for comm_open messages
func (cm *CommManager) RegisterTarget(name string, handler CommTargetFunc) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.targets[name] = handler
	log.Debug().Str("target", name).Msg("Registered comm target")
}

// UnregisterTarget unregisters a comm target
func (cm *CommManager) UnregisterTarget(name string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	delete(cm.targets, name)
}

// GetComm returns a comm by ID
func (cm *CommManager) GetComm(commID string) (*Comm, bool) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	comm, exists := cm.comms[commID]
	return comm, exists
}

// ListComms returns all comms, optionally filtered by target name
func (cm *CommManager) ListComms(targetName string) map[string]*CommInfo {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	
	result := make(map[string]*CommInfo)
	for id, comm := range cm.comms {
		if targetName == "" || comm.TargetName == targetName {
			result[id] = &CommInfo{
				TargetName: comm.TargetName,
			}
		}
	}
	return result
}

// HandleCommOpen handles an incoming comm_open message
func (cm *CommManager) HandleCommOpen(msg *Message) error {
	content, ok := msg.Content.(map[string]interface{})
	if !ok {
		log.Warn().Msg("Invalid comm_open content")
		return nil
	}
	
	commID, _ := content["comm_id"].(string)
	targetName, _ := content["target_name"].(string)
	data, _ := content["data"].(map[string]interface{})
	
	if commID == "" || targetName == "" {
		log.Warn().Msg("comm_open missing comm_id or target_name")
		return nil
	}
	
	cm.mu.Lock()
	// Check if target exists
	handler, exists := cm.targets[targetName]
	if !exists {
		cm.mu.Unlock()
		// Send comm_close to reject the comm
		log.Warn().Str("target", targetName).Msg("Unknown comm target")
		closeMsg := NewReply(MsgTypeCommClose, &CommCloseContent{
			CommID: commID,
		}, msg)
		cm.outChan <- closeMsg
		return nil
	}
	
	// Create new comm
	comm := &Comm{
		ID:         commID,
		TargetName: targetName,
		Data:       data,
		manager:    cm,
	}
	cm.comms[commID] = comm
	cm.mu.Unlock()
	
	// Call the handler
	if handler != nil {
		handler(comm, data)
	}
	
	log.Debug().Str("comm_id", commID).Str("target", targetName).Msg("Comm opened")
	return nil
}

// HandleCommMsg handles an incoming comm_msg message
func (cm *CommManager) HandleCommMsg(msg *Message) error {
	content, ok := msg.Content.(map[string]interface{})
	if !ok {
		return nil
	}
	
	commID, _ := content["comm_id"].(string)
	data, _ := content["data"].(map[string]interface{})
	
	cm.mu.RLock()
	comm, exists := cm.comms[commID]
	cm.mu.RUnlock()
	
	if !exists {
		log.Warn().Str("comm_id", commID).Msg("comm_msg for unknown comm")
		return nil
	}
	
	comm.mu.RLock()
	handler := comm.onMsg
	comm.mu.RUnlock()
	
	if handler != nil {
		handler(data)
	}
	
	return nil
}

// HandleCommClose handles an incoming comm_close message
func (cm *CommManager) HandleCommClose(msg *Message) error {
	content, ok := msg.Content.(map[string]interface{})
	if !ok {
		return nil
	}
	
	commID, _ := content["comm_id"].(string)
	data, _ := content["data"].(map[string]interface{})
	
	cm.mu.Lock()
	comm, exists := cm.comms[commID]
	if exists {
		delete(cm.comms, commID)
	}
	cm.mu.Unlock()
	
	if exists {
		comm.mu.Lock()
		comm.closed = true
		handler := comm.onClose
		comm.mu.Unlock()
		
		if handler != nil {
			handler(data)
		}
		
		log.Debug().Str("comm_id", commID).Msg("Comm closed")
	}
	
	return nil
}

// GetOutChannel returns the channel for outgoing messages
func (cm *CommManager) GetOutChannel() <-chan *Message {
	return cm.outChan
}

// Close closes all comms
func (cm *CommManager) Close() {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	
	for _, comm := range cm.comms {
		comm.mu.Lock()
		comm.closed = true
		comm.mu.Unlock()
	}
	cm.comms = make(map[string]*Comm)
	close(cm.outChan)
}

// ============================================================================
// Comm Methods
// ============================================================================

// Send sends a message through this comm
func (c *Comm) Send(data map[string]interface{}, metadata map[string]interface{}, buffers [][]byte) {
	c.mu.RLock()
	if c.closed {
		c.mu.RUnlock()
		return
	}
	c.mu.RUnlock()
	
	content := &CommMsgContent{
		CommID: c.ID,
		Data:   data,
	}
	
	msg := &Message{
		Header:   NewHeader(MsgTypeCommMsg, "", ""),
		Metadata: metadata,
		Content:  content,
		Buffers:  buffers,
		Channel:  ChannelIOPub,
	}
	
	c.manager.outChan <- msg
}

// Close closes this comm
func (c *Comm) Close(data map[string]interface{}) {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return
	}
	c.closed = true
	c.mu.Unlock()
	
	content := &CommCloseContent{
		CommID: c.ID,
		Data:   data,
	}
	
	msg := &Message{
		Header:  NewHeader(MsgTypeCommClose, "", ""),
		Content: content,
		Channel: ChannelIOPub,
	}
	
	c.manager.outChan <- msg
	
	c.manager.mu.Lock()
	delete(c.manager.comms, c.ID)
	c.manager.mu.Unlock()
}

// OnMessage sets the handler for incoming messages
func (c *Comm) OnMessage(handler func(data map[string]interface{})) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onMsg = handler
}

// OnClose sets the handler for close events
func (c *Comm) OnClose(handler func(data map[string]interface{})) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onClose = handler
}

// IsClosed returns whether the comm is closed
func (c *Comm) IsClosed() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.closed
}

// ============================================================================
// Widget-specific Comm Targets
// ============================================================================

// RegisterWidgetTargets registers the standard Jupyter widget targets
func (cm *CommManager) RegisterWidgetTargets() {
	// jupyter.widget - Main widget communication target
	cm.RegisterTarget("jupyter.widget", func(comm *Comm, data map[string]interface{}) {
		log.Debug().
			Str("comm_id", comm.ID).
			Interface("data", data).
			Msg("Widget comm opened")
		
		// Handle incoming widget messages
		comm.OnMessage(func(data map[string]interface{}) {
			log.Debug().
				Str("comm_id", comm.ID).
				Interface("data", data).
				Msg("Widget message received")
		})
		
		comm.OnClose(func(data map[string]interface{}) {
			log.Debug().
				Str("comm_id", comm.ID).
				Msg("Widget comm closed")
		})
	})
	
	// jupyter.widget.version - Widget version negotiation
	cm.RegisterTarget("jupyter.widget.version", func(comm *Comm, data map[string]interface{}) {
		// Respond with supported version
		comm.Send(map[string]interface{}{
			"version": "2.0.0",
		}, nil, nil)
	})
}
