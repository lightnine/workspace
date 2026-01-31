package gateway

import (
	"encoding/base64"
	"encoding/json"
	"sync"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// DisplayPublisher handles rich display output
type DisplayPublisher struct {
	displayData map[string]*DisplayData
	mu          sync.RWMutex
	outChan     chan *Message
	username    string
	session     string
}

// DisplayData represents a display output with potential updates
type DisplayData struct {
	DisplayID string
	Data      map[string]interface{}
	Metadata  map[string]interface{}
}

// NewDisplayPublisher creates a new DisplayPublisher
func NewDisplayPublisher(username, session string) *DisplayPublisher {
	return &DisplayPublisher{
		displayData: make(map[string]*DisplayData),
		outChan:     make(chan *Message, 100),
		username:    username,
		session:     session,
	}
}

// Publish publishes display data to IOPub
func (dp *DisplayPublisher) Publish(data map[string]interface{}, metadata map[string]interface{}, transient *TransientData, parentMsgID string) {
	displayID := ""
	if transient != nil {
		displayID = transient.DisplayID
	}
	
	if displayID == "" {
		displayID = uuid.New().String()
		if transient == nil {
			transient = &TransientData{}
		}
		transient.DisplayID = displayID
	}
	
	// Store display data for potential updates
	dp.mu.Lock()
	dp.displayData[displayID] = &DisplayData{
		DisplayID: displayID,
		Data:      data,
		Metadata:  metadata,
	}
	dp.mu.Unlock()
	
	content := &DisplayDataContent{
		Data:      data,
		Metadata:  metadata,
		Transient: transient,
	}
	
	msg := &Message{
		Header: NewHeader(MsgTypeDisplayData, dp.username, dp.session),
		ParentHeader: Header{
			MsgID: parentMsgID,
		},
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelIOPub,
	}
	
	dp.outChan <- msg
	
	log.Debug().Str("display_id", displayID).Msg("Published display data")
}

// Update updates existing display data
func (dp *DisplayPublisher) Update(displayID string, data map[string]interface{}, metadata map[string]interface{}, parentMsgID string) {
	dp.mu.Lock()
	if existing, ok := dp.displayData[displayID]; ok {
		// Merge with existing data
		for k, v := range data {
			existing.Data[k] = v
		}
		if metadata != nil {
			for k, v := range metadata {
				existing.Metadata[k] = v
			}
		}
		data = existing.Data
		metadata = existing.Metadata
	} else {
		// Create new entry
		dp.displayData[displayID] = &DisplayData{
			DisplayID: displayID,
			Data:      data,
			Metadata:  metadata,
		}
	}
	dp.mu.Unlock()
	
	content := &UpdateDisplayDataContent{
		Data:     data,
		Metadata: metadata,
		Transient: TransientData{
			DisplayID: displayID,
		},
	}
	
	msg := &Message{
		Header: NewHeader(MsgTypeUpdateDisplayData, dp.username, dp.session),
		ParentHeader: Header{
			MsgID: parentMsgID,
		},
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelIOPub,
	}
	
	dp.outChan <- msg
	
	log.Debug().Str("display_id", displayID).Msg("Updated display data")
}

// Clear sends a clear_output message
func (dp *DisplayPublisher) Clear(wait bool, parentMsgID string) {
	content := &ClearOutputContent{
		Wait: wait,
	}
	
	msg := &Message{
		Header: NewHeader(MsgTypeClearOutput, dp.username, dp.session),
		ParentHeader: Header{
			MsgID: parentMsgID,
		},
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelIOPub,
	}
	
	dp.outChan <- msg
}

// GetOutChannel returns the output channel
func (dp *DisplayPublisher) GetOutChannel() <-chan *Message {
	return dp.outChan
}

// GetDisplayData returns display data by ID
func (dp *DisplayPublisher) GetDisplayData(displayID string) (*DisplayData, bool) {
	dp.mu.RLock()
	defer dp.mu.RUnlock()
	data, ok := dp.displayData[displayID]
	return data, ok
}

// Close closes the display publisher
func (dp *DisplayPublisher) Close() {
	close(dp.outChan)
}

// ============================================================================
// Rich Output Builders
// ============================================================================

// RichOutput helps build multi-format output data
type RichOutput struct {
	Data     map[string]interface{}
	Metadata map[string]interface{}
}

// NewRichOutput creates a new RichOutput builder
func NewRichOutput() *RichOutput {
	return &RichOutput{
		Data:     make(map[string]interface{}),
		Metadata: make(map[string]interface{}),
	}
}

// Text adds plain text output
func (ro *RichOutput) Text(text string) *RichOutput {
	ro.Data[MIMETextPlain] = text
	return ro
}

// HTML adds HTML output
func (ro *RichOutput) HTML(html string) *RichOutput {
	ro.Data[MIMETextHTML] = html
	return ro
}

// Markdown adds Markdown output
func (ro *RichOutput) Markdown(md string) *RichOutput {
	ro.Data[MIMETextMarkdown] = md
	return ro
}

// LaTeX adds LaTeX output
func (ro *RichOutput) LaTeX(latex string) *RichOutput {
	ro.Data[MIMETextLatex] = latex
	return ro
}

// JSON adds JSON output
func (ro *RichOutput) JSON(data interface{}) *RichOutput {
	if jsonBytes, err := json.Marshal(data); err == nil {
		ro.Data[MIMEApplicationJSON] = json.RawMessage(jsonBytes)
	}
	return ro
}

// PNG adds PNG image output (base64 encoded)
func (ro *RichOutput) PNG(data []byte) *RichOutput {
	ro.Data[MIMEImagePNG] = base64.StdEncoding.EncodeToString(data)
	return ro
}

// PNGBase64 adds PNG image output (already base64 encoded)
func (ro *RichOutput) PNGBase64(data string) *RichOutput {
	ro.Data[MIMEImagePNG] = data
	return ro
}

// JPEG adds JPEG image output (base64 encoded)
func (ro *RichOutput) JPEG(data []byte) *RichOutput {
	ro.Data[MIMEImageJPEG] = base64.StdEncoding.EncodeToString(data)
	return ro
}

// JPEGBase64 adds JPEG image output (already base64 encoded)
func (ro *RichOutput) JPEGBase64(data string) *RichOutput {
	ro.Data[MIMEImageJPEG] = data
	return ro
}

// GIF adds GIF image output (base64 encoded)
func (ro *RichOutput) GIF(data []byte) *RichOutput {
	ro.Data[MIMEImageGIF] = base64.StdEncoding.EncodeToString(data)
	return ro
}

// SVG adds SVG image output
func (ro *RichOutput) SVG(svg string) *RichOutput {
	ro.Data[MIMEImageSVG] = svg
	return ro
}

// PDF adds PDF output (base64 encoded)
func (ro *RichOutput) PDF(data []byte) *RichOutput {
	ro.Data[MIMEApplicationPDF] = base64.StdEncoding.EncodeToString(data)
	return ro
}

// Widget adds Jupyter widget view data
func (ro *RichOutput) Widget(modelID string) *RichOutput {
	ro.Data[MIMEApplicationVndJupyterWidget] = map[string]interface{}{
		"model_id": modelID,
		"version_major": 2,
		"version_minor": 0,
	}
	return ro
}

// Custom adds custom MIME type data
func (ro *RichOutput) Custom(mimeType string, data interface{}) *RichOutput {
	ro.Data[mimeType] = data
	return ro
}

// WithMetadata adds metadata for a specific MIME type
func (ro *RichOutput) WithMetadata(mimeType string, metadata map[string]interface{}) *RichOutput {
	if ro.Metadata == nil {
		ro.Metadata = make(map[string]interface{})
	}
	ro.Metadata[mimeType] = metadata
	return ro
}

// WithImageSize adds width/height metadata for image output
func (ro *RichOutput) WithImageSize(mimeType string, width, height int) *RichOutput {
	metadata := make(map[string]interface{})
	if width > 0 {
		metadata["width"] = width
	}
	if height > 0 {
		metadata["height"] = height
	}
	return ro.WithMetadata(mimeType, metadata)
}

// Build returns the data and metadata maps
func (ro *RichOutput) Build() (map[string]interface{}, map[string]interface{}) {
	return ro.Data, ro.Metadata
}

// ============================================================================
// Output Stream Builder
// ============================================================================

// StreamOutput helps build stream output messages
type StreamOutput struct {
	outChan  chan *Message
	username string
	session  string
}

// NewStreamOutput creates a new StreamOutput builder
func NewStreamOutput(username, session string) *StreamOutput {
	return &StreamOutput{
		outChan:  make(chan *Message, 100),
		username: username,
		session:  session,
	}
}

// Stdout sends text to stdout
func (so *StreamOutput) Stdout(text string, parentMsgID string) {
	so.stream("stdout", text, parentMsgID)
}

// Stderr sends text to stderr
func (so *StreamOutput) Stderr(text string, parentMsgID string) {
	so.stream("stderr", text, parentMsgID)
}

func (so *StreamOutput) stream(name, text string, parentMsgID string) {
	content := &StreamContent{
		Name: name,
		Text: text,
	}
	
	msg := &Message{
		Header: NewHeader(MsgTypeStream, so.username, so.session),
		ParentHeader: Header{
			MsgID: parentMsgID,
		},
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelIOPub,
	}
	
	so.outChan <- msg
}

// GetOutChannel returns the output channel
func (so *StreamOutput) GetOutChannel() <-chan *Message {
	return so.outChan
}

// Close closes the stream output
func (so *StreamOutput) Close() {
	close(so.outChan)
}

// ============================================================================
// Execute Result Builder
// ============================================================================

// ExecuteResultBuilder helps build execute_result messages
type ExecuteResultBuilder struct {
	username string
	session  string
}

// NewExecuteResultBuilder creates a new ExecuteResultBuilder
func NewExecuteResultBuilder(username, session string) *ExecuteResultBuilder {
	return &ExecuteResultBuilder{
		username: username,
		session:  session,
	}
}

// Build creates an execute_result message
func (erb *ExecuteResultBuilder) Build(executionCount int, data, metadata map[string]interface{}, parentMsgID string) *Message {
	content := &ExecuteResultContent{
		ExecutionCount: executionCount,
		Data:           data,
		Metadata:       metadata,
	}
	
	return &Message{
		Header: NewHeader(MsgTypeExecuteResult, erb.username, erb.session),
		ParentHeader: Header{
			MsgID: parentMsgID,
		},
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelIOPub,
	}
}

// ============================================================================
// Error Builder
// ============================================================================

// ErrorBuilder helps build error messages
type ErrorBuilder struct {
	username string
	session  string
}

// NewErrorBuilder creates a new ErrorBuilder
func NewErrorBuilder(username, session string) *ErrorBuilder {
	return &ErrorBuilder{
		username: username,
		session:  session,
	}
}

// Build creates an error message
func (eb *ErrorBuilder) Build(ename, evalue string, traceback []string, parentMsgID string) *Message {
	content := &ErrorContent{
		EName:     ename,
		EValue:    evalue,
		Traceback: traceback,
	}
	
	return &Message{
		Header: NewHeader(MsgTypeError, eb.username, eb.session),
		ParentHeader: Header{
			MsgID: parentMsgID,
		},
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelIOPub,
	}
}

// BuildFromError creates an error message from a Go error
func (eb *ErrorBuilder) BuildFromError(err error, parentMsgID string) *Message {
	return eb.Build("Error", err.Error(), []string{err.Error()}, parentMsgID)
}

// ============================================================================
// Status Builder
// ============================================================================

// StatusBuilder helps build status messages
type StatusBuilder struct {
	username string
	session  string
}

// NewStatusBuilder creates a new StatusBuilder
func NewStatusBuilder(username, session string) *StatusBuilder {
	return &StatusBuilder{
		username: username,
		session:  session,
	}
}

// Busy creates a busy status message
func (sb *StatusBuilder) Busy(parentMsgID string) *Message {
	return sb.build(ExecutionStateBusy, parentMsgID)
}

// Idle creates an idle status message
func (sb *StatusBuilder) Idle(parentMsgID string) *Message {
	return sb.build(ExecutionStateIdle, parentMsgID)
}

// Starting creates a starting status message
func (sb *StatusBuilder) Starting(parentMsgID string) *Message {
	return sb.build(ExecutionStateStarting, parentMsgID)
}

func (sb *StatusBuilder) build(state, parentMsgID string) *Message {
	content := &StatusContent{
		ExecutionState: state,
	}
	
	return &Message{
		Header: NewHeader(MsgTypeStatus, sb.username, sb.session),
		ParentHeader: Header{
			MsgID: parentMsgID,
		},
		Metadata: make(map[string]interface{}),
		Content:  content,
		Channel:  ChannelIOPub,
	}
}
