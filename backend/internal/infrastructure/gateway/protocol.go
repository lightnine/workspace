package gateway

import (
	"time"

	"github.com/google/uuid"
)

// Jupyter Protocol Version
const JupyterProtocolVersion = "5.3"

// ============================================================================
// Channel Types
// ============================================================================

// ChannelType represents the type of Jupyter channel
type ChannelType string

const (
	ChannelShell   ChannelType = "shell"   // Request/reply for code execution
	ChannelIOPub   ChannelType = "iopub"   // Broadcast channel for outputs
	ChannelStdin   ChannelType = "stdin"   // User input requests
	ChannelControl ChannelType = "control" // Control messages (interrupt, shutdown)
)

// ============================================================================
// Message Types - Shell Channel
// ============================================================================

// Shell Request Message Types
const (
	MsgTypeExecuteRequest    = "execute_request"
	MsgTypeInspectRequest    = "inspect_request"
	MsgTypeCompleteRequest   = "complete_request"
	MsgTypeHistoryRequest    = "history_request"
	MsgTypeIsCompleteRequest = "is_complete_request"
	MsgTypeKernelInfoRequest = "kernel_info_request"
	MsgTypeCommInfoRequest   = "comm_info_request"
)

// Shell Reply Message Types
const (
	MsgTypeExecuteReply    = "execute_reply"
	MsgTypeInspectReply    = "inspect_reply"
	MsgTypeCompleteReply   = "complete_reply"
	MsgTypeHistoryReply    = "history_reply"
	MsgTypeIsCompleteReply = "is_complete_reply"
	MsgTypeKernelInfoReply = "kernel_info_reply"
	MsgTypeCommInfoReply   = "comm_info_reply"
)

// ============================================================================
// Message Types - IOPub Channel
// ============================================================================

const (
	MsgTypeStream            = "stream"
	MsgTypeDisplayData       = "display_data"
	MsgTypeUpdateDisplayData = "update_display_data"
	MsgTypeExecuteInput      = "execute_input"
	MsgTypeExecuteResult     = "execute_result"
	MsgTypeError             = "error"
	MsgTypeStatus            = "status"
	MsgTypeClearOutput       = "clear_output"
	MsgTypeDebugEvent        = "debug_event"
)

// ============================================================================
// Message Types - Stdin Channel
// ============================================================================

const (
	MsgTypeInputRequest = "input_request"
	MsgTypeInputReply   = "input_reply"
)

// ============================================================================
// Message Types - Control Channel
// ============================================================================

const (
	MsgTypeShutdownRequest  = "shutdown_request"
	MsgTypeShutdownReply    = "shutdown_reply"
	MsgTypeInterruptRequest = "interrupt_request"
	MsgTypeInterruptReply   = "interrupt_reply"
	MsgTypeDebugRequest     = "debug_request"
	MsgTypeDebugReply       = "debug_reply"
)

// ============================================================================
// Message Types - Comm (Widget Communication)
// ============================================================================

const (
	MsgTypeCommOpen  = "comm_open"
	MsgTypeCommMsg   = "comm_msg"
	MsgTypeCommClose = "comm_close"
)

// ============================================================================
// Message Header
// ============================================================================

// Header represents the header of a Jupyter message
type Header struct {
	MsgID    string    `json:"msg_id"`
	Username string    `json:"username"`
	Session  string    `json:"session"`
	Date     time.Time `json:"date"`
	MsgType  string    `json:"msg_type"`
	Version  string    `json:"version"`
}

// NewHeader creates a new message header
func NewHeader(msgType, username, session string) Header {
	return Header{
		MsgID:    uuid.New().String(),
		Username: username,
		Session:  session,
		Date:     time.Now().UTC(),
		MsgType:  msgType,
		Version:  JupyterProtocolVersion,
	}
}

// ============================================================================
// Base Message
// ============================================================================

