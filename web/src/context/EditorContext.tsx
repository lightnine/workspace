import React, { createContext, useContext, useState, ReactNode, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { Tab, FileItem } from '../types';
import { getFileContent, saveFileContent, patchNotebook, CellOperation, addRecent } from '../services/api';

// Helper function to generate file URL based on file type
export const getFileEditorUrl = (fileId: number, fileType: string): string => {
  if (fileType === 'notebook') {
    return `/editor/notebooks/${fileId}`;
  }
  return `/editor/files/${fileId}`;
};

interface EditorContextType {
  tabs: Tab[];
  activeTabId: string | null;
  activeTab: Tab | null;
  setActiveTabId: (id: string | null, updateUrl?: boolean) => void;
  openFile: (file: FileItem, updateUrl?: boolean) => Promise<void>;
  closeTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  markTabDirty: (tabId: string, isDirty: boolean) => void;
  saveFile: (tabId: string) => Promise<void>;
  patchNotebookFile: (tabId: string, operations: CellOperation[]) => Promise<void>;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const EditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabIdState, setActiveTabIdState] = useState<string | null>(null);
  
  // 计算 activeTab
  const activeTab = tabs.find(tab => tab.id === activeTabIdState) || null;
  
  // Wrapped setActiveTabId that also updates URL
  const setActiveTabId = useCallback((id: string | null, updateUrl: boolean = true) => {
    setActiveTabIdState(id);
    
    if (updateUrl && id) {
      const tab = tabs.find(t => t.id === id);
      if (tab) {
        const newUrl = getFileEditorUrl(tab.fileId, tab.fileType);
        if (location.pathname !== newUrl) {
          navigate(newUrl);
        }
      }
    } else if (updateUrl && !id) {
      // No active tab, go to workspace
      if (location.pathname !== '/workspace' && 
          (location.pathname.startsWith('/editor/notebooks/') || location.pathname.startsWith('/editor/files/'))) {
        navigate('/workspace');
      }
    }
  }, [tabs, navigate, location.pathname]);
  
  // 跟踪正在打开的文件 ID，防止重复打开
  const openingFilesRef = useRef<Set<number>>(new Set());

  const openFile = useCallback(async (file: FileItem, updateUrl: boolean = true) => {
    // 如果这个文件正在打开中，跳过
    if (openingFilesRef.current.has(file.id)) {
      return;
    }
    
    // 如果是目录，不打开
    if (file.type === 'directory') {
      return;
    }
    
    // 检查文件是否已经打开
    const existingTab = tabs.find(tab => tab.fileId === file.id);
    if (existingTab) {
      setActiveTabIdState(existingTab.id);
      // Update URL even when switching to existing tab
      if (updateUrl) {
        const newUrl = getFileEditorUrl(file.id, file.type);
        if (location.pathname !== newUrl) {
          navigate(newUrl);
        }
      }
      return;
    }
    
    // 标记为正在打开
    openingFilesRef.current.add(file.id);

    try {
      // 获取文件内容
      let content = file.content || '';
      if (!content) {
        content = await getFileContent(file.id);
      }

      // 创建新标签
      const newTab: Tab = {
        id: `tab-${Date.now()}`,
        fileId: file.id,
        fileName: file.name,
        filePath: file.path,
        fileType: file.type,
        isDirty: false,
        content
      };

      setTabs(prev => {
        // 再次检查是否已存在（防止竞态条件）
        const existing = prev.find(tab => tab.fileId === file.id);
        if (existing) {
          setActiveTabIdState(existing.id);
          return prev;
        }
        return [...prev, newTab];
      });
      setActiveTabIdState(newTab.id);

      // Update URL after opening file
      if (updateUrl) {
        const newUrl = getFileEditorUrl(file.id, file.type);
        if (location.pathname !== newUrl) {
          navigate(newUrl);
        }
      }

      // 添加到最近访问
      addRecent({
        fileId: file.id,
        fileName: file.name,
        filePath: file.full_path,
        type: file.type
      });
    } catch (error) {
      console.error('打开文件失败:', error);
      throw error;
    } finally {
      // 移除正在打开的标记
      openingFilesRef.current.delete(file.id);
    }
  }, [tabs, navigate, location.pathname]);

  const closeTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab?.isDirty) {
      // TODO: 显示确认对话框
      const confirmed = window.confirm(t('explorer.unsavedWarning', { fileName: tab.fileName }));
      if (!confirmed) return;
    }

    const remainingTabs = tabs.filter(t => t.id !== tabId);
    setTabs(remainingTabs);
    
    if (activeTabIdState === tabId) {
      if (remainingTabs.length > 0) {
        const lastTab = remainingTabs[remainingTabs.length - 1];
        setActiveTabIdState(lastTab.id);
        // Update URL to the new active tab
        const newUrl = getFileEditorUrl(lastTab.fileId, lastTab.fileType);
        navigate(newUrl);
      } else {
        setActiveTabIdState(null);
        // No more tabs, navigate back to workspace
        navigate('/workspace');
      }
    }
  }, [tabs, activeTabIdState, t, navigate]);

  const updateTabContent = (tabId: string, content: string) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === tabId ? { ...tab, content, isDirty: true } : tab
      )
    );
  };

  const markTabDirty = (tabId: string, isDirty: boolean) => {
    setTabs(prev =>
      prev.map(tab => (tab.id === tabId ? { ...tab, isDirty } : tab))
    );
  };

  const saveFile = async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    try {
      await saveFileContent(tab.fileId, tab.content || '', 'Save from editor');
      markTabDirty(tabId, false);
    } catch (error) {
      console.error('保存文件失败:', error);
      throw error;
    }
  };

  // 增量保存 Notebook
  const patchNotebookFile = async (tabId: string, operations: CellOperation[]) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    try {
      await patchNotebook(tab.fileId, operations, 'Patch from editor');
      markTabDirty(tabId, false);
    } catch (error) {
      console.error('增量保存 Notebook 失败:', error);
      throw error;
    }
  };

  return (
    <EditorContext.Provider
      value={{
        tabs,
        activeTabId: activeTabIdState,
        activeTab,
        setActiveTabId,
        openFile,
        closeTab,
        updateTabContent,
        markTabDirty,
        saveFile,
        patchNotebookFile
      }}
    >
      {children}
    </EditorContext.Provider>
  );
};

export const useEditor = () => {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within EditorProvider');
  }
  return context;
};
