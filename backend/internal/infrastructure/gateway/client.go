package gateway

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"

	"github.com/leondli/workspace/internal/infrastructure/config"
)

// KernelSpec represents a kernel specification from the gateway
type KernelSpec struct {
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Language    string `json:"language"`
}

// KernelSpecsResponse represents the response from /api/kernelspecs
type KernelSpecsResponse struct {
	Default     string                       `json:"default"`
	Kernelspecs map[string]KernelSpecWrapper `json:"kernelspecs"`
}

// KernelSpecWrapper wraps a kernel spec with its resource directory
type KernelSpecWrapper struct {
	Name        string         `json:"name"`
	ResourceDir string         `json:"resource_dir"`
	Spec        KernelSpecInfo `json:"spec"`
}

// KernelSpecInfo contains the kernel spec details
type KernelSpecInfo struct {
	Argv        []string          `json:"argv"`
	DisplayName string            `json:"display_name"`
	Language    string            `json:"language"`
	Env         map[string]string `json:"env,omitempty"`
}

// Kernel represents a running kernel on the gateway
type Kernel struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	LastActivity   time.Time `json:"last_activity"`
	ExecutionState string    `json:"execution_state"`
	Connections    int       `json:"connections"`
}

// Client is the Gateway client for communicating with a remote Jupyter Gateway
type Client struct {
	baseURL       string
	authToken     string
	httpClient    *http.Client
	wsDialer      *websocket.Dialer
	customHeaders map[string]string
	mu            sync.RWMutex
	config        *config.GatewayConfig
}

// NewClient creates a new Gateway client
func NewClient(cfg *config.GatewayConfig) (*Client, error) {
	if cfg.URL == "" {
		return nil, fmt.Errorf("gateway URL is required")
	}

	// Parse and validate the URL
	_, err := url.Parse(cfg.URL)
	if err != nil {
		return nil, fmt.Errorf("invalid gateway URL: %w", err)
	}

	// Configure TLS
	tlsConfig := &tls.Config{
		InsecureSkipVerify: !cfg.ValidateCert,
	}

	// Load client certificate if provided
	if cfg.ClientCert != "" && cfg.ClientKey != "" {
		cert, err := tls.LoadX509KeyPair(cfg.ClientCert, cfg.ClientKey)
		if err != nil {
			return nil, fmt.Errorf("failed to load client certificate: %w", err)
		}
		tlsConfig.Certificates = []tls.Certificate{cert}
	}

	// Load CA certificates if provided
	if cfg.CACerts != "" {
		caCert, err := os.ReadFile(cfg.CACerts)
		if err != nil {
			return nil, fmt.Errorf("failed to read CA certificates: %w", err)
		}
		caCertPool := x509.NewCertPool()
		caCertPool.AppendCertsFromPEM(caCert)
		tlsConfig.RootCAs = caCertPool
	}

	// Set default timeouts
	connectTimeout := cfg.ConnectTimeout
	if connectTimeout <= 0 {
		connectTimeout = 30
	}

	requestTimeout := cfg.RequestTimeout
	if requestTimeout <= 0 {
		requestTimeout = 60
	}

	// Create HTTP client
	httpClient := &http.Client{
		Timeout: time.Duration(requestTimeout) * time.Second,
		Transport: &http.Transport{
			TLSClientConfig:     tlsConfig,
			MaxIdleConns:        100,
			IdleConnTimeout:     90 * time.Second,
			TLSHandshakeTimeout: time.Duration(connectTimeout) * time.Second,
		},
	}

	// Create WebSocket dialer
	wsDialer := &websocket.Dialer{
		TLSClientConfig:  tlsConfig,
		HandshakeTimeout: time.Duration(connectTimeout) * time.Second,
	}

	// Parse custom headers
	customHeaders := make(map[string]string)
	if cfg.Headers != "" {
		if err := json.Unmarshal([]byte(cfg.Headers), &customHeaders); err != nil {
			log.Warn().Err(err).Msg("Failed to parse custom headers, ignoring")
		}
	}

	client := &Client{
		baseURL:       cfg.URL,
		authToken:     cfg.AuthToken,
		httpClient:    httpClient,
		wsDialer:      wsDialer,
		customHeaders: customHeaders,
		config:        cfg,
	}

	return client, nil
}

// buildRequest creates an HTTP request with proper headers
func (c *Client) buildRequest(ctx context.Context, method, path string, body interface{}) (*http.Request, error) {
	fullURL := c.baseURL + path

	var bodyReader io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(jsonBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, fullURL, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	// Set authentication
	if c.authToken != "" {
		req.Header.Set("Authorization", "token "+c.authToken)
	}

	// Set HTTP Basic Auth if provided
	if c.config.HTTPUser != "" {
		req.SetBasicAuth(c.config.HTTPUser, c.config.HTTPPassword)
	}

	// Set custom headers
	for k, v := range c.customHeaders {
		req.Header.Set(k, v)
	}

	return req, nil
}

// doRequest executes an HTTP request and returns the response body
func (c *Client) doRequest(req *http.Request) ([]byte, int, error) {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to read response body: %w", err)
	}

	return body, resp.StatusCode, nil
}

