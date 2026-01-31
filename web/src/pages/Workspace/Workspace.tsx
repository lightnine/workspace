import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  Folder, 
  Plus, 
  FolderPlus, 
  FileCode,
  FileText,
  Database,
  File,
  History,
  ChevronDown,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { UserDirectoryTree } from '../../components/Explorer/UserDirectoryTree';
import { TabView } from '../../components/TabView/TabView';
import { MonacoEditor } from '../../components/Editor/MonacoEditor';
import { FileDetailsPanel } from '../../components/FileDetails/FileDetailsPanel';
import { useWorkspace, CreateFileType, FILE_TYPE_CONFIG } from '../../context/WorkspaceContext';
import { useEditor } from '../../context/EditorContext';
import { useApp } from '../../context/AppContext';
import { FileItem } from '../../types';
import { getObjectById } from '../../services/api';

export const Workspace: React.FC = () => {
  const { t } = useTranslation();
  const { fileId: pathFileId } = useParams<{ fileId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { 
    createDialog, 
    openCreateDialog, 
    closeCreateDialog, 
    handleCreate: contextHandleCreate,
    refreshFileTree
  } = useWorkspace();
  const { activeTab, openFile, tabs } = useEditor();
  const { user: currentUser } = useApp();

  const [newName, setNewName] = useState('');
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [currentFileDetails, setCurrentFileDetails] = useState<FileItem | null>(null);
  const [urlFileLoading, setUrlFileLoading] = useState(false);

  // Determine if we're in notebook or file mode based on URL path
  const isNotebookRoute = location.pathname.startsWith('/editor/notebooks/');
  const isFileRoute = location.pathname.startsWith('/editor/files/');

  // Get fileId from path params or query params
  const queryParams = new URLSearchParams(location.search);
  const queryFileId = queryParams.get('fileId');
  const fileId = pathFileId || queryFileId;

  // Open file from URL parameter when component mounts or fileId changes
  useEffect(() => {
    const openFileFromUrl = async () => {
      if (!fileId || urlFileLoading) return;
      
      const numericFileId = parseInt(fileId, 10);
      if (isNaN(numericFileId)) return;
      
      // Check if file is already open
      const existingTab = tabs.find(tab => tab.fileId === numericFileId);
      if (existingTab) return;
      
      setUrlFileLoading(true);
      try {
        const file = await getObjectById(numericFileId);
        
        // If accessed via query param (?fileId=xxx), redirect to proper URL format
        if (queryFileId && !pathFileId) {
          const targetUrl = file.type === 'notebook' 
            ? `/editor/notebooks/${numericFileId}` 
            : `/editor/files/${numericFileId}`;
          navigate(targetUrl, { replace: true });
          await openFile(file);
          return;
        }
        
        // Validate that the URL matches the file type
        if (isNotebookRoute && file.type !== 'notebook') {
          // Redirect to correct URL
          navigate(`/editor/files/${fileId}`, { replace: true });
          return;
        }
        if (isFileRoute && file.type === 'notebook') {
          // Redirect to correct URL
          navigate(`/editor/notebooks/${fileId}`, { replace: true });
          return;
        }
        
        await openFile(file);
      } catch (error) {
        console.error('Failed to open file from URL:', error);
        // Redirect to workspace on error
        navigate('/workspace', { replace: true });
      } finally {
        setUrlFileLoading(false);
      }
    };
    
    openFileFromUrl();
  }, [fileId, queryFileId, pathFileId]);

  // Load file details when active tab changes
  useEffect(() => {
    const loadFileDetails = async () => {
      if (activeTab?.fileId) {
        try {
          const fileData = await getObjectById(activeTab.fileId);
          setCurrentFileDetails(fileData);
        } catch (error) {
          console.error('Failed to load file details:', error);
          setCurrentFileDetails(null);
        }
      } else {
        setCurrentFileDetails(null);
      }
    };
    loadFileDetails();
  }, [activeTab?.fileId]);

  const handleCreateClick = (type: CreateFileType) => {
    openCreateDialog(type);
    setNewName('');
  };

  const getFullFileName = () => {
    if (!createDialog.type || createDialog.type === 'directory') return newName;
    const config = FILE_TYPE_CONFIG[createDialog.type];
    if (!config.extension || newName.endsWith(config.extension)) return newName;
    return newName + config.extension;
  };

  const getDialogTitle = () => {
    switch (createDialog.type) {
      case 'notebook': return t('workspace.newNotebook');
      case 'python': return t('workspace.newPython');
      case 'sql': return t('workspace.newSql');
      case 'markdown': return t('workspace.newMarkdown');
      case 'directory': return t('common.newFolder');
      default: return t('common.newFile');
    }
  };

  const getFileNamePlaceholder = () => {
    switch (createDialog.type) {
      case 'notebook': return 'Untitled.ipynb';
      case 'python': return 'script.py';
      case 'sql': return 'query.sql';
      case 'markdown': return 'README.md';
      case 'directory': return 'new_folder';
      default: return 'file.txt';
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !createDialog.type) return;

    await contextHandleCreate(newName);
    setNewName('');
  };

  const handleCloseDialog = () => {
    closeCreateDialog();
    setNewName('');
  };

  const handleSelectUserDirectory = (userEmail: string) => {
    // In the future, this could filter the file tree to show only that user's files
    console.log('Selected user directory:', userEmail);
  };

  const handleToggleDetailsPanel = () => {
    setShowDetailsPanel(!showDetailsPanel);
  };

  const handleVersionRestore = async () => {
    // Refresh the file content after restore
    await refreshFileTree();
    // Reload current file details
    if (activeTab?.fileId) {
      const fileData = await getObjectById(activeTab.fileId);
      setCurrentFileDetails(fileData);
    }
  };

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Left: File Explorer with User Directory Tree */}
      <div className="w-[280px] min-w-[280px] hidden sm:flex flex-col border-r border-border bg-background">
        {/* Workspace header with dropdown */}
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 px-2 gap-1 font-semibold text-sm">
                <Folder className="w-4 h-4 text-amber-500" />
                <span>Workspace</span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => handleCreateClick('notebook')}>
                <FileCode className="w-4 h-4 mr-2 text-orange-500" />
                {t('workspace.newNotebook')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateClick('python')}>
                <FileText className="w-4 h-4 mr-2 text-blue-500" />
                {t('workspace.newPython')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateClick('sql')}>
                <Database className="w-4 h-4 mr-2 text-amber-600" />
                {t('workspace.newSql')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleCreateClick('directory')}>
                <FolderPlus className="w-4 h-4 mr-2 text-amber-500" />
                {t('common.newFolder')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <div className="flex items-center gap-1">
            {/* Toggle Details Panel */}
            {activeTab && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn(
                      "h-7 w-7",
                      showDetailsPanel && "bg-primary/10"
                    )}
                    onClick={handleToggleDetailsPanel}
                  >
                    {showDetailsPanel ? (
                      <PanelRightClose className="h-4 w-4" />
                    ) : (
                      <PanelRightOpen className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {showDetailsPanel ? t('common.close') : t('fileDetails.title')}
                </TooltipContent>
              </Tooltip>
            )}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" className="h-7 w-7">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>{t('common.newFile')}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => handleCreateClick('notebook')}>
                  <FileCode className="w-4 h-4 mr-2 text-orange-500" />
                  {t('workspace.newNotebook')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCreateClick('python')}>
                  <FileText className="w-4 h-4 mr-2 text-blue-500" />
                  {t('workspace.newPython')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCreateClick('sql')}>
                  <Database className="w-4 h-4 mr-2 text-amber-600" />
                  {t('workspace.newSql')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCreateClick('markdown')}>
                  <FileText className="w-4 h-4 mr-2 text-purple-500" />
                  {t('workspace.newMarkdown')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleCreateClick('file')}>
                  <File className="w-4 h-4 mr-2" />
                  {t('common.newFile')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCreateClick('directory')}>
                  <FolderPlus className="w-4 h-4 mr-2 text-amber-500" />
                  {t('common.newFolder')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <ScrollArea className="flex-1">
          {/* User Directory Tree with File Explorer (like Databricks) */}
          <UserDirectoryTree onSelectUserDirectory={handleSelectUserDirectory} />
        </ScrollArea>
      </div>

      {/* Center: Editor Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TabView />
        <div className="flex-1 overflow-hidden min-h-0">
          <MonacoEditor height="100%" />
        </div>
      </div>

      {/* Right: File Details Panel */}
      {showDetailsPanel && activeTab && (
        <FileDetailsPanel
          file={currentFileDetails}
          onClose={() => setShowDetailsPanel(false)}
          onVersionRestore={handleVersionRestore}
        />
      )}

      {/* Create Dialog */}
      <Dialog open={createDialog.open} onOpenChange={handleCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('common.name')}</Label>
              <Input
                id="name"
                placeholder={getFileNamePlaceholder()}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) {
                    handleCreate();
                  }
                }}
                autoFocus
              />
              {createDialog.type && createDialog.type !== 'directory' && createDialog.type !== 'file' && (
                <p className="text-sm text-muted-foreground">
                  {t('workspace.fileWillBe', { name: getFullFileName() || getFileNamePlaceholder() })}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
