import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { FileItem } from '../types';
import { getFileTree, getAccessToken, createFile, createDirectory } from '../services/api';
import { useApp } from './AppContext';

// 文件类型定义
export type CreateFileType = 'notebook' | 'python' | 'sql' | 'markdown' | 'file' | 'directory';

// 文件类型配置
export const FILE_TYPE_CONFIG: Record<Exclude<CreateFileType, 'directory'>, {
  extension: string;
  defaultContent: string;
}> = {
  notebook: {
    extension: '.ipynb',
    defaultContent: JSON.stringify({
      cells: [
        {
          cell_type: 'code',
          execution_count: null,
          metadata: {},
          outputs: [],
          source: []
        }
      ],
      metadata: {
        kernelspec: {
          display_name: 'Python 3',
          language: 'python',
          name: 'python3'
        },
        language_info: {
          name: 'python',
          version: '3.9.0'
        }
      },
      nbformat: 4,
      nbformat_minor: 5
    }, null, 2)
  },
  python: {
    extension: '.py',
    defaultContent: '# Python script\n\n'
  },
  sql: {
    extension: '.sql',
    defaultContent: '-- SQL query\n\n'
  },
  markdown: {
    extension: '.md',
    defaultContent: '# Title\n\n'
  },
  file: {
    extension: '',
    defaultContent: ''
  }
};

interface CreateDialogState {
  open: boolean;
  type: CreateFileType | null;
}

interface WorkspaceContextType {
  fileTree: FileItem[];
  setFileTree: (tree: FileItem[]) => void;
  expandedNodes: Set<number>;
  setExpandedNodes: (nodes: Set<number>) => void;
  selectedNodeId: number | null;
  setSelectedNodeId: (id: number | null) => void;
  refreshFileTree: () => Promise<void>;
  loading: boolean;
  // 创建文件相关
  createDialog: CreateDialogState;
  openCreateDialog: (type: CreateFileType) => void;
  closeCreateDialog: () => void;
  handleCreate: (name: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useApp();
  const [fileTree, setFileTree] = useState<FileItem[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  
  // 创建对话框状态
  const [createDialog, setCreateDialog] = useState<CreateDialogState>({ open: false, type: null });

  const refreshFileTree = async () => {
    // 只有登录后才加载文件树
    const token = getAccessToken();
    if (!token) {
      setFileTree([]);
      return;
    }

    try {
      setLoading(true);
      const tree = await getFileTree();
      setFileTree(tree);
    } catch (error) {
      console.error('加载文件树失败:', error);
      setFileTree([]);
    } finally {
      setLoading(false);
    }
  };

  // 打开创建对话框
  const openCreateDialog = (type: CreateFileType) => {
    setCreateDialog({ open: true, type });
  };

  // 关闭创建对话框
  const closeCreateDialog = () => {
    setCreateDialog({ open: false, type: null });
  };

  // 获取完整文件名（带扩展名）
  const getFullFileName = (name: string, type: CreateFileType) => {
    if (type === 'directory') return name;
    const config = FILE_TYPE_CONFIG[type];
    if (!config.extension || name.endsWith(config.extension)) return name;
    return name + config.extension;
  };

  // 创建文件或目录
  const handleCreate = async (name: string) => {
    if (!name.trim() || !createDialog.type) return;

    try {
      if (createDialog.type === 'directory') {
        await createDirectory(name);
      } else {
        const config = FILE_TYPE_CONFIG[createDialog.type];
        const fullName = getFullFileName(name, createDialog.type);
        await createFile(fullName, config.defaultContent);
      }
      await refreshFileTree();
      closeCreateDialog();
    } catch (error) {
      console.error('创建失败:', error);
      throw error;
    }
  };

  // 当认证状态改变时加载文件树
  useEffect(() => {
    if (isAuthenticated) {
      refreshFileTree();
    } else {
      setFileTree([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return (
    <WorkspaceContext.Provider
      value={{
        fileTree,
        setFileTree,
        expandedNodes,
        setExpandedNodes,
        selectedNodeId,
        setSelectedNodeId,
        refreshFileTree,
        loading,
        createDialog,
        openCreateDialog,
        closeCreateDialog,
        handleCreate
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
};
