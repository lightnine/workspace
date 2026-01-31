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
  setActiveTabId: (id: string | null) => void;
  openFile: (file: FileItem) => Promise<void>;
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
  const [activeTabId, setActiveTabIdInternal] = useState<string | null>(null);
  
  // 计算 activeTab
  const activeTab = tabs.find(tab => tab.id === activeTabId) || null;
  
  // 跟踪正在打开的文件 ID，防止重复打开
  const openingFilesRef = useRef<Set<number>>(new Set());

  // 更新 URL 当 activeTab 改变时
  const updateUrl = useCallback((tab: Tab | null) => {
    if (!tab) {
      // 如果没有活动标签，导航到 workspace
      if (location.pathname.startsWith('/editor/')) {
        navigate('/workspace', { replace: true });
      }
      return;
    }
    
    // 根据文件类型确定正确的 URL
    const isNotebook = tab.fileName.endsWith('.ipynb');
    const targetUrl = isNotebook 
      ? `/editor/notebooks/${tab.fileId}` 
      : `/editor/files/${tab.fileId}`;
    
    // 只有当 URL 不同时才更新
    if (location.pathname !== targetUrl) {
      navigate(targetUrl, { replace: true });
    }
  }, [navigate, location.pathname]);

  // 自定义 setActiveTabId，在设置时同时更新 URL
  const setActiveTabId = useCallback((id: string | null) => {
    setActiveTabIdInternal(id);
    
    // 找到对应的 tab 并更新 URL
    if (id) {
      // 使用 setTimeout 确保 tabs 状态已更新
      setTimeout(() => {
        setTabs(currentTabs => {
          const tab = currentTabs.find(t => t.id === id);
          if (tab) {
            updateUrl(tab);
          }
          return currentTabs;
        });
      }, 0);
    } else {
      updateUrl(null);
    }
  }, [updateUrl]);

  const openFile = useCallback(async (file: FileItem) => {
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
      setActiveTabIdInternal(existingTab.id);
      updateUrl(existingTab);
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
          setActiveTabIdInternal(existing.id);
          updateUrl(existing);
          return prev;
        }
        return [...prev, newTab];
      });
      setActiveTabIdInternal(newTab.id);
      // 直接更新 URL，不需要等待 state 更新
      updateUrl(newTab);

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
  }, [tabs, updateUrl]);

  const closeTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab?.isDirty) {
      // TODO: 显示确认对话框
      const confirmed = window.confirm(t('explorer.unsavedWarning', { fileName: tab.fileName }));
      if (!confirmed) return;
    }

    const remainingTabs = tabs.filter(t => t.id !== tabId);
    setTabs(remainingTabs);
    
    if (activeTabId === tabId) {
      if (remainingTabs.length > 0) {
        const lastTab = remainingTabs[remainingTabs.length - 1];
        setActiveTabIdInternal(lastTab.id);
        updateUrl(lastTab);
      } else {
        setActiveTabIdInternal(null);
        updateUrl(null);
      }
    }
  }, [tabs, activeTabId, t, updateUrl]);

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
        activeTabId,
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
