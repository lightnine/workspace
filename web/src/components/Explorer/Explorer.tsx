import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Folder,
  FolderOpen,
  File,
  MoreVertical,
  FolderPlus,
  FilePlus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  FileCode,
  FileJson,
  FileText,
  Database,
  Book,
  Move,
  Copy,
  Home,
  Loader2,
} from 'lucide-react';
import { FileItem } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useEditor } from '../../context/EditorContext';
import { useApp } from '../../context/AppContext';
import { createFile, createDirectory, updateObject, deleteObject, moveObject, copyObject } from '../../services/api';

// 获取文件图标和颜色
const getFileIcon = (fileName: string, isDarkMode: boolean) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  const iconConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    'py': { 
      icon: <FileCode className="w-4 h-4" />, 
      color: '#3776AB' 
    },
    'ipynb': { 
      icon: <Book className="w-4 h-4" />, 
      color: '#F37626' 
    },
    'js': { 
      icon: <FileCode className="w-4 h-4" />, 
      color: '#F7DF1E' 
    },
    'ts': { 
      icon: <FileCode className="w-4 h-4" />, 
      color: '#3178C6' 
    },
    'tsx': { 
      icon: <FileCode className="w-4 h-4" />, 
      color: '#3178C6' 
    },
    'jsx': { 
      icon: <FileCode className="w-4 h-4" />, 
      color: '#61DAFB' 
    },
    'json': { 
      icon: <FileJson className="w-4 h-4" />, 
      color: isDarkMode ? '#A1A1AA' : '#5B5B5B' 
    },
    'md': { 
      icon: <FileText className="w-4 h-4" />, 
      color: '#083FA1' 
    },
    'sql': { 
      icon: <Database className="w-4 h-4" />, 
      color: '#E38C00' 
    }
  };
  
  return iconConfig[ext || ''] || { 
    icon: <File className="w-4 h-4" />, 
    color: isDarkMode ? '#A1A1AA' : '#71717A' 
  };
};

// Toast notification component
const Toast: React.FC<{
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info';
  onClose: () => void;
}> = ({ open, message, severity, onClose }) => {
  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [open, onClose]);

  if (!open) return null;

  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
  }[severity];

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4">
      <div className={cn('px-4 py-2 rounded-lg text-white shadow-lg', bgColor)}>
        {message}
      </div>
    </div>
  );
};

