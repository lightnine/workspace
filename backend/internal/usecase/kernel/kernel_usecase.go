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

	"github.com/leondli/workspace/internal/infrastructure/config"
	"github.com/leondli/workspace/internal/infrastructure/gateway"
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
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Status         string    `json:"status"` // starting, idle, busy, dead
	ExecutionCount int       `json:"execution_count"`
	LastActivity   time.Time `json:"last_activity"`
	UserID         string    `json:"user_id"`
	IsGateway      bool      `json:"is_gateway"` // Whether this kernel is managed by gateway
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
	kernels        sync.Map // map[string]*KernelInstance (for local kernels)
	kernelSpecs    map[string]*KernelSpec
	pythonPath     string
	workspacePath  string
	gatewayEnabled bool
	gatewayManager *gateway.KernelManager
}

// NewUseCase creates a new kernel use case
func NewUseCase(pythonPath, workspacePath string) *UseCase {
	uc := &UseCase{
		kernelSpecs:   make(map[string]*KernelSpec),
		pythonPath:    pythonPath,
		workspacePath: workspacePath,
	}

	// Initialize default kernel specs
	uc.initKernelSpecs()

	return uc
}

// NewUseCaseWithGateway creates a new kernel use case with gateway support
func NewUseCaseWithGateway(pythonPath, workspacePath string, gatewayCfg *config.GatewayConfig) (*UseCase, error) {
	uc := &UseCase{
		kernelSpecs:   make(map[string]*KernelSpec),
		pythonPath:    pythonPath,
		workspacePath: workspacePath,
	}

	// Initialize gateway if enabled
	if gatewayCfg != nil && gatewayCfg.Enabled {
		client, err := gateway.NewClient(gatewayCfg)
		if err != nil {
			return nil, fmt.Errorf("failed to create gateway client: %w", err)
		}

		// Ping gateway to verify connection
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := client.Ping(ctx); err != nil {
			log.Warn().Err(err).Str("gateway_url", gatewayCfg.URL).Msg("Gateway is not reachable, falling back to local kernel mode")
		} else {
			uc.gatewayEnabled = true
			uc.gatewayManager = gateway.NewKernelManager(client)
			log.Info().Str("gateway_url", gatewayCfg.URL).Msg("Gateway mode enabled")
		}
	}

	// Initialize default kernel specs (for local mode fallback)
	uc.initKernelSpecs()

	return uc, nil
}

// IsGatewayEnabled returns whether gateway mode is enabled
func (uc *UseCase) IsGatewayEnabled() bool {
	return uc.gatewayEnabled
}

// GetGatewayURL returns the gateway URL if enabled
func (uc *UseCase) GetGatewayURL() string {
	if uc.gatewayManager != nil {
		return uc.gatewayManager.GetClient().GetBaseURL()
	}
	return ""
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
	// If gateway is enabled, fetch specs from gateway
	if uc.gatewayEnabled && uc.gatewayManager != nil {
		gatewaySpecs, err := uc.gatewayManager.GetClient().GetKernelSpecs(ctx)
		if err != nil {
			log.Warn().Err(err).Msg("Failed to get kernel specs from gateway, using local specs")
		} else {
			result := make(map[string]*KernelSpec)
			for name, spec := range gatewaySpecs {
				result[name] = &KernelSpec{
					Name:        spec.Name,
					DisplayName: spec.DisplayName,
					Language:    spec.Language,
				}
			}
			return result, nil
		}
	}

	// Fall back to local specs
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
	// If gateway is enabled, start kernel on gateway
	if uc.gatewayEnabled && uc.gatewayManager != nil {
		return uc.startGatewayKernel(ctx, specName, userID)
	}

	// Fall back to local kernel
	return uc.startLocalKernel(ctx, specName, userID)
}

// startGatewayKernel starts a kernel on the remote gateway
func (uc *UseCase) startGatewayKernel(ctx context.Context, specName string, userID string) (*KernelInfo, error) {
	gk, err := uc.gatewayManager.StartKernel(ctx, specName, userID)
	if err != nil {
		return nil, err
	}

	return &KernelInfo{
		ID:             gk.ID,
		Name:           gk.Name,
		Status:         gk.Status,
		ExecutionCount: 0,
		LastActivity:   gk.LastActivity,
		UserID:         userID,
		IsGateway:      true,
	}, nil
}