// Message represents a complete Jupyter message
type Message struct {
	Header       Header                 `json:"header"`
	ParentHeader Header                 `json:"parent_header,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
	Content      interface{}            `json:"content"`
	Buffers      [][]byte               `json:"buffers,omitempty"`
	Channel      ChannelType            `json:"channel,omitempty"`
}

// NewMessage creates a new Jupyter message
func NewMessage(msgType string, content interface{}, username, session string) *Message {
	return &Message{
		Header:   NewHeader(msgType, username, session),
		Metadata: make(map[string]interface{}),
		Content:  content,
	}
}

// NewReply creates a reply message with parent header set
func NewReply(msgType string, content interface{}, parent *Message) *Message {
	return &Message{
		Header:       NewHeader(msgType, parent.Header.Username, parent.Header.Session),
		ParentHeader: parent.Header,
		Metadata:     make(map[string]interface{}),
		Content:      content,
	}
}

// ============================================================================
// Execute Request/Reply Content
// ============================================================================

// ExecuteRequestContent represents the content of an execute_request message
type ExecuteRequestContent struct {
	Code            string                 `json:"code"`
	Silent          bool                   `json:"silent"`
	StoreHistory    bool                   `json:"store_history"`
	UserExpressions map[string]interface{} `json:"user_expressions,omitempty"`
	AllowStdin      bool                   `json:"allow_stdin"`
	StopOnError     bool                   `json:"stop_on_error"`
}

// ExecuteReplyContent represents the content of an execute_reply message
type ExecuteReplyContent struct {
	Status         string                 `json:"status"` // "ok", "error", "aborted"
	ExecutionCount int                    `json:"execution_count"`
	// For status == "ok"
	Payload         []PayloadItem          `json:"payload,omitempty"`
	UserExpressions map[string]interface{} `json:"user_expressions,omitempty"`
	// For status == "error"
	EName     string   `json:"ename,omitempty"`
	EValue    string   `json:"evalue,omitempty"`
	Traceback []string `json:"traceback,omitempty"`
}

// PayloadItem represents an item in the execute reply payload
type PayloadItem struct {
	Source string                 `json:"source"`
	Data   map[string]interface{} `json:"data,omitempty"`
	Text   string                 `json:"text,omitempty"`
}

// ============================================================================
// Inspect Request/Reply Content
// ============================================================================

// InspectRequestContent represents the content of an inspect_request message
type InspectRequestContent struct {
	Code        string `json:"code"`
	CursorPos   int    `json:"cursor_pos"`
	DetailLevel int    `json:"detail_level"` // 0 or 1
}

// InspectReplyContent represents the content of an inspect_reply message
type InspectReplyContent struct {
	Status string                 `json:"status"` // "ok" or "error"
	Found  bool                   `json:"found"`
	Data   map[string]interface{} `json:"data,omitempty"`   // MIME-keyed dict
	Meta   map[string]interface{} `json:"metadata,omitempty"`
}

// ============================================================================
// Complete Request/Reply Content
// ============================================================================

// CompleteRequestContent represents the content of a complete_request message
type CompleteRequestContent struct {
	Code      string `json:"code"`
	CursorPos int    `json:"cursor_pos"`
}

// CompleteReplyContent represents the content of a complete_reply message
type CompleteReplyContent struct {
	Status      string                   `json:"status"` // "ok" or "error"
	Matches     []string                 `json:"matches"`
	CursorStart int                      `json:"cursor_start"`
	CursorEnd   int                      `json:"cursor_end"`
	Metadata    map[string]interface{}   `json:"metadata,omitempty"`
	// Extended completion info (Jupyter Lab)
	Signature   string                   `json:"signature,omitempty"`
	Completions []CompletionItem         `json:"completions,omitempty"`
}

// CompletionItem represents a completion item with extended info
type CompletionItem struct {
	Start     int    `json:"start"`
	End       int    `json:"end"`
	Text      string `json:"text"`
	Type      string `json:"type,omitempty"`
	Signature string `json:"signature,omitempty"`
}

// ============================================================================
// History Request/Reply Content
// ============================================================================

// HistoryRequestContent represents the content of a history_request message
type HistoryRequestContent struct {
	Output    bool   `json:"output"`
	Raw       bool   `json:"raw"`
	HistAccessType string `json:"hist_access_type"` // "range", "tail", "search"
	Session   int    `json:"session,omitempty"`
	Start     int    `json:"start,omitempty"`
	Stop      int    `json:"stop,omitempty"`
	N         int    `json:"n,omitempty"`
	Pattern   string `json:"pattern,omitempty"`
	Unique    bool   `json:"unique,omitempty"`
}

// HistoryReplyContent represents the content of a history_reply message
type HistoryReplyContent struct {
	Status  string          `json:"status"`
	History [][]interface{} `json:"history"` // list of (session, line_number, input) or (session, line_number, (input, output))
}

// ============================================================================
// Is Complete Request/Reply Content
// ============================================================================

// IsCompleteRequestContent represents the content of an is_complete_request message
type IsCompleteRequestContent struct {
	Code string `json:"code"`
}

// IsCompleteReplyContent represents the content of an is_complete_reply message
type IsCompleteReplyContent struct {
	Status string `json:"status"` // "complete", "incomplete", "invalid", "unknown"
	Indent string `json:"indent,omitempty"` // For incomplete, suggested indent
}

// ============================================================================
// Kernel Info Request/Reply Content
// ============================================================================

// KernelInfoRequestContent is empty for kernel_info_request

// KernelInfoReplyContent represents the content of a kernel_info_reply message
type KernelInfoReplyContent struct {
	Status          string      `json:"status"`
	ProtocolVersion string      `json:"protocol_version"`
	Implementation  string      `json:"implementation"`
	ImplementationVersion string `json:"implementation_version"`
	LanguageInfo    LanguageInfo `json:"language_info"`
	Banner          string      `json:"banner"`
	DebuggerInfo    *DebuggerInfo `json:"debugger_info,omitempty"`
	HelpLinks       []HelpLink  `json:"help_links,omitempty"`
}

// LanguageInfo contains information about the kernel's language
type LanguageInfo struct {
	Name              string `json:"name"`
	Version           string `json:"version"`
	MIMEType          string `json:"mimetype"`
	FileExtension     string `json:"file_extension"`
	PygmentsLexer     string `json:"pygments_lexer,omitempty"`
	CodeMirrorMode    interface{} `json:"codemirror_mode,omitempty"`
	NBConvertExporter string `json:"nbconvert_exporter,omitempty"`
}

// DebuggerInfo contains debugger information
type DebuggerInfo struct {
	IsSupported bool `json:"isSupported"`
}

// HelpLink represents a help link
type HelpLink struct {
	Text string `json:"text"`
	URL  string `json:"url"`
}

// ============================================================================
// Comm Info Request/Reply Content
// ============================================================================

// CommInfoRequestContent represents the content of a comm_info_request message
type CommInfoRequestContent struct {
	TargetName string `json:"target_name,omitempty"`
}

// CommInfoReplyContent represents the content of a comm_info_reply message
type CommInfoReplyContent struct {
	Status string              `json:"status"`
	Comms  map[string]CommInfo `json:"comms"`
}

// CommInfo represents information about a comm
type CommInfo struct {
	TargetName string `json:"target_name"`
}

// ============================================================================
// IOPub Message Contents
// ============================================================================

// StreamContent represents the content of a stream message
type StreamContent struct {
	Name string `json:"name"` // "stdout" or "stderr"
	Text string `json:"text"`
}

// DisplayDataContent represents the content of a display_data message
type DisplayDataContent struct {
	Data      map[string]interface{} `json:"data"`      // MIME-keyed dict
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	Transient *TransientData         `json:"transient,omitempty"`
}

// TransientData contains transient display data
type TransientData struct {
	DisplayID string `json:"display_id,omitempty"`
}

// UpdateDisplayDataContent represents the content of an update_display_data message
type UpdateDisplayDataContent struct {
	Data      map[string]interface{} `json:"data"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	Transient TransientData          `json:"transient"`
}

