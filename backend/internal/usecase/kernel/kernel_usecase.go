package kernel

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// KernelSpec represents a kernel specification
type KernelSpec struct {
	Name        string            `json:"name"`
	DisplayName string            `json:"display_name"`
	Language    string            `json:"language"`
	Argv        []string          `json:"argv"`
	Env         map[string]string `json:"env,omitempty"`
}

// KernelInfo represents a running kernel instance
type KernelInfo struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Status      string    `json:"status"` // starting, idle, busy, dead
	ExecutionCount int    `json:"execution_count"`
	LastActivity time.Time `json:"last_activity"`
	UserID      string    `json:"user_id"`
}

// KernelStatus represents the current status of a kernel
type KernelStatus struct {
	ID               string    `json:"id"`
	Status           string    `json:"status"`
	ExecutionState   string    `json:"execution_state"`
	ExecutionCount   int       `json:"execution_count"`
	LastActivity     time.Time `json:"last_activity"`
	ConnectionStatus string    `json:"connection_status"`
}

// ExecuteRequest represents a code execution request
type ExecuteRequest struct {
	MsgID        string `json:"msg_id"`
	Code         string `json:"code"`
	Silent       bool   `json:"silent"`
	StoreHistory bool   `json:"store_history"`
	CellID       string `json:"cell_id,omitempty"`
}

