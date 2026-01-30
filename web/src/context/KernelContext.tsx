import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  KernelInfo,
  KernelSpec,
  KernelConnection,
  KernelMessage,
  ExecuteRequest,
  CellOutput,
  listKernelSpecs,
  listKernels,
  startKernel,
  stopKernel,
  restartKernel,
  interruptKernel,
  kernelMessageToCellOutput,
  generateMsgId,
} from '../services/kernel';

interface ExecutionState {
  cellId: string;
  msgId: string;
  status: 'pending' | 'running' | 'success' | 'error';
  outputs: CellOutput[];
  executionCount?: number;
}

interface KernelContextType {
  // Kernel specs
  kernelSpecs: Record<string, KernelSpec>;
  loadingSpecs: boolean;
  
  // Current kernel
  currentKernel: KernelInfo | null;
  kernelStatus: string;
  
  // Available kernels
  kernels: KernelInfo[];
  
  // Actions
  refreshKernelSpecs: () => Promise<void>;
  refreshKernels: () => Promise<void>;
  connectKernel: (specName: string) => Promise<void>;
  disconnectKernel: () => Promise<void>;
  restartCurrentKernel: () => Promise<void>;
  interruptCurrentKernel: () => Promise<void>;
  
  // Execution
  executeCode: (cellId: string, code: string, onOutput: (output: CellOutput) => void, onComplete: (success: boolean, executionCount?: number) => void) => string;
  cancelExecution: (msgId: string) => void;
  
  // Execution states
  executionStates: Map<string, ExecutionState>;
  
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
}

const KernelContext = createContext<KernelContextType | null>(null);

export const useKernel = () => {
  const context = useContext(KernelContext);
  if (!context) {
    throw new Error('useKernel must be used within a KernelProvider');
  }
  return context;
};