// ExecuteInputContent represents the content of an execute_input message
type ExecuteInputContent struct {
	Code           string `json:"code"`
	ExecutionCount int    `json:"execution_count"`
}

// ExecuteResultContent represents the content of an execute_result message
type ExecuteResultContent struct {
	ExecutionCount int                    `json:"execution_count"`
	Data           map[string]interface{} `json:"data"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
}

// ErrorContent represents the content of an error message
type ErrorContent struct {
	EName     string   `json:"ename"`
	EValue    string   `json:"evalue"`
	Traceback []string `json:"traceback"`
}

// StatusContent represents the content of a status message
type StatusContent struct {
	ExecutionState string `json:"execution_state"` // "busy", "idle", "starting"
}

// ClearOutputContent represents the content of a clear_output message
type ClearOutputContent struct {
	Wait bool `json:"wait"`
}

// ============================================================================
// Stdin Message Contents
// ============================================================================

// InputRequestContent represents the content of an input_request message
type InputRequestContent struct {
	Prompt   string `json:"prompt"`
	Password bool   `json:"password"`
}

// InputReplyContent represents the content of an input_reply message
type InputReplyContent struct {
	Value string `json:"value"`
}

// ============================================================================
// Control Message Contents
// ============================================================================

// ShutdownRequestContent represents the content of a shutdown_request message
type ShutdownRequestContent struct {
	Restart bool `json:"restart"`
}

// ShutdownReplyContent represents the content of a shutdown_reply message
type ShutdownReplyContent struct {
	Status  string `json:"status"`
	Restart bool   `json:"restart"`
}

// InterruptRequestContent is empty for interrupt_request

// InterruptReplyContent represents the content of an interrupt_reply message
type InterruptReplyContent struct {
	Status string `json:"status"`
}

// DebugRequestContent represents the content of a debug_request message
type DebugRequestContent struct {
	Type    string                 `json:"type"`
	Seq     int                    `json:"seq"`
	Command string                 `json:"command"`
	Arguments map[string]interface{} `json:"arguments,omitempty"`
}

// DebugReplyContent represents the content of a debug_reply message
type DebugReplyContent struct {
	Type    string                 `json:"type"`
	Seq     int                    `json:"seq"`
	Success bool                   `json:"success"`
	Command string                 `json:"command"`
	Message string                 `json:"message,omitempty"`
	Body    map[string]interface{} `json:"body,omitempty"`
}

// ============================================================================
// Comm Message Contents
// ============================================================================

// CommOpenContent represents the content of a comm_open message
type CommOpenContent struct {
	CommID     string                 `json:"comm_id"`
	TargetName string                 `json:"target_name"`
	Data       map[string]interface{} `json:"data,omitempty"`
}

// CommMsgContent represents the content of a comm_msg message
type CommMsgContent struct {
	CommID string                 `json:"comm_id"`
	Data   map[string]interface{} `json:"data"`
}

// CommCloseContent represents the content of a comm_close message
type CommCloseContent struct {
	CommID string                 `json:"comm_id"`
	Data   map[string]interface{} `json:"data,omitempty"`
}

// ============================================================================
// MIME Types for Rich Media
// ============================================================================

const (
	MIMETextPlain       = "text/plain"
	MIMETextHTML        = "text/html"
	MIMETextMarkdown    = "text/markdown"
	MIMETextLatex       = "text/latex"
	MIMEApplicationJSON = "application/json"
	MIMEApplicationPDF  = "application/pdf"
	MIMEImagePNG        = "image/png"
	MIMEImageJPEG       = "image/jpeg"
	MIMEImageGIF        = "image/gif"
	MIMEImageSVG        = "image/svg+xml"
	MIMEApplicationVndJupyterWidget = "application/vnd.jupyter.widget-view+json"
)

// ============================================================================
// Execution State
// ============================================================================

const (
	ExecutionStateStarting = "starting"
	ExecutionStateBusy     = "busy"
	ExecutionStateIdle     = "idle"
)

// ============================================================================
// Reply Status
// ============================================================================

const (
	ReplyStatusOK      = "ok"
	ReplyStatusError   = "error"
	ReplyStatusAborted = "aborted"
)

// ============================================================================
// Is Complete Status
// ============================================================================

const (
	IsCompleteStatusComplete   = "complete"
	IsCompleteStatusIncomplete = "incomplete"
	IsCompleteStatusInvalid    = "invalid"
	IsCompleteStatusUnknown    = "unknown"
)