export const Explorer: React.FC = () => {
  const { t } = useTranslation();
  const { theme: themeMode } = useApp();
  const isDarkMode = themeMode === 'dark';
  
  const { fileTree, expandedNodes, setExpandedNodes, selectedNodeId, setSelectedNodeId, refreshFileTree, loading } = useWorkspace();
  const { openFile, closeTab, tabs } = useEditor();
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; item: FileItem | null }>({ open: false, item: null });
  const [newName, setNewName] = useState('');
  const [createDialog, setCreateDialog] = useState<{ open: boolean; type: 'file' | 'directory' | null; parentId?: number }>({ open: false, type: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; item: FileItem | null }>({ open: false, item: null });
  const [moveDialog, setMoveDialog] = useState<{ open: boolean; item: FileItem | null; mode: 'move' | 'copy' }>({ open: false, item: null, mode: 'move' });
  const [selectedTargetFolder, setSelectedTargetFolder] = useState<number | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });
  const [operationLoading, setOperationLoading] = useState(false);
  
  // 拖拽状态
  const [draggedItem, setDraggedItem] = useState<FileItem | null>(null);
  const [dragOverItem, setDragOverItem] = useState<number | null>(null);

  const toggleExpand = (itemId: number) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedNodes(newExpanded);
  };

  const handleItemClick = async (item: FileItem) => {
    setSelectedNodeId(item.id);
    if (item.type === 'directory') {
      toggleExpand(item.id);
    } else {
      try {
        await openFile(item);
      } catch (error) {
        console.error('打开文件失败:', error);
      }
    }
  };

  const handleCreate = async (type: 'file' | 'directory', name: string, parentId?: number) => {
    try {
      if (type === 'directory') {
        await createDirectory(name, parentId);
      } else {
        await createFile(name, '', parentId);
      }
      await refreshFileTree();
      setCreateDialog({ open: false, type: null });
      setNewName('');
    } catch (error) {
      console.error('创建失败:', error);
      throw error;
    }
  };

  const handleRename = async () => {
    if (!renameDialog.item || !newName.trim()) return;
    setOperationLoading(true);
    try {
      await updateObject(renameDialog.item.id, { name: newName });
      await refreshFileTree();
      setRenameDialog({ open: false, item: null });
      setNewName('');
      setSnackbar({ open: true, message: t('explorer.renameSuccess'), severity: 'success' });
    } catch (error) {
      console.error('重命名失败:', error);
      setSnackbar({ open: true, message: t('explorer.renameFailed'), severity: 'error' });
    } finally {
      setOperationLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.item) return;
    setOperationLoading(true);
    try {
      const itemToDelete = deleteDialog.item;
      
      // 关闭已打开的相关标签页
      const tabsToClose = tabs.filter(tab => 
        tab.filePath.startsWith(itemToDelete.path) || tab.fileId === itemToDelete.id
      );
      tabsToClose.forEach(tab => closeTab(tab.id));
      
      await deleteObject(itemToDelete.id);
      await refreshFileTree();
      setDeleteDialog({ open: false, item: null });
      setSnackbar({ open: true, message: t('explorer.deleteSuccess'), severity: 'success' });
    } catch (error) {
      console.error('删除失败:', error);
      setSnackbar({ open: true, message: t('explorer.deleteFailed'), severity: 'error' });
    } finally {
      setOperationLoading(false);
    }
  };

  const handleMove = async () => {
    if (!moveDialog.item) return;
    setOperationLoading(true);
    try {
      if (moveDialog.mode === 'move') {
        await moveObject(moveDialog.item.id, selectedTargetFolder ?? undefined);
        setSnackbar({ open: true, message: t('explorer.moveSuccess'), severity: 'success' });
      } else {
        await copyObject(moveDialog.item.id, selectedTargetFolder ?? undefined);
        setSnackbar({ open: true, message: t('explorer.copySuccess'), severity: 'success' });
      }
      await refreshFileTree();
      setMoveDialog({ open: false, item: null, mode: 'move' });
      setSelectedTargetFolder(null);
      setExpandedFolders(new Set());
    } catch (error) {
      console.error(`${moveDialog.mode === 'move' ? '移动' : '复制'}失败:`, error);
      setSnackbar({ 
        open: true, 
        message: moveDialog.mode === 'move' ? t('explorer.moveFailed') : t('explorer.copyFailed'), 
        severity: 'error' 
      });
    } finally {
      setOperationLoading(false);
    }
  };

  // 拖拽处理
  const handleDragStart = useCallback((e: React.DragEvent, item: FileItem) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id.toString());
    setDraggedItem(item);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, item: FileItem) => {
    e.preventDefault();
    if (item.type === 'directory' && draggedItem && draggedItem.id !== item.id) {
      e.dataTransfer.dropEffect = 'move';
      setDragOverItem(item.id);
    }
  }, [draggedItem]);

  const handleDragLeave = useCallback(() => {
    setDragOverItem(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetFolder: FileItem) => {
    e.preventDefault();
    setDragOverItem(null);
    
    if (!draggedItem || targetFolder.type !== 'directory' || draggedItem.id === targetFolder.id) {
      setDraggedItem(null);
      return;
    }

    // 防止将文件夹拖到自己的子文件夹中
    if (draggedItem.type === 'directory') {
      const isChildFolder = (parent: FileItem, childId: number): boolean => {
        if (!parent.children) return false;
        for (const child of parent.children) {
          if (child.id === childId) return true;
          if (child.type === 'directory' && isChildFolder(child, childId)) return true;
        }
        return false;
      };
      if (isChildFolder(draggedItem, targetFolder.id)) {
        setSnackbar({ open: true, message: t('explorer.cannotMoveToChild'), severity: 'error' });
        setDraggedItem(null);
        return;
      }
    }

    setOperationLoading(true);
    try {
      await moveObject(draggedItem.id, targetFolder.id);
      await refreshFileTree();
      setSnackbar({ open: true, message: t('explorer.moveSuccess'), severity: 'success' });
    } catch (error) {
      console.error('移动失败:', error);
      setSnackbar({ open: true, message: t('explorer.moveFailed'), severity: 'error' });
    } finally {
      setDraggedItem(null);
      setOperationLoading(false);
    }
  }, [draggedItem, refreshFileTree, t]);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDragOverItem(null);
  }, []);

  // 拖拽到根目录
  const handleDropToRoot = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedItem) return;

    setOperationLoading(true);
    try {
      await moveObject(draggedItem.id, undefined);
      await refreshFileTree();
      setSnackbar({ open: true, message: t('explorer.moveSuccess'), severity: 'success' });
    } catch (error) {
      console.error('移动失败:', error);
      setSnackbar({ open: true, message: t('explorer.moveFailed'), severity: 'error' });
    } finally {
      setDraggedItem(null);
      setOperationLoading(false);
    }
  }, [draggedItem, refreshFileTree, t]);

  // 渲染目录选择树
  const renderFolderTree = (items: FileItem[], level: number = 0): React.ReactNode => {
    return items
      .filter(item => item.type === 'directory')
      .map(item => {
        const isExpanded = expandedFolders.has(item.id);
        const isSelected = selectedTargetFolder === item.id;
        const isDisabled = moveDialog.item?.id === item.id;

        return (
          <div key={item.id}>
            <button
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                'hover:bg-accent',
                isSelected && 'bg-primary/10',
                isDisabled && 'opacity-50 cursor-not-allowed'
              )}
              style={{ paddingLeft: `${level * 16 + 8}px` }}
              disabled={isDisabled}
              onClick={() => {
                setSelectedTargetFolder(item.id);
                if (item.children?.some(c => c.type === 'directory')) {
                  const newExpanded = new Set(expandedFolders);
                  if (newExpanded.has(item.id)) {
                    newExpanded.delete(item.id);
                  } else {
                    newExpanded.add(item.id);
                  }
                  setExpandedFolders(newExpanded);
                }
              }}
            >
              {item.children?.some(c => c.type === 'directory') && (
                isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
              )}
              <Folder className="w-4 h-4 text-amber-500" />
              <span className="truncate">{item.name}</span>
            </button>
            {isExpanded && item.children && (
              <div>{renderFolderTree(item.children, level + 1)}</div>
            )}
          </div>
        );
      });
  };

  const renderFileItem = (item: FileItem, level: number = 0): React.ReactNode => {
    const isExpanded = expandedNodes.has(item.id);
    const isSelected = selectedNodeId === item.id;
    const isFolder = item.type === 'directory';
    const fileConfig = !isFolder ? getFileIcon(item.name, isDarkMode) : null;
    const isDragOver = dragOverItem === item.id;
    const isDragging = draggedItem?.id === item.id;

    const handleContextAction = (action: string) => {
      switch (action) {
        case 'newFile':
          setCreateDialog({ open: true, type: 'file', parentId: item.id });
          setNewName('');
          break;
        case 'newFolder':
          setCreateDialog({ open: true, type: 'directory', parentId: item.id });
          setNewName('');
          break;
        case 'rename':
          setRenameDialog({ open: true, item });
          setNewName(item.name);
          break;
        case 'move':
          setMoveDialog({ open: true, item, mode: 'move' });
          setSelectedTargetFolder(null);
          setExpandedFolders(new Set());
          break;
        case 'copy':
          setMoveDialog({ open: true, item, mode: 'copy' });
          setSelectedTargetFolder(null);
          setExpandedFolders(new Set());
          break;
        case 'delete':
          setDeleteDialog({ open: true, item });
          break;
      }
    };

    return (
      <div key={item.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              className={cn(
                'w-full group flex items-center gap-1 px-1 py-1 rounded-md text-[13px] transition-all',
                'hover:bg-accent/50',
                isSelected && 'bg-primary/10 hover:bg-primary/15',
                isDragOver && 'bg-primary/20 border-2 border-dashed border-primary',
                isDragging && 'opacity-50'
              )}
              style={{ paddingLeft: `${level * 12 + 4}px` }}
              onClick={() => handleItemClick(item)}
              draggable
              onDragStart={(e) => handleDragStart(e, item)}
              onDragOver={(e) => handleDragOver(e, item)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, item)}
              onDragEnd={handleDragEnd}
            >
              {/* 展开/折叠图标 */}
              {isFolder ? (
                <span className="w-4 h-4 flex items-center justify-center text-muted-foreground">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>
              ) : (
                <span className="w-4" />
              )}
              
              {/* 文件/文件夹图标 */}
              <span className="flex-shrink-0">
                {isFolder ? (
                  isExpanded ? (
                    <FolderOpen className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Folder className="w-4 h-4 text-amber-500" />
                  )
                ) : (
                  <span style={{ color: fileConfig?.color }}>
                    {fileConfig?.icon}
                  </span>
                )}
              </span>
              
              {/* 文件名 */}
              <span className={cn(
                'flex-1 truncate text-left',
                isSelected && 'font-medium'
              )}>
                {item.name}
              </span>
              
              {/* 更多操作按钮 */}
              <button
                className={cn(
                  'opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent',
                  'transition-opacity'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            {isFolder && (
              <>
                <ContextMenuItem onClick={() => handleContextAction('newFile')}>
                  <FilePlus className="w-4 h-4 mr-2" />
                  {t('explorer.newFile')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleContextAction('newFolder')}>
                  <FolderPlus className="w-4 h-4 mr-2" />
                  {t('explorer.newFolder')}
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
            <ContextMenuItem onClick={() => handleContextAction('rename')}>
              <Pencil className="w-4 h-4 mr-2" />
              {t('explorer.rename')}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleContextAction('move')}>
              <Move className="w-4 h-4 mr-2" />
              {t('explorer.move')}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleContextAction('copy')}>
              <Copy className="w-4 h-4 mr-2" />
              {t('explorer.copy')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem 
              onClick={() => handleContextAction('delete')}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('explorer.delete')}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        
        {/* 子项目 */}
        {isFolder && isExpanded && item.children && (
          <div>
            {item.children.map(child => renderFileItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-sm text-muted-foreground">
          {t('common.loading')}
        </span>
      </div>
    );
  }

  return (
    <div 
      className="h-full overflow-auto py-1"
      onDragOver={(e) => {
        e.preventDefault();
        if (draggedItem) {
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={handleDropToRoot}
    >
      {fileTree.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground">
          <span className="text-sm">{t('common.noData')}</span>
        </div>
      ) : (
        <div className="px-1">
          {fileTree.map(item => renderFileItem(item))}
        </div>
      )}

      {/* 重命名对话框 */}
      <Dialog open={renameDialog.open} onOpenChange={(open) => !open && setRenameDialog({ open: false, item: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('explorer.rename')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              placeholder={t('common.newName')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  handleRename();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog({ open: false, item: null })}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleRename} disabled={operationLoading}>
              {operationLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 创建对话框 */}
      <Dialog open={createDialog.open} onOpenChange={(open) => !open && setCreateDialog({ open: false, type: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {createDialog.type === 'directory' ? t('explorer.newFolder') : t('explorer.newFile')}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              placeholder={t('common.name')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  handleCreate(createDialog.type!, newName, createDialog.parentId);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog({ open: false, type: null })}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={async () => {
                if (newName.trim()) {
                  try {
                    await handleCreate(createDialog.type!, newName, createDialog.parentId);
                  } catch (error) {
                    // 错误已在 handleCreate 中处理
                  }
                }
              }}
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, item: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('explorer.confirmDelete')}</DialogTitle>
            <DialogDescription>
              {deleteDialog.item?.type === 'directory' 
                ? t('explorer.deleteDirectoryWarning', { name: deleteDialog.item?.name })
                : t('explorer.deleteFileWarning', { name: deleteDialog.item?.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeleteDialog({ open: false, item: null })}
              disabled={operationLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDelete}
              disabled={operationLoading}
            >
              {operationLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 移动/复制对话框 */}
      <Dialog open={moveDialog.open} onOpenChange={(open) => !open && setMoveDialog({ open: false, item: null, mode: 'move' })}>
        <DialogContent className="max-h-[70vh]">
          <DialogHeader>
            <DialogTitle>
              {moveDialog.mode === 'move' ? t('explorer.moveTo') : t('explorer.copyTo')}
            </DialogTitle>
            <DialogDescription>{moveDialog.item?.name}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px] pr-4">
            {/* 根目录选项 */}
            <button
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                'hover:bg-accent',
                selectedTargetFolder === null && 'bg-primary/10'
              )}
              onClick={() => setSelectedTargetFolder(null)}
            >
              <Home className="w-4 h-4 text-primary" />
              <span className="font-medium">{t('explorer.rootDirectory')}</span>
            </button>
            <div className="my-2 h-px bg-border" />
            {renderFolderTree(fileTree)}
          </ScrollArea>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setMoveDialog({ open: false, item: null, mode: 'move' })}
              disabled={operationLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleMove} disabled={operationLoading}>
              {operationLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {moveDialog.mode === 'move' ? t('explorer.move') : t('explorer.copy')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 操作反馈 Toast */}
      <Toast
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      />
    </div>
  );
};