export const KernelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State
  const [kernelSpecs, setKernelSpecs] = useState<Record<string, KernelSpec>>({});
  const [loadingSpecs, setLoadingSpecs] = useState(false);
  const [kernels, setKernels] = useState<KernelInfo[]>([]);
  const [currentKernel, setCurrentKernel] = useState<KernelInfo | null>(null);
  const [kernelStatus, setKernelStatus] = useState<string>('disconnected');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [executionStates, setExecutionStates] = useState<Map<string, ExecutionState>>(new Map());
  
  // Refs
  const connectionRef = useRef<KernelConnection | null>(null);
  const executionCallbacksRef = useRef<Map<string, {
    onOutput: (output: CellOutput) => void;
    onComplete: (success: boolean, executionCount?: number) => void;
  }>>(new Map());

  // Load kernel specs
  const refreshKernelSpecs = useCallback(async () => {
    setLoadingSpecs(true);
    try {
      const specs = await listKernelSpecs();
      setKernelSpecs(specs);
    } catch (error) {
      console.error('Failed to load kernel specs:', error);
    } finally {
      setLoadingSpecs(false);
    }
  }, []);

  // Load running kernels
  const refreshKernels = useCallback(async () => {
    try {
      const kernelList = await listKernels();
      setKernels(kernelList);
    } catch (error) {
      console.error('Failed to load kernels:', error);
    }
  }, []);

  // Connect to a kernel
  const connectKernel = useCallback(async (specName: string) => {
    setIsConnecting(true);
    setConnectionError(null);
    
    try {
      // Disconnect existing connection
      if (connectionRef.current) {
        connectionRef.current.disconnect();
        connectionRef.current = null;
      }
      
      // Start a new kernel
      const kernel = await startKernel(specName);
      setCurrentKernel(kernel);
      
      // Create WebSocket connection
      const connection = new KernelConnection(kernel.id);
      
      // Setup status callback
      connection.onStatus((status) => {
        setKernelStatus(status);
        if (status === 'connected') {
          setIsConnected(true);
        } else if (status === 'disconnected') {
          setIsConnected(false);
        }
      });
      
      await connection.connect();
      connectionRef.current = connection;
      
      setIsConnected(true);
      setKernelStatus('idle');
      
      // Refresh kernel list
      await refreshKernels();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to kernel';
      setConnectionError(errorMessage);
      console.error('Failed to connect to kernel:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [refreshKernels]);

  // Disconnect from kernel
  const disconnectKernel = useCallback(async () => {
    if (connectionRef.current) {
      connectionRef.current.disconnect();
      connectionRef.current = null;
    }
    
    if (currentKernel) {
      try {
        await stopKernel(currentKernel.id);
      } catch (error) {
        console.error('Failed to stop kernel:', error);
      }
    }
    
    setCurrentKernel(null);
    setIsConnected(false);
    setKernelStatus('disconnected');
    setExecutionStates(new Map());
    
    await refreshKernels();
  }, [currentKernel, refreshKernels]);

  // Restart kernel
  const restartCurrentKernel = useCallback(async () => {
    if (!currentKernel) return;
    
    try {
      // Clear execution states
      setExecutionStates(new Map());
      
      await restartKernel(currentKernel.id);
      
      // Reconnect WebSocket
      if (connectionRef.current) {
        connectionRef.current.disconnect();
      }
      
      const connection = new KernelConnection(currentKernel.id);
      connection.onStatus((status) => {
        setKernelStatus(status);
        if (status === 'connected') {
          setIsConnected(true);
        } else if (status === 'disconnected') {
          setIsConnected(false);
        }
      });
      
      await connection.connect();
      connectionRef.current = connection;
      
      setKernelStatus('idle');
    } catch (error) {
      console.error('Failed to restart kernel:', error);
    }
  }, [currentKernel]);

  // Interrupt kernel
  const interruptCurrentKernel = useCallback(async () => {
    if (!currentKernel) return;
    
    try {
      await interruptKernel(currentKernel.id);
    } catch (error) {
      console.error('Failed to interrupt kernel:', error);
    }
  }, [currentKernel]);

  // Execute code
  const executeCode = useCallback((
    cellId: string,
    code: string,
    onOutput: (output: CellOutput) => void,
    onComplete: (success: boolean, executionCount?: number) => void
  ): string => {
    if (!connectionRef.current || !isConnected) {
      onComplete(false);
      return '';
    }

    const msgId = generateMsgId();
    
    // Store callbacks
    executionCallbacksRef.current.set(msgId, { onOutput, onComplete });
    
    // Initialize execution state
    setExecutionStates(prev => {
      const newMap = new Map(prev);
      newMap.set(cellId, {
        cellId,
        msgId,
        status: 'pending',
        outputs: [],
      });
      return newMap;
    });

    // Create execute request
    const request: ExecuteRequest = {
      msg_id: msgId,
      code,
      silent: false,
      store_history: true,
      cell_id: cellId,
    };

    // Handle messages from kernel
    const handleMessage = (msg: KernelMessage) => {
      const callbacks = executionCallbacksRef.current.get(msgId);
      if (!callbacks) return;

      // Update execution state based on message type
      if (msg.msg_type === 'status') {
        const state = msg.content.execution_state as string;
        if (state === 'busy') {
          setExecutionStates(prev => {
            const newMap = new Map(prev);
            const current = newMap.get(cellId);
            if (current) {
              newMap.set(cellId, { ...current, status: 'running' });
            }
            return newMap;
          });
        }
      } else if (msg.msg_type === 'execute_reply') {
        const status = msg.content.status as string;
        const executionCount = msg.content.execution_count as number;
        const success = status === 'ok';
        
        setExecutionStates(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(cellId);
          if (current) {
            newMap.set(cellId, { 
              ...current, 
              status: success ? 'success' : 'error',
              executionCount,
            });
          }
          return newMap;
        });
        
        callbacks.onComplete(success, executionCount);
        executionCallbacksRef.current.delete(msgId);
        connectionRef.current?.unregisterHandler(msgId);
      } else {
        // Convert kernel message to cell output
        const output = kernelMessageToCellOutput(msg);
        if (output) {
          callbacks.onOutput(output);
          
          setExecutionStates(prev => {
            const newMap = new Map(prev);
            const current = newMap.get(cellId);
            if (current) {
              newMap.set(cellId, { 
                ...current, 
                outputs: [...current.outputs, output],
              });
            }
            return newMap;
          });
        }
      }
    };

    // Execute
    try {
      connectionRef.current.execute(request, handleMessage);
    } catch (error) {
      console.error('Failed to execute code:', error);
      onComplete(false);
      executionCallbacksRef.current.delete(msgId);
    }

    return msgId;
  }, [isConnected]);

  // Cancel execution
  const cancelExecution = useCallback((msgId: string) => {
    executionCallbacksRef.current.delete(msgId);
    connectionRef.current?.unregisterHandler(msgId);
  }, []);

  // Load specs on mount
  useEffect(() => {
    refreshKernelSpecs();
    refreshKernels();
  }, [refreshKernelSpecs, refreshKernels]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (connectionRef.current) {
        connectionRef.current.disconnect();
      }
    };
  }, []);

  const value: KernelContextType = {
    kernelSpecs,
    loadingSpecs,
    currentKernel,
    kernelStatus,
    kernels,
    refreshKernelSpecs,
    refreshKernels,
    connectKernel,
    disconnectKernel,
    restartCurrentKernel,
    interruptCurrentKernel,
    executeCode,
    cancelExecution,
    executionStates,
    isConnected,
    isConnecting,
    connectionError,
  };

  return (
    <KernelContext.Provider value={value}>
      {children}
    </KernelContext.Provider>
  );
};

export default KernelContext;