// GetKernelSpecs retrieves available kernel specifications from the gateway
func (c *Client) GetKernelSpecs(ctx context.Context) (map[string]*KernelSpec, error) {
	req, err := c.buildRequest(ctx, http.MethodGet, "/api/kernelspecs", nil)
	if err != nil {
		return nil, err
	}

	body, statusCode, err := c.doRequest(req)
	if err != nil {
		return nil, err
	}

	if statusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get kernel specs, status: %d, body: %s", statusCode, string(body))
	}

	var specsResp KernelSpecsResponse
	if err := json.Unmarshal(body, &specsResp); err != nil {
		return nil, fmt.Errorf("failed to parse kernel specs response: %w", err)
	}

	result := make(map[string]*KernelSpec)
	for name, wrapper := range specsResp.Kernelspecs {
		result[name] = &KernelSpec{
			Name:        name,
			DisplayName: wrapper.Spec.DisplayName,
			Language:    wrapper.Spec.Language,
		}
	}

	return result, nil
}

// ListKernels retrieves all running kernels from the gateway
func (c *Client) ListKernels(ctx context.Context) ([]*Kernel, error) {
	req, err := c.buildRequest(ctx, http.MethodGet, "/api/kernels", nil)
	if err != nil {
		return nil, err
	}

	body, statusCode, err := c.doRequest(req)
	if err != nil {
		return nil, err
	}

	if statusCode == http.StatusForbidden {
		// Gateway may have list_kernels disabled
		return []*Kernel{}, nil
	}

	if statusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to list kernels, status: %d, body: %s", statusCode, string(body))
	}

	var kernels []*Kernel
	if err := json.Unmarshal(body, &kernels); err != nil {
		return nil, fmt.Errorf("failed to parse kernels response: %w", err)
	}

	return kernels, nil
}

// StartKernelRequest represents the request body to start a kernel
type StartKernelRequest struct {
	Name string                 `json:"name"`
	Env  map[string]interface{} `json:"env,omitempty"`
}

// StartKernel starts a new kernel on the gateway
func (c *Client) StartKernel(ctx context.Context, specName string, env map[string]interface{}) (*Kernel, error) {
	reqBody := StartKernelRequest{
		Name: specName,
		Env:  env,
	}

	req, err := c.buildRequest(ctx, http.MethodPost, "/api/kernels", reqBody)
	if err != nil {
		return nil, err
	}

	body, statusCode, err := c.doRequest(req)
	if err != nil {
		return nil, err
	}

	if statusCode == http.StatusForbidden {
		return nil, fmt.Errorf("maximum number of kernels reached")
	}

	if statusCode != http.StatusCreated && statusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to start kernel, status: %d, body: %s", statusCode, string(body))
	}

	var kernel Kernel
	if err := json.Unmarshal(body, &kernel); err != nil {
		return nil, fmt.Errorf("failed to parse kernel response: %w", err)
	}

	return &kernel, nil
}

// GetKernel retrieves information about a specific kernel
func (c *Client) GetKernel(ctx context.Context, kernelID string) (*Kernel, error) {
	req, err := c.buildRequest(ctx, http.MethodGet, "/api/kernels/"+kernelID, nil)
	if err != nil {
		return nil, err
	}

	body, statusCode, err := c.doRequest(req)
	if err != nil {
		return nil, err
	}

	if statusCode == http.StatusNotFound {
		return nil, fmt.Errorf("kernel not found: %s", kernelID)
	}

	if statusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get kernel, status: %d, body: %s", statusCode, string(body))
	}

	var kernel Kernel
	if err := json.Unmarshal(body, &kernel); err != nil {
		return nil, fmt.Errorf("failed to parse kernel response: %w", err)
	}

	return &kernel, nil
}

// DeleteKernel stops and removes a kernel from the gateway
func (c *Client) DeleteKernel(ctx context.Context, kernelID string) error {
	req, err := c.buildRequest(ctx, http.MethodDelete, "/api/kernels/"+kernelID, nil)
	if err != nil {
		return err
	}

	_, statusCode, err := c.doRequest(req)
	if err != nil {
		return err
	}

	if statusCode == http.StatusNotFound {
		return fmt.Errorf("kernel not found: %s", kernelID)
	}

	if statusCode != http.StatusNoContent && statusCode != http.StatusOK {
		return fmt.Errorf("failed to delete kernel, status: %d", statusCode)
	}

	return nil
}

