import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';
import { cn } from '@/lib/utils';
import { useEditor } from '../../context/EditorContext';
import { useApp } from '../../context/AppContext';
import { NotebookEditor } from './NotebookEditor';
import { CellOperation } from '../../services/api';

interface MonacoEditorProps {
  height?: string;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({ height = '100%' }) => {
  const { t } = useTranslation();
  const { tabs, activeTabId, updateTabContent, saveFile, patchNotebookFile } = useEditor();
  const { theme: themeMode } = useApp();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // Configure keyboard shortcut Ctrl+S / Cmd+S for save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (activeTabId) {
        saveFile(activeTabId).catch(console.error);
      }
    });

    // Define custom themes
    monaco.editor.defineTheme('custom-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#18181B',
        'editorLineNumber.foreground': '#71717A',
        'editor.selectionBackground': '#3B82F620',
        'editor.lineHighlightBackground': '#F4F4F5',
        'editorCursor.foreground': '#2563EB',
        'editorWhitespace.foreground': '#E4E4E7',
        'editorIndentGuide.background': '#E4E4E7',
        'editorIndentGuide.activeBackground': '#A1A1AA',
      }
    });

    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#18181B',
        'editor.foreground': '#FAFAFA',
        'editorLineNumber.foreground': '#71717A',
        'editor.selectionBackground': '#3B82F630',
        'editor.lineHighlightBackground': '#27272A',
        'editorCursor.foreground': '#3B82F6',
        'editorWhitespace.foreground': '#3F3F46',
        'editorIndentGuide.background': '#3F3F46',
        'editorIndentGuide.activeBackground': '#52525B',
      }
    });

    // Apply theme
    const editorTheme = themeMode === 'dark' ? 'custom-dark' : 'custom-light';
    monaco.editor.setTheme(editorTheme);
  };

  // Update theme when it changes
  useEffect(() => {
    if (monacoRef.current) {
      const editorTheme = themeMode === 'dark' ? 'custom-dark' : 'custom-light';
      monacoRef.current.editor.setTheme(editorTheme);
    }
  }, [themeMode]);

  const handleEditorChange = (value: string | undefined) => {
    if (activeTabId && value !== undefined) {
      updateTabContent(activeTabId, value);
    }
  };

  const getLanguage = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'py': 'python',
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'json': 'json',
      'md': 'markdown',
      'sql': 'sql',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'yaml': 'yaml',
      'yml': 'yaml'
    };
    return languageMap[ext || ''] || 'plaintext';
  };

  if (!activeTab) {
    return (
      <div 
        className="h-full flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        {t('workspace.selectFile')}
      </div>
    );
  }

  const editorTheme = themeMode === 'dark' ? 'custom-dark' : 'custom-light';
  const isNotebook = activeTab.fileName.toLowerCase().endsWith('.ipynb');

  return (
    <div className="h-full w-full bg-background" style={{ height }}>
      {isNotebook ? (
        <NotebookEditor 
          content={activeTab.content} 
          height={height} 
          onChange={(newContent) => {
            if (activeTabId) {
              updateTabContent(activeTabId, newContent);
            }
          }}
          onSave={async () => {
            if (activeTabId) {
              await saveFile(activeTabId);
            }
          }}
          onPatchSave={async (operations: CellOperation[]) => {
            if (activeTabId) {
              await patchNotebookFile(activeTabId, operations);
            }
          }}
          isDirty={activeTab.isDirty}
          autoSaveEnabled={autoSaveEnabled}
          onAutoSaveChange={setAutoSaveEnabled}
        />
      ) : (
        <Editor
          height={height}
          language={getLanguage(activeTab.fileName)}
          value={activeTab.content || ''}
          onChange={handleEditorChange}
          onMount={(editor, monaco) => handleEditorDidMount(editor, monaco)}
          theme={editorTheme}
          options={{
            minimap: { enabled: true },
            fontSize: 14,
            wordWrap: 'on',
            automaticLayout: true,
            tabSize: 2,
            formatOnPaste: true,
            formatOnType: true
          }}
        />
      )}
    </div>
  );
};
