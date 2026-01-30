import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Tab, FileItem } from '../types';
import { getFileContent, saveFileContent, addRecent } from '../services/api';

interface EditorContextType {
  tabs: Tab[];
  activeTabId: string | null;
  setActiveTabId: (id: string | null) => void;
  openFile: (file: FileItem) => Promise<void>;
  closeTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  markTabDirty: (tabId: string, isDirty: boolean) => void;
  saveFile: (tabId: string) => Promise<void>;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const EditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openFile = async (file: FileItem) => {
    // 检查文件是否已经打开
    const existingTab = tabs.find(tab => tab.fileId === file.id);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    // 如果是目录，不打开
    if (file.type === 'directory') {
      return;
    }

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

      setTabs(prev => [...prev, newTab]);
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
    }
  };

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
        saveFile
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