// startLocalKernel starts a kernel locally
func (uc *UseCase) startLocalKernel(ctx context.Context, specName string, userID string) (*KernelInfo, error) {
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
import os
import subprocess
import re
import time
import contextlib
from datetime import datetime

# Global namespace for code execution
_globals = {"__name__": "__main__", "__builtins__": __builtins__}
_locals = _globals

# Magic command handlers
def magic_sh(args, msg_id):
    """Execute shell command: %sh <command> or !<command>"""
    result = subprocess.run(args, shell=True, capture_output=True, text=True)
    output = ""
    if result.stdout:
        output += result.stdout
    if result.stderr:
        output += result.stderr
    return output, None

def magic_cd(args, msg_id):
    """Change directory: %cd <path>"""
    path = args.strip() if args else os.path.expanduser("~")
    path = os.path.expanduser(path)
    path = os.path.expandvars(path)
    try:
        os.chdir(path)
        return f"Changed directory to: {os.getcwd()}\n", None
    except Exception as e:
        return None, str(e)

def magic_pwd(args, msg_id):
    """Print working directory: %pwd"""
    return os.getcwd() + "\n", None

def magic_env(args, msg_id):
    """Show or set environment variables: %env [VAR=value]"""
    if not args or not args.strip():
        # Show all env vars
        output = "\n".join(f"{k}={v}" for k, v in sorted(os.environ.items()))
        return output + "\n", None
    elif "=" in args:
        # Set env var
        key, value = args.split("=", 1)
        os.environ[key.strip()] = value.strip()
        return f"Set {key.strip()}={value.strip()}\n", None
    else:
        # Show specific var
        key = args.strip()
        value = os.environ.get(key, "")
        return f"{key}={value}\n", None

def magic_pip(args, msg_id):
    """Run pip command: %pip <args>"""
    cmd = f"{sys.executable} -m pip {args}"
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    output = ""
    if result.stdout:
        output += result.stdout
    if result.stderr:
        output += result.stderr
    return output, None

def magic_time(code, msg_id):
    """Time execution of code: %time <code>"""
    start = time.time()
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    
    with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
        try:
            compiled = compile(code, '<cell>', 'eval')
            result = eval(compiled, _globals, _locals)
        except SyntaxError:
            compiled = compile(code, '<cell>', 'exec')
            result = None
            exec(compiled, _globals, _locals)
    
    elapsed = time.time() - start
    output = stdout_capture.getvalue()
    output += f"\nCPU times: {elapsed:.4f}s\nWall time: {elapsed:.4f}s\n"
    return output, None

def magic_timeit(code, msg_id):
    """Time execution multiple times: %timeit <code>"""
    import timeit as _timeit
    timer = _timeit.Timer(code, globals=_globals)
    # Determine number of loops
    for i in range(1, 10):
        number = 10 ** i
        time_taken = timer.timeit(number=number)
        if time_taken >= 0.2:
            break
    
    per_loop = time_taken / number
    if per_loop < 1e-6:
        unit = "ns"
        per_loop *= 1e9
    elif per_loop < 1e-3:
        unit = "µs"
        per_loop *= 1e6
    elif per_loop < 1:
        unit = "ms"
        per_loop *= 1e3
    else:
        unit = "s"
    
    return f"{number} loops, best of 3: {per_loop:.3g} {unit} per loop\n", None

def magic_who(args, msg_id):
    """List variables: %who [type]"""
    filter_type = args.strip() if args else None
    vars_list = []
    for name, value in _globals.items():
        if name.startswith('_'):
            continue
        if filter_type:
            if filter_type == "int" and isinstance(value, int):
                vars_list.append(name)
            elif filter_type == "str" and isinstance(value, str):
                vars_list.append(name)
            elif filter_type == "list" and isinstance(value, list):
                vars_list.append(name)
            elif filter_type == "dict" and isinstance(value, dict):
                vars_list.append(name)
            elif filter_type == "function" and callable(value):
                vars_list.append(name)
        else:
            vars_list.append(name)
    return "  ".join(vars_list) + "\n" if vars_list else "No variables defined.\n", None

def magic_whos(args, msg_id):
    """List variables with details: %whos"""
    lines = ["Variable   Type       Data/Info", "-" * 40]
    for name, value in sorted(_globals.items()):
        if name.startswith('_'):
            continue
        type_name = type(value).__name__
        if isinstance(value, str):
            info = repr(value[:50]) + ("..." if len(value) > 50 else "")
        elif isinstance(value, (list, dict, set)):
            info = f"n={len(value)}"
        else:
            info = repr(value)[:50]
        lines.append(f"{name:<10} {type_name:<10} {info}")
    return "\n".join(lines) + "\n", None

def magic_reset(args, msg_id):
    """Reset namespace: %reset [-f]"""
    global _globals, _locals
    if args and "-f" in args:
        _globals = {"__name__": "__main__", "__builtins__": __builtins__}
        _locals = _globals
        return "Namespace reset.\n", None
    return "Use %reset -f to force reset.\n", None

def magic_run(args, msg_id):
    """Run a Python file: %run <filename>"""
    filename = args.strip()
    if not filename:
        return None, "Usage: %run <filename>"
    
    filename = os.path.expanduser(filename)
    if not os.path.exists(filename):
        return None, f"File not found: {filename}"
    
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    
    with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
        with open(filename, 'r') as f:
            code = f.read()
        exec(compile(code, filename, 'exec'), _globals, _locals)
    
    return stdout_capture.getvalue(), None

def magic_ls(args, msg_id):
    """List directory: %ls [path]"""
    return magic_sh(f"ls -la {args}" if args else "ls -la", msg_id)

def magic_cat(args, msg_id):
    """Show file contents: %cat <filename>"""
    return magic_sh(f"cat {args}", msg_id)

def magic_mkdir(args, msg_id):
    """Create directory: %mkdir <dirname>"""
    return magic_sh(f"mkdir -p {args}", msg_id)

def magic_rm(args, msg_id):
    """Remove file: %rm <filename>"""
    return magic_sh(f"rm {args}", msg_id)

def magic_cp(args, msg_id):
    """Copy file: %cp <src> <dst>"""
    return magic_sh(f"cp {args}", msg_id)

def magic_mv(args, msg_id):
    """Move file: %mv <src> <dst>"""
    return magic_sh(f"mv {args}", msg_id)

def magic_head(args, msg_id):
    """Show first lines: %head <filename>"""
    return magic_sh(f"head {args}", msg_id)

def magic_tail(args, msg_id):
    """Show last lines: %tail <filename>"""
    return magic_sh(f"tail {args}", msg_id)

# Cell magic handlers (%%magic)
def cell_magic_sh(code, msg_id):
    """Execute entire cell as shell script: %%sh"""
    result = subprocess.run(code, shell=True, capture_output=True, text=True)
    output = ""
    if result.stdout:
        output += result.stdout
    if result.stderr:
        output += result.stderr
    return output, None

def cell_magic_bash(code, msg_id):
    """Execute entire cell as bash script: %%bash"""
    result = subprocess.run(code, shell=True, executable='/bin/bash', capture_output=True, text=True)
    output = ""
    if result.stdout:
        output += result.stdout
    if result.stderr:
        output += result.stderr
    return output, None

def cell_magic_time(code, msg_id):
    """Time entire cell: %%time"""
    return magic_time(code, msg_id)

def cell_magic_writefile(code, msg_id, args):
    """Write cell to file: %%writefile <filename>"""
    filename = args.strip()
    if not filename:
        return None, "Usage: %%writefile <filename>"
    try:
        with open(filename, 'w') as f:
            f.write(code)
        return f"Writing {filename}\n", None
    except Exception as e:
        return None, str(e)

# Magic command registry
LINE_MAGICS = {
    'sh': magic_sh,
    'cd': magic_cd,
    'pwd': magic_pwd,
    'env': magic_env,
    'pip': magic_pip,
    'time': magic_time,
    'timeit': magic_timeit,
    'who': magic_who,
    'whos': magic_whos,
    'reset': magic_reset,
    'run': magic_run,
    'ls': magic_ls,
    'cat': magic_cat,
    'mkdir': magic_mkdir,
    'rm': magic_rm,
    'cp': magic_cp,
    'mv': magic_mv,
    'head': magic_head,
    'tail': magic_tail,
}

CELL_MAGICS = {
    'sh': cell_magic_sh,
    'bash': cell_magic_bash,
    'time': cell_magic_time,
    'writefile': cell_magic_writefile,
}

def process_magic(code, msg_id):
    """Process magic commands in code. Returns (processed_code, output, error)"""
    lines = code.split('\n')
    
    # Check for cell magic (%%magic at the start)
    if lines and lines[0].strip().startswith('%%'):
        first_line = lines[0].strip()
        match = re.match(r'^%%(\w+)\s*(.*)', first_line)
        if match:
            magic_name = match.group(1)
            magic_args = match.group(2)
            cell_code = '\n'.join(lines[1:])
            
            if magic_name in CELL_MAGICS:
                if magic_name == 'writefile':
                    return None, *cell_magic_writefile(cell_code, msg_id, magic_args)
                return None, *CELL_MAGICS[magic_name](cell_code, msg_id)
            else:
                return None, None, f"Unknown cell magic: %%{magic_name}"
    
    # Process line magics (%magic or !command)
    processed_lines = []
    output_parts = []
    
    for line in lines:
        stripped = line.strip()
        
        # Handle !command (shell shortcut)
        if stripped.startswith('!'):
            cmd = stripped[1:]
            out, err = magic_sh(cmd, msg_id)
            if err:
                return None, None, err
            if out:
                output_parts.append(out)
            continue
        
        # Handle %magic
        match = re.match(r'^%(\w+)\s*(.*)', stripped)
        if match:
            magic_name = match.group(1)
            magic_args = match.group(2)
            
            if magic_name in LINE_MAGICS:
                out, err = LINE_MAGICS[magic_name](magic_args, msg_id)
                if err:
                    return None, None, err
                if out:
                    output_parts.append(out)
            else:
                return None, None, f"Unknown magic: %{magic_name}"
            continue
        
        # Regular code line
        processed_lines.append(line)
    
    remaining_code = '\n'.join(processed_lines).strip()
    magic_output = ''.join(output_parts) if output_parts else None
    
    return remaining_code, magic_output, None

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
        # Process magic commands first
        remaining_code, magic_output, magic_error = process_magic(code, msg_id)
        
        if magic_error:
            raise Exception(magic_error)
        
        # Send magic output if any
        if magic_output:
            send_message({
                "msg_id": f"{msg_id}_stream_stdout",
                "msg_type": "stream",
                "parent_id": msg_id,
                "content": {
                    "name": "stdout",
                    "text": magic_output
                }
            })
        
        # Execute remaining Python code if any
        if remaining_code:
            # Capture stdout/stderr
            stdout_capture = io.StringIO()
            stderr_capture = io.StringIO()
            
            with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
                # Try to compile as expression first (for display output)
                try:
                    compiled = compile(remaining_code, '<cell>', 'eval')
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
                    compiled = compile(remaining_code, '<cell>', 'exec')
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
	// Try gateway first if enabled
	if uc.gatewayEnabled && uc.gatewayManager != nil {
		if _, exists := uc.gatewayManager.GetKernel(kernelID); exists {
			return uc.gatewayManager.StopKernel(ctx, kernelID)
		}
	}

	// Fall back to local kernel
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
	// Try gateway first if enabled
	if uc.gatewayEnabled && uc.gatewayManager != nil {
		if _, exists := uc.gatewayManager.GetKernel(kernelID); exists {
			return uc.gatewayManager.RestartKernel(ctx, kernelID)
		}
	}

	// Fall back to local kernel
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
	// Try gateway first if enabled
	if uc.gatewayEnabled && uc.gatewayManager != nil {
		if _, exists := uc.gatewayManager.GetKernel(kernelID); exists {
			return uc.gatewayManager.InterruptKernel(ctx, kernelID)
		}
	}

	// Fall back to local kernel
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
	// Try gateway first if enabled
	if uc.gatewayEnabled && uc.gatewayManager != nil {
		if gk, exists := uc.gatewayManager.GetKernel(kernelID); exists {
			return &KernelStatus{
				ID:               kernelID,
				Status:           gk.Status,
				ExecutionState:   gk.ExecutionState,
				ExecutionCount:   0,
				LastActivity:     gk.LastActivity,
				ConnectionStatus: "connected",
			}, nil
		}
	}

	// Fall back to local kernel
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

	// Get gateway kernels if enabled
	if uc.gatewayEnabled && uc.gatewayManager != nil {
		gatewayKernels := uc.gatewayManager.ListKernels(userID)
		for _, gk := range gatewayKernels {
			kernels = append(kernels, &KernelInfo{
				ID:             gk.ID,
				Name:           gk.Name,
				Status:         gk.Status,
				ExecutionCount: 0,
				LastActivity:   gk.LastActivity,
				UserID:         gk.UserID,
				IsGateway:      true,
			})
		}
	}

	// Also get local kernels
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
	// Try gateway first if enabled
	if uc.gatewayEnabled && uc.gatewayManager != nil {
		if _, exists := uc.gatewayManager.GetKernel(kernelID); exists {
			// Create adapter channel for gateway
			gatewayCh := make(chan *gateway.KernelOutputMessage, 100)
			uc.gatewayManager.RegisterOutputChannel(kernelID, sessionID, gatewayCh)

			// Start goroutine to convert gateway messages to KernelMessage
			go func() {
				for msg := range gatewayCh {
					if msg == nil {
						return
					}
					ch <- &KernelMessage{
						MsgID:    msg.MsgID,
						MsgType:  msg.MsgType,
						ParentID: msg.ParentID,
						Content:  msg.Content,
						Metadata: msg.Metadata,
					}
				}
			}()
			return
		}
	}

	// Fall back to local kernel
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
	// Try gateway first if enabled
	if uc.gatewayEnabled && uc.gatewayManager != nil {
		if _, exists := uc.gatewayManager.GetKernel(kernelID); exists {
			uc.gatewayManager.UnregisterOutputChannel(kernelID, sessionID)
			return
		}
	}

	// Fall back to local kernel
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
	// Try gateway first if enabled
	if uc.gatewayEnabled && uc.gatewayManager != nil {
		if _, exists := uc.gatewayManager.GetKernel(kernelID); exists {
			return uc.gatewayManager.ExecuteCode(ctx, kernelID, req.Code, req.MsgID, req.Silent, req.StoreHistory)
		}
	}

	// Fall back to local kernel
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
