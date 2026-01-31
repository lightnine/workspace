import React, { createContext, useContext, useState, ReactNode, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Tab, FileItem } from '../types';
import { getFileContent, saveFileContent, patchNotebook, CellOperation, addRecent } from '../services/api';

interface EditorContextType {
  tabs: Tab[];
  activeTabId: string | null;
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
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  
  // 跟踪正在打开的文件 ID，防止重复打开
  const openingFilesRef = useRef<Set<number>>(new Set());

  const openFile = useCallback(async (file: FileItem) => {
    // 如果这个文件正在打开中，跳过
    if (openingFilesRef.current.has(file.id)) {
      return;
    }
    
    // 如果是目录，不打开
    if (file.type === 'directory') {
      return;
    }
    
    // 检查文件是否已经打开 (使用函数式更新来获取最新状态)
    let existingTabFound = false;
    setTabs(prev => {
      const existingTab = prev.find(tab => tab.fileId === file.id);
      if (existingTab) {
        existingTabFound = true;
        setActiveTabId(existingTab.id);
      }
      return prev;
    });
    
    if (existingTabFound) {
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
        isDirty: false,
        content
      };

      setTabs(prev => {
        // 再次检查是否已存在（防止竞态条件）
        const existingTab = prev.find(tab => tab.fileId === file.id);
        if (existingTab) {
          setActiveTabId(existingTab.id);
          return prev;
        }
        return [...prev, newTab];
      });
      setActiveTabId(newTab.id);

      // 添加到最近访问
      addRecent({
        fileId: file.id,
        fileName: file.name,
        filePath: file.path,
        type: file.type
      });
    } catch (error) {
      console.error('打开文件失败:', error);
      throw error;
    } finally {
      // 移除正在打开的标记
      openingFilesRef.current.delete(file.id);
    }
  }, []);

  const closeTab = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab?.isDirty) {
      // TODO: 显示确认对话框
      const confirmed = window.confirm(t('explorer.unsavedWarning', { fileName: tab.fileName }));
      if (!confirmed) return;
    }

    setTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTabId === tabId) {
      const remainingTabs = tabs.filter(t => t.id !== tabId);
      setActiveTabId(remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].id : null);
    }
  };

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