// InterruptKernel interrupts a running kernel
func (c *Client) InterruptKernel(ctx context.Context, kernelID string) error {
	req, err := c.buildRequest(ctx, http.MethodPost, "/api/kernels/"+kernelID+"/interrupt", nil)
	if err != nil {
		return err
	}

	_, statusCode, err := c.doRequest(req)
	if err != nil {
		return err
	}

	if statusCode == http.StatusNotFound {
		return fmt.Errorf("kernel not found: %s", kernelID)
	}

	if statusCode != http.StatusNoContent && statusCode != http.StatusOK {
		return fmt.Errorf("failed to interrupt kernel, status: %d", statusCode)
	}

	return nil
}

// RestartKernel restarts a kernel
func (c *Client) RestartKernel(ctx context.Context, kernelID string) (*Kernel, error) {
	req, err := c.buildRequest(ctx, http.MethodPost, "/api/kernels/"+kernelID+"/restart", nil)
	if err != nil {
		return nil, err
	}

	body, statusCode, err := c.doRequest(req)
	if err != nil {
		return nil, err
	}

	if statusCode == http.StatusNotFound {
		return nil, fmt.Errorf("kernel not found: %s", kernelID)
	}

	if statusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to restart kernel, status: %d, body: %s", statusCode, string(body))
	}

	var kernel Kernel
	if err := json.Unmarshal(body, &kernel); err != nil {
		return nil, fmt.Errorf("failed to parse kernel response: %w", err)
	}

	return &kernel, nil
}

// WebSocketConnection represents a WebSocket connection to a kernel
type WebSocketConnection struct {
	conn      *websocket.Conn
	kernelID  string
	client    *Client
	mu        sync.Mutex
	closed    bool
	closeChan chan struct{}
}

// ConnectWebSocket establishes a WebSocket connection to a kernel's channels endpoint
func (c *Client) ConnectWebSocket(ctx context.Context, kernelID string) (*WebSocketConnection, error) {
	// Build WebSocket URL
	baseURL, err := url.Parse(c.baseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse base URL: %w", err)
	}

	// Convert http(s) to ws(s)
	wsScheme := "ws"
	if baseURL.Scheme == "https" {
		wsScheme = "wss"
	}

	wsURL := url.URL{
		Scheme: wsScheme,
		Host:   baseURL.Host,
		Path:   fmt.Sprintf("/api/kernels/%s/channels", kernelID),
	}

	// Add auth token as query parameter if provided
	if c.authToken != "" {
		q := wsURL.Query()
		q.Set("token", c.authToken)
		wsURL.RawQuery = q.Encode()
	}

	// Build headers
	headers := http.Header{}
	for k, v := range c.customHeaders {
		headers.Set(k, v)
	}

	// Connect to WebSocket
	conn, _, err := c.wsDialer.DialContext(ctx, wsURL.String(), headers)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to kernel WebSocket: %w", err)
	}

	wsConn := &WebSocketConnection{
		conn:      conn,
		kernelID:  kernelID,
		client:    c,
		closeChan: make(chan struct{}),
	}

	// Start ping/pong handler
	pingInterval := c.config.WSPingInterval
	if pingInterval <= 0 {
		pingInterval = 30
	}
	go wsConn.pingLoop(time.Duration(pingInterval) * time.Second)

	return wsConn, nil
}

// pingLoop sends periodic ping messages to keep the connection alive
func (ws *WebSocketConnection) pingLoop(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			ws.mu.Lock()
			if ws.closed {
				ws.mu.Unlock()
				return
			}
			err := ws.conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(10*time.Second))
			ws.mu.Unlock()
			if err != nil {
				log.Debug().Err(err).Str("kernel_id", ws.kernelID).Msg("WebSocket ping failed")
				return
			}
		case <-ws.closeChan:
			return
		}
	}
}

// SendMessage sends a message to the kernel
func (ws *WebSocketConnection) SendMessage(msg interface{}) error {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	if ws.closed {
		return fmt.Errorf("WebSocket connection is closed")
	}

	return ws.conn.WriteJSON(msg)
}

// ReadMessage reads a message from the kernel
func (ws *WebSocketConnection) ReadMessage() ([]byte, error) {
	_, data, err := ws.conn.ReadMessage()
	return data, err
}

// Close closes the WebSocket connection
func (ws *WebSocketConnection) Close() error {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	if ws.closed {
		return nil
	}

	ws.closed = true
	close(ws.closeChan)

	return ws.conn.Close()
}

// IsClosed returns whether the connection is closed
func (ws *WebSocketConnection) IsClosed() bool {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	return ws.closed
}

// Ping checks if the gateway is reachable
func (c *Client) Ping(ctx context.Context) error {
	req, err := c.buildRequest(ctx, http.MethodGet, "/api", nil)
	if err != nil {
		return err
	}

	_, statusCode, err := c.doRequest(req)
	if err != nil {
		return err
	}

	if statusCode != http.StatusOK {
		return fmt.Errorf("gateway ping failed with status: %d", statusCode)
	}

	return nil
}

// GetBaseURL returns the base URL of the gateway
func (c *Client) GetBaseURL() string {
	return c.baseURL
}
