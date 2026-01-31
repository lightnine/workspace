import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Folder, 
  Plus, 
  FolderPlus, 
  FileCode,
  FileText,
  Database,
  File
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
import { Separator } from '@/components/ui/separator';
import { Explorer } from '../../components/Explorer/Explorer';
import { TabView } from '../../components/TabView/TabView';
import { MonacoEditor } from '../../components/Editor/MonacoEditor';
import { useWorkspace, CreateFileType, FILE_TYPE_CONFIG } from '../../context/WorkspaceContext';

export const Workspace: React.FC = () => {
  const { t } = useTranslation();
  const { createDialog, openCreateDialog, closeCreateDialog, handleCreate: contextHandleCreate } = useWorkspace();

  const [newName, setNewName] = useState('');

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

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Left: File Explorer */}
      <div className="w-[280px] min-w-[280px] hidden sm:flex flex-col border-r border-border bg-background">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-amber-500" />
            <span className="font-semibold text-sm">{t('workspace.fileExplorer')}</span>
          </div>
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
        <ScrollArea className="flex-1">
          <Explorer />
        </ScrollArea>
      </div>

      {/* Right: Editor Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TabView />
        <div className="flex-1 overflow-hidden min-h-0">
          <MonacoEditor height="100%" />
        </div>
      </div>

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
