import { getAccessToken } from './api';
import { API_CODE } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Kernel types
export interface KernelSpec {
  name: string;
  display_name: string;
  language: string;
  argv?: string[];
  env?: Record<string, string>;
}

export interface KernelInfo {
  id: string;
  name: string;
  status: 'starting' | 'idle' | 'busy' | 'dead';
  execution_count: number;
  last_activity: string;
  user_id: number;
}

export interface KernelStatus {
  id: string;
  status: string;
  execution_state: string;
  execution_count: number;
  last_activity: string;
  connection_status: string;
}

export interface KernelMessage {
  msg_id: string;
  msg_type: string;
  parent_id?: string;
  content: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ExecuteRequest {
  msg_id: string;
  code: string;
  silent?: boolean;
  store_history?: boolean;
  cell_id?: string;
}

export interface CellOutput {
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error';
  name?: string; // For stream: stdout/stderr
  text?: string | string[];
  data?: Record<string, unknown>;
  execution_count?: number;
  ename?: string;
  evalue?: string;
  traceback?: string[];
}

// API base URL
const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL as string) || 'http://localhost:8080';
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');

// Request ID header key
const REQUEST_ID_KEY = 'X-Request-ID';

// Helper function for API calls
async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const requestId = `req-${uuidv4()}`;
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      [REQUEST_ID_KEY]: requestId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'API request failed');
  }

  const data = await response.json();
  if (data.code !== API_CODE.SUCCESS) {
    throw new Error(data.message || 'API request failed');
  }
  return data.data;
}

// Kernel API functions

export async function listKernelSpecs(): Promise<Record<string, KernelSpec>> {
  return apiCall<Record<string, KernelSpec>>('/api/v1/kernels/specs');
}

export async function listKernels(): Promise<KernelInfo[]> {
  return apiCall<KernelInfo[]>('/api/v1/kernels');
}

export async function startKernel(name: string): Promise<KernelInfo> {
  return apiCall<KernelInfo>('/api/v1/kernels', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function stopKernel(kernelId: string): Promise<void> {
  await apiCall<void>(`/api/v1/kernels/${kernelId}`, {
    method: 'DELETE',
  });
}

export async function restartKernel(kernelId: string): Promise<void> {
  await apiCall<void>(`/api/v1/kernels/${kernelId}/restart`, {
    method: 'POST',
  });
}

export async function interruptKernel(kernelId: string): Promise<void> {
  await apiCall<void>(`/api/v1/kernels/${kernelId}/interrupt`, {
    method: 'POST',
  });
}

export async function getKernelStatus(kernelId: string): Promise<KernelStatus> {
  return apiCall<KernelStatus>(`/api/v1/kernels/${kernelId}`);
}

// Kernel WebSocket connection manager
export class KernelConnection {
  private ws: WebSocket | null = null;
  private kernelId: string;
  private messageHandlers: Map<string, (msg: KernelMessage) => void> = new Map();
  private statusCallbacks: ((status: string) => void)[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private connected = false;

  constructor(kernelId: string) {
    this.kernelId = kernelId;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const token = getAccessToken();
      const wsUrl = `${WS_BASE_URL}/api/v1/kernels/${this.kernelId}/ws${token ? `?token=${token}` : ''}`;
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`Kernel WebSocket connected: ${this.kernelId}`);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.notifyStatus('connected');
        resolve();
      };

      this.ws.onclose = (event) => {
        console.log(`Kernel WebSocket closed: ${this.kernelId}`, event.code, event.reason);
        this.connected = false;
        this.notifyStatus('disconnected');
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => {
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            this.connect().catch(console.error);
          }, this.reconnectDelay * this.reconnectAttempts);
        }
      };

      this.ws.onerror = (error) => {
        console.error('Kernel WebSocket error:', error);
        if (!this.connected) {
          reject(new Error('Failed to connect to kernel'));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: KernelMessage = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (error) {
          console.error('Failed to parse kernel message:', error);
        }
      };
    });
  }

  private handleMessage(msg: KernelMessage) {
    // Handle status updates
    if (msg.msg_type === 'status') {
      const state = msg.content?.execution_state as string;
      if (state) {
        this.notifyStatus(state);
      }
    }

    // Call registered handler for this message's parent
    if (msg.parent_id) {
      const handler = this.messageHandlers.get(msg.parent_id);
      if (handler) {
        handler(msg);
      }
    }
  }

  private notifyStatus(status: string) {
    this.statusCallbacks.forEach(cb => cb(status));
  }

  onStatus(callback: (status: string) => void) {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
    };
  }

  execute(request: ExecuteRequest, onMessage: (msg: KernelMessage) => void): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Kernel not connected');
    }

    // Register handler for this execution
    this.messageHandlers.set(request.msg_id, onMessage);

    // Send execute request
    this.ws.send(JSON.stringify(request));
  }

  unregisterHandler(msgId: string): void {
    this.messageHandlers.delete(msgId);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageHandlers.clear();
    this.statusCallbacks = [];
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }
}

// Helper function to convert KernelMessage to CellOutput
export function kernelMessageToCellOutput(msg: KernelMessage): CellOutput | null {
  switch (msg.msg_type) {
    case 'stream':
      return {
        output_type: 'stream',
        name: msg.content.name as string,
        text: msg.content.text as string,
      };
    
    case 'execute_result':
      return {
        output_type: 'execute_result',
        data: msg.content.data as Record<string, unknown>,
        execution_count: msg.content.execution_count as number,
      };
    
    case 'display_data':
      return {
        output_type: 'display_data',
        data: msg.content.data as Record<string, unknown>,
      };
    
    case 'error':
      return {
        output_type: 'error',
        ename: msg.content.ename as string,
        evalue: msg.content.evalue as string,
        traceback: msg.content.traceback as string[],
      };
    
    default:
      return null;
  }
}

// Generate unique message ID
export function generateMsgId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