// KernelMessage represents a message from the kernel
type KernelMessage struct {
	MsgID    string                 `json:"msg_id"`
	MsgType  string                 `json:"msg_type"`
	ParentID string                 `json:"parent_id,omitempty"`
	Content  map[string]interface{} `json:"content"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// KernelInstance represents a running kernel process
type KernelInstance struct {
	Info           *KernelInfo
	Process        *exec.Cmd
	stdin          *json.Encoder
	stdout         *json.Decoder
	mu             sync.Mutex
	outputChannels map[string]chan *KernelMessage
	channelMu      sync.RWMutex
	stopChan       chan struct{}
}

// UseCase handles kernel-related business logic
type UseCase struct {
	kernels      sync.Map // map[string]*KernelInstance
	kernelSpecs  map[string]*KernelSpec
	pythonPath   string
	workspacePath string
}

// NewUseCase creates a new kernel use case
func NewUseCase(pythonPath, workspacePath string) *UseCase {
	uc := &UseCase{
		kernelSpecs:  make(map[string]*KernelSpec),
		pythonPath:   pythonPath,
		workspacePath: workspacePath,
	}

	// Initialize default kernel specs
	uc.initKernelSpecs()

	return uc
}

// initKernelSpecs initializes the available kernel specifications
func (uc *UseCase) initKernelSpecs() {
	// Find Python interpreter
	pythonPath := uc.pythonPath
	if pythonPath == "" {
		// Try to find python in PATH
		for _, name := range []string{"python3", "python"} {
			if path, err := exec.LookPath(name); err == nil {
				pythonPath = path
				break
			}
		}
	}

	if pythonPath != "" {
		uc.kernelSpecs["python3"] = &KernelSpec{
			Name:        "python3",
			DisplayName: "Python 3",
			Language:    "python",
			Argv:        []string{pythonPath, "-m", "ipykernel_launcher", "-f", "{connection_file}"},
		}
	}

	// Log available kernels
	for name := range uc.kernelSpecs {
		log.Info().Str("kernel", name).Msg("Registered kernel spec")
	}
}

// ListKernelSpecs returns available kernel specifications
func (uc *UseCase) ListKernelSpecs(ctx context.Context) (map[string]*KernelSpec, error) {
	// Also try to discover installed kernels from Jupyter
	discovered := uc.discoverJupyterKernels()
	
	// Merge discovered kernels with default specs
	result := make(map[string]*KernelSpec)
	for k, v := range uc.kernelSpecs {
		result[k] = v
	}
	for k, v := range discovered {
		if _, exists := result[k]; !exists {
			result[k] = v
		}
	}

	return result, nil
}

// discoverJupyterKernels discovers installed Jupyter kernels
func (uc *UseCase) discoverJupyterKernels() map[string]*KernelSpec {
	specs := make(map[string]*KernelSpec)

	// Try to run jupyter kernelspec list
	cmd := exec.Command("jupyter", "kernelspec", "list", "--json")
	output, err := cmd.Output()
	if err != nil {
		log.Debug().Err(err).Msg("Failed to discover Jupyter kernels")
		return specs
	}

	var result struct {
		Kernelspecs map[string]struct {
			ResourceDir string `json:"resource_dir"`
			Spec        struct {
				DisplayName string   `json:"display_name"`
				Language    string   `json:"language"`
				Argv        []string `json:"argv"`
			} `json:"spec"`
		} `json:"kernelspecs"`
	}

	if err := json.Unmarshal(output, &result); err != nil {
		log.Debug().Err(err).Msg("Failed to parse Jupyter kernelspec output")
		return specs
	}

	for name, ks := range result.Kernelspecs {
		specs[name] = &KernelSpec{
			Name:        name,
			DisplayName: ks.Spec.DisplayName,
			Language:    ks.Spec.Language,
			Argv:        ks.Spec.Argv,
		}
	}

	return specs
}

// StartKernel starts a new kernel instance
func (uc *UseCase) StartKernel(ctx context.Context, specName string, userID string) (*KernelInfo, error) {
	spec, exists := uc.kernelSpecs[specName]
	if !exists {
		// Try discovered specs
		discovered := uc.discoverJupyterKernels()
		spec, exists = discovered[specName]
		if !exists {
			return nil, fmt.Errorf("kernel spec not found: %s", specName)
		}
	}

	kernelID := uuid.New().String()

	// Create connection file directory
	connectionDir := filepath.Join(os.TempDir(), "workspace-kernels", kernelID)
	if err := os.MkdirAll(connectionDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create connection directory: %w", err)
	}

	connectionFile := filepath.Join(connectionDir, "connection.json")

	// Generate connection info
	connectionInfo := map[string]interface{}{
		"shell_port":     0, // Will use internal communication
		"iopub_port":     0,
		"stdin_port":     0,
		"control_port":   0,
		"hb_port":        0,
		"ip":             "127.0.0.1",
		"key":            uuid.New().String(),
		"transport":      "tcp",
		"signature_scheme": "hmac-sha256",
		"kernel_name":    specName,
	}

	connectionData, _ := json.Marshal(connectionInfo)
	if err := os.WriteFile(connectionFile, connectionData, 0644); err != nil {
		return nil, fmt.Errorf("failed to write connection file: %w", err)
	}

	// Build command arguments
	args := make([]string, len(spec.Argv))
	for i, arg := range spec.Argv {
		args[i] = strings.ReplaceAll(arg, "{connection_file}", connectionFile)
	}

	// For now, we'll use a simpler approach with direct Python execution
	// Instead of running ipykernel, we'll run a custom Python wrapper
	wrapperScript := uc.createKernelWrapper(kernelID, connectionDir)
	if wrapperScript == "" {
		return nil, fmt.Errorf("failed to create kernel wrapper script")
	}

	// Use background context so kernel won't be killed when HTTP request ends
	cmd := exec.Command(args[0], "-u", wrapperScript)
	cmd.Dir = uc.workspacePath

	// Set environment
	cmd.Env = append(os.Environ(), 
		"PYTHONUNBUFFERED=1",
		fmt.Sprintf("KERNEL_ID=%s", kernelID),
	)
	if spec.Env != nil {
		for k, v := range spec.Env {
			cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", k, v))
		}
	}

	// Create pipes for communication
	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	// Start the kernel process
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start kernel: %w", err)
	}

	kernelInfo := &KernelInfo{
		ID:             kernelID,
		Name:           specName,
		Status:         "starting",
		ExecutionCount: 0,
		LastActivity:   time.Now(),
		UserID:         userID,
	}

	instance := &KernelInstance{
		Info:           kernelInfo,
		Process:        cmd,
		stdin:          json.NewEncoder(stdinPipe),
		stdout:         json.NewDecoder(stdoutPipe),
		outputChannels: make(map[string]chan *KernelMessage),
		stopChan:       make(chan struct{}),
	}

	uc.kernels.Store(kernelID, instance)

	// Create a channel to receive the ready signal
	readyChan := make(chan bool, 1)
	
	// Start goroutine to handle stderr
	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := stderrPipe.Read(buf)
			if err != nil {
				return
			}
			if n > 0 {
				log.Debug().Str("kernel_id", kernelID).Str("stderr", string(buf[:n])).Msg("Kernel stderr")
			}
		}
	}()

	// Start goroutine to read kernel output and wait for ready signal
	go func() {
		// Read the first message which should be kernel_ready
		var msg KernelMessage
		if err := instance.stdout.Decode(&msg); err != nil {
			log.Error().Err(err).Str("kernel_id", kernelID).Msg("Failed to read kernel ready message")
			readyChan <- false
			return
		}
		
		if msg.MsgID == "kernel_ready" {
			log.Info().Str("kernel_id", kernelID).Msg("Kernel is ready")
			readyChan <- true
		} else {
			log.Warn().Str("kernel_id", kernelID).Str("msg_id", msg.MsgID).Msg("Unexpected first message from kernel")
			readyChan <- true // Still consider it ready
		}
		
		// Continue reading output
		uc.readKernelOutput(instance)
	}()

	// Wait for kernel to be ready with timeout
	select {
	case ready := <-readyChan:
		if !ready {
			// Kill the process if kernel failed to start
			cmd.Process.Kill()
			uc.kernels.Delete(kernelID)
			return nil, fmt.Errorf("kernel failed to start")
		}
		kernelInfo.Status = "idle"
	case <-time.After(10 * time.Second):
		// Timeout - kernel may still work, just set to idle
		log.Warn().Str("kernel_id", kernelID).Msg("Kernel ready timeout, continuing anyway")
		kernelInfo.Status = "idle"
	}

	// Start goroutine to monitor process status
	go func() {
		err := cmd.Wait()
		if err != nil {
			log.Warn().Err(err).Str("kernel_id", kernelID).Msg("Kernel process exited with error")
		} else {
			log.Info().Str("kernel_id", kernelID).Msg("Kernel process exited normally")
		}
		// Mark kernel as dead
		if val, exists := uc.kernels.Load(kernelID); exists {
			inst := val.(*KernelInstance)
			inst.Info.Status = "dead"
		}
	}()

	return kernelInfo, nil
}

// createKernelWrapper creates a Python script that acts as a simple kernel
func (uc *UseCase) createKernelWrapper(kernelID, connectionDir string) string {
	wrapperPath := filepath.Join(connectionDir, "kernel_wrapper.py")

	wrapperCode := `#!/usr/bin/env python3
import sys
import json
import traceback
import io
import contextlib
from datetime import datetime

# Global namespace for code execution
_globals = {"__name__": "__main__", "__builtins__": __builtins__}
_locals = _globals

def execute_code(code, msg_id):
    """Execute code and capture outputs."""
    outputs = []
    execution_count = getattr(execute_code, 'count', 0) + 1
    execute_code.count = execution_count
    
    # Send execution state busy
    send_message({
        "msg_id": f"{msg_id}_status_busy",
        "msg_type": "status",
        "parent_id": msg_id,
        "content": {"execution_state": "busy"}
    })
    
    # Send execute_input
    send_message({
        "msg_id": f"{msg_id}_input",
        "msg_type": "execute_input",
        "parent_id": msg_id,
        "content": {
            "code": code,
            "execution_count": execution_count
        }
    })
    
    try:
        # Capture stdout/stderr
        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()
        
        with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
            # Try to compile as expression first (for display output)
            try:
                compiled = compile(code, '<cell>', 'eval')
                result = eval(compiled, _globals, _locals)
                if result is not None:
                    # Send execute_result
                    send_message({
                        "msg_id": f"{msg_id}_result",
                        "msg_type": "execute_result",
                        "parent_id": msg_id,
                        "content": {
                            "data": {"text/plain": repr(result)},
                            "metadata": {},
                            "execution_count": execution_count
                        }
                    })
            except SyntaxError:
                # Not an expression, execute as statement
                compiled = compile(code, '<cell>', 'exec')
                exec(compiled, _globals, _locals)
        
        # Send captured stdout
        stdout_text = stdout_capture.getvalue()
        if stdout_text:
            send_message({
                "msg_id": f"{msg_id}_stream_stdout",
                "msg_type": "stream",
                "parent_id": msg_id,
                "content": {
                    "name": "stdout",
                    "text": stdout_text
                }
            })
        
        # Send captured stderr
        stderr_text = stderr_capture.getvalue()
        if stderr_text:
            send_message({
                "msg_id": f"{msg_id}_stream_stderr",
                "msg_type": "stream",
                "parent_id": msg_id,
                "content": {
                    "name": "stderr",
                    "text": stderr_text
                }
            })
        
        # Send execute_reply success
        send_message({
            "msg_id": f"{msg_id}_reply",
            "msg_type": "execute_reply",
            "parent_id": msg_id,
            "content": {
                "status": "ok",
                "execution_count": execution_count
            }
        })
        
    except Exception as e:
        # Send error
        tb = traceback.format_exc()
        send_message({
            "msg_id": f"{msg_id}_error",
            "msg_type": "error",
            "parent_id": msg_id,
            "content": {
                "ename": type(e).__name__,
                "evalue": str(e),
                "traceback": tb.split('\n')
            }
        })
        
        # Send execute_reply error
        send_message({
            "msg_id": f"{msg_id}_reply",
            "msg_type": "execute_reply",
            "parent_id": msg_id,
            "content": {
                "status": "error",
                "execution_count": execution_count,
                "ename": type(e).__name__,
                "evalue": str(e)
            }
        })
    
    finally:
        # Send execution state idle
        send_message({
            "msg_id": f"{msg_id}_status_idle",
            "msg_type": "status",
            "parent_id": msg_id,
            "content": {"execution_state": "idle"}
        })


def send_message(msg):
    """Send a message to stdout as JSON."""
    print(json.dumps(msg), flush=True)


def main():
    """Main loop reading commands from stdin."""
    send_message({
        "msg_id": "kernel_ready",
        "msg_type": "status",
        "content": {"execution_state": "idle"}
    })
    
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            
            request = json.loads(line.strip())
            msg_type = request.get("type", "execute")
            
            if msg_type == "execute":
                code = request.get("code", "")
                msg_id = request.get("msg_id", "unknown")
                execute_code(code, msg_id)
            elif msg_type == "interrupt":
                # Handle interrupt (not fully implemented in this simple version)
                pass
            elif msg_type == "shutdown":
                break
                
        except json.JSONDecodeError:
            continue
        except Exception as e:
            send_message({
                "msg_id": "error",
                "msg_type": "error",
                "content": {
                    "ename": type(e).__name__,
                    "evalue": str(e),
                    "traceback": traceback.format_exc().split('\n')
                }
            })


if __name__ == "__main__":
    main()
`

	if err := os.WriteFile(wrapperPath, []byte(wrapperCode), 0755); err != nil {
		log.Error().Err(err).Msg("Failed to create kernel wrapper")
		return ""
	}

	return wrapperPath
}

// readKernelOutput reads output from the kernel process
func (uc *UseCase) readKernelOutput(instance *KernelInstance) {
	for {
		select {
		case <-instance.stopChan:
			return
		default:
			var msg KernelMessage
			if err := instance.stdout.Decode(&msg); err != nil {
				// Check if kernel process has ended
				if instance.Process.ProcessState != nil && instance.Process.ProcessState.Exited() {
					instance.Info.Status = "dead"
					return
				}
				continue
			}

			// Update kernel info
			instance.Info.LastActivity = time.Now()
			if msg.MsgType == "status" {
				if state, ok := msg.Content["execution_state"].(string); ok {
					instance.Info.Status = state
				}
			}

			// Broadcast to all registered channels
			instance.channelMu.RLock()
			for _, ch := range instance.outputChannels {
				select {
				case ch <- &msg:
				default:
					// Channel full, skip
				}
			}
			instance.channelMu.RUnlock()
		}
	}
}

// StopKernel stops a running kernel
func (uc *UseCase) StopKernel(ctx context.Context, kernelID string) error {
	value, exists := uc.kernels.Load(kernelID)
	if !exists {
		return fmt.Errorf("kernel not found: %s", kernelID)
	}

	instance := value.(*KernelInstance)
	
	// Close stop channel to signal goroutines to stop
	select {
	case <-instance.stopChan:
		// Already closed
	default:
		close(instance.stopChan)
	}

	// Send shutdown request
	instance.mu.Lock()
	instance.stdin.Encode(map[string]string{"type": "shutdown"})
	instance.mu.Unlock()

	// Wait a bit for graceful shutdown, check if kernel is dead
	for i := 0; i < 50; i++ { // 5 seconds max
		if instance.Info.Status == "dead" {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}

	// If still not dead, force kill
	if instance.Info.Status != "dead" && instance.Process.Process != nil {
		instance.Process.Process.Kill()
	}

	// Clean up
	uc.kernels.Delete(kernelID)

	// Clean up connection directory
	connectionDir := filepath.Join(os.TempDir(), "workspace-kernels", kernelID)
	os.RemoveAll(connectionDir)

	return nil
}

// RestartKernel restarts a kernel
func (uc *UseCase) RestartKernel(ctx context.Context, kernelID string) error {
	value, exists := uc.kernels.Load(kernelID)
	if !exists {
		return fmt.Errorf("kernel not found: %s", kernelID)
	}

	instance := value.(*KernelInstance)
	specName := instance.Info.Name
	userID := instance.Info.UserID

	// Stop existing kernel
	if err := uc.StopKernel(ctx, kernelID); err != nil {
		log.Warn().Err(err).Msg("Error stopping kernel during restart")
	}

	// Start new kernel with same ID
	newInfo, err := uc.StartKernel(ctx, specName, userID)
	if err != nil {
		return err
	}

	// Update the new kernel to use the old ID
	if newValue, ok := uc.kernels.Load(newInfo.ID); ok {
		newInstance := newValue.(*KernelInstance)
		uc.kernels.Delete(newInfo.ID)
		newInstance.Info.ID = kernelID
		uc.kernels.Store(kernelID, newInstance)
	}

	return nil
}

// InterruptKernel interrupts a running kernel
func (uc *UseCase) InterruptKernel(ctx context.Context, kernelID string) error {
	value, exists := uc.kernels.Load(kernelID)
	if !exists {
		return fmt.Errorf("kernel not found: %s", kernelID)
	}

	instance := value.(*KernelInstance)

	// Send interrupt signal
	if instance.Process.Process != nil {
		instance.Process.Process.Signal(os.Interrupt)
	}

	return nil
}

// GetKernelStatus returns the status of a kernel
func (uc *UseCase) GetKernelStatus(ctx context.Context, kernelID string) (*KernelStatus, error) {
	value, exists := uc.kernels.Load(kernelID)
	if !exists {
		return nil, fmt.Errorf("kernel not found: %s", kernelID)
	}

	instance := value.(*KernelInstance)

	status := &KernelStatus{
		ID:               kernelID,
		Status:           instance.Info.Status,
		ExecutionState:   instance.Info.Status,
		ExecutionCount:   instance.Info.ExecutionCount,
		LastActivity:     instance.Info.LastActivity,
		ConnectionStatus: "connected",
	}

	// Check if process is still running
	if instance.Process.ProcessState != nil && instance.Process.ProcessState.Exited() {
		status.Status = "dead"
		status.ConnectionStatus = "disconnected"
	}

	return status, nil
}

// ListKernels returns all kernels for a user
func (uc *UseCase) ListKernels(ctx context.Context, userID string) ([]*KernelInfo, error) {
	var kernels []*KernelInfo

	uc.kernels.Range(func(key, value interface{}) bool {
		instance := value.(*KernelInstance)
		if instance.Info.UserID == userID {
			kernels = append(kernels, instance.Info)
		}
		return true
	})

	return kernels, nil
}

// RegisterOutputChannel registers a channel to receive kernel output
func (uc *UseCase) RegisterOutputChannel(kernelID, sessionID string, ch chan *KernelMessage) {
	value, exists := uc.kernels.Load(kernelID)
	if !exists {
		return
	}

	instance := value.(*KernelInstance)
	instance.channelMu.Lock()
	instance.outputChannels[sessionID] = ch
	instance.channelMu.Unlock()
}

// UnregisterOutputChannel unregisters an output channel
func (uc *UseCase) UnregisterOutputChannel(kernelID, sessionID string) {
	value, exists := uc.kernels.Load(kernelID)
	if !exists {
		return
	}

	instance := value.(*KernelInstance)
	instance.channelMu.Lock()
	delete(instance.outputChannels, sessionID)
	instance.channelMu.Unlock()
}

// ExecuteCode executes code on a kernel
func (uc *UseCase) ExecuteCode(ctx context.Context, kernelID, sessionID string, req *ExecuteRequest) error {
	value, exists := uc.kernels.Load(kernelID)
	if !exists {
		return fmt.Errorf("kernel not found: %s", kernelID)
	}

	instance := value.(*KernelInstance)

	// Check if kernel process is still running
	if instance.Info.Status == "dead" {
		return fmt.Errorf("kernel is dead, please restart")
	}

	// Check if process has exited
	if instance.Process.ProcessState != nil && instance.Process.ProcessState.Exited() {
		instance.Info.Status = "dead"
		return fmt.Errorf("kernel process has exited")
	}

	// Send execute request to kernel
	instance.mu.Lock()
	err := instance.stdin.Encode(map[string]interface{}{
		"type":   "execute",
		"msg_id": req.MsgID,
		"code":   req.Code,
	})
	instance.mu.Unlock()

	if err != nil {
		// Mark kernel as dead if we can't write to it
		instance.Info.Status = "dead"
		return fmt.Errorf("failed to send execute request: %w", err)
	}

	return nil
}
