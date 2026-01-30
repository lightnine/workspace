import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';
import { Box, useTheme } from '@mui/material';
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
  const muiTheme = useTheme();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // 配置快捷键 Ctrl+S / Cmd+S 保存
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (activeTabId) {
        saveFile(activeTabId).catch(console.error);
      }
    });

    // 定义自定义主题
    const editorTheme = themeMode === 'dark' ? 'custom-dark' : 'custom-light';
    
    monaco.editor.defineTheme('custom-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': muiTheme.palette.background.paper,
        'editor.foreground': muiTheme.palette.text.primary,
        'editorLineNumber.foreground': muiTheme.palette.text.secondary,
        'editor.selectionBackground': muiTheme.palette.action.selected,
        'editor.lineHighlightBackground': muiTheme.palette.action.hover,
        'editorCursor.foreground': muiTheme.palette.primary.main,
        'editorWhitespace.foreground': muiTheme.palette.divider,
        'editorIndentGuide.background': muiTheme.palette.divider,
        'editorIndentGuide.activeBackground': muiTheme.palette.text.secondary,
      }
    });

    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': muiTheme.palette.background.paper,
        'editor.foreground': muiTheme.palette.text.primary,
        'editorLineNumber.foreground': muiTheme.palette.text.secondary,
        'editor.selectionBackground': muiTheme.palette.action.selected,
        'editor.lineHighlightBackground': muiTheme.palette.action.hover,
        'editorCursor.foreground': muiTheme.palette.primary.main,
        'editorWhitespace.foreground': muiTheme.palette.divider,
        'editorIndentGuide.background': muiTheme.palette.divider,
        'editorIndentGuide.activeBackground': muiTheme.palette.text.secondary,
      }
    });

    // 应用主题
    monaco.editor.setTheme(editorTheme);
  };

  // 当主题改变时更新编辑器主题
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
      <Box
        sx={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.secondary'
        }}
      >
          {t('workspace.selectFile')}
      </Box>
    );
  }

  const editorTheme = themeMode === 'dark' ? 'custom-dark' : 'custom-light';
  const isNotebook = activeTab.fileName.toLowerCase().endsWith('.ipynb');

  return (
    <Box sx={{ height, width: '100%', bgcolor: 'background.paper' }}>
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
    </Box>
  );
};

