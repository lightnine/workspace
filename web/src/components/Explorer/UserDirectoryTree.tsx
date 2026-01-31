import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft,
  ArrowLeft,
  ArrowUpDown,
  Folder,
  FolderOpen,
  User as UserIcon,
  File,
  FileCode,
  FileJson,
  FileText,
  Database,
  Book,
  MoreVertical,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  Move,
  Copy,
  Home,
  Loader2,
  GitBranch,
  Plus,
  ExternalLink,
  Link,
  Download,
  Share2,
  Star,
  Upload,
  FileArchive,
  LayoutDashboard,
  Sparkles,
  Workflow,
  Bell,
  FlaskConical,
  FileDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { UserResponse, FileItem } from '../../types';
import { getUsersByAppId, createFile, createDirectory, updateObject, deleteObject, moveObject, copyObject, downloadFile, getFileUrl } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useEditor } from '../../context/EditorContext';

interface UserDirectoryTreeProps {
  onSelectUserDirectory?: (userEmail: string) => void;
}

// 获取文件图标和颜色
const getFileIcon = (fileName: string, isDarkMode: boolean) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  const iconConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    'py': { icon: <FileCode className="w-4 h-4" />, color: '#3776AB' },
    'ipynb': { icon: <Book className="w-4 h-4" />, color: '#F37626' },
    'js': { icon: <FileCode className="w-4 h-4" />, color: '#F7DF1E' },
    'ts': { icon: <FileCode className="w-4 h-4" />, color: '#3178C6' },
    'tsx': { icon: <FileCode className="w-4 h-4" />, color: '#3178C6' },
    'jsx': { icon: <FileCode className="w-4 h-4" />, color: '#61DAFB' },
    'json': { icon: <FileJson className="w-4 h-4" />, color: isDarkMode ? '#A1A1AA' : '#5B5B5B' },
    'md': { icon: <FileText className="w-4 h-4" />, color: '#083FA1' },
    'sql': { icon: <Database className="w-4 h-4" />, color: '#E38C00' }
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

export const UserDirectoryTree: React.FC<UserDirectoryTreeProps> = ({
  onSelectUserDirectory,
}) => {
  const { t } = useTranslation();
  const { theme: themeMode, user: currentUser } = useApp();
  const { 
    selectedUserEmail, 
    setSelectedUserEmail, 
    fileTree, 
    expandedNodes, 
    setExpandedNodes,
    selectedNodeId,
    setSelectedNodeId,
    refreshFileTree,
    loading: fileTreeLoading
  } = useWorkspace();
  const { openFile, closeTab, tabs } = useEditor();
  const isDarkMode = themeMode === 'dark';
  
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [isUsersExpanded, setIsUsersExpanded] = useState(true);
  // New state for drill-down view
  const [currentView, setCurrentView] = useState<'users' | 'userFiles'>('users');
  const [selectedUser, setSelectedUser] = useState<UserResponse | null>(null);
  
  // Folder navigation state (for drill-down into subdirectories)
  const [currentFolder, setCurrentFolder] = useState<FileItem | null>(null);
  const [folderPath, setFolderPath] = useState<FileItem[]>([]);
  
  // Sort state
  type SortOption = 'dateCreated' | 'name' | 'type';
  const [sortBy, setSortBy] = useState<SortOption>('name');

  // Dialog states
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; item: FileItem | null }>({ open: false, item: null });
  const [newName, setNewName] = useState('');
  const [createDialog, setCreateDialog] = useState<{ 
    open: boolean; 
    type: 'file' | 'directory' | 'notebook' | 'query' | null; 
    parentId?: number 
  }>({ open: false, type: null });
  // Git folder dialog state
  const [gitFolderDialog, setGitFolderDialog] = useState<{
    open: boolean;
    parentId?: number;
  }>({ open: false });
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [gitProvider, setGitProvider] = useState('');
  const [gitFolderName, setGitFolderName] = useState('');
  const [sparseCheckoutMode, setSparseCheckoutMode] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; item: FileItem | null }>({ open: false, item: null });
  const [moveDialog, setMoveDialog] = useState<{ open: boolean; item: FileItem | null; mode: 'move' | 'copy' }>({ open: false, item: null, mode: 'move' });
  const [selectedTargetFolder, setSelectedTargetFolder] = useState<number | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });
  const [operationLoading, setOperationLoading] = useState(false);
  
  // Pending dialog state - 用于延迟打开对话框，避免 DropdownMenu 和 Dialog 焦点冲突
  const [pendingDialog, setPendingDialog] = useState<{
    type: 'create' | 'rename' | 'delete' | 'move' | 'gitFolder' | null;
    data?: {
      createType?: 'file' | 'directory' | 'notebook' | 'query';
      parentId?: number;
      item?: FileItem;
      mode?: 'move' | 'copy';
    };
  }>({ type: null });

  // 处理 pending dialog - 延迟打开对话框以避免焦点冲突
  useEffect(() => {
    if (pendingDialog.type) {
      // 使用 setTimeout 确保 DropdownMenu 完全关闭后再打开 Dialog
      const timer = setTimeout(() => {
        switch (pendingDialog.type) {
          case 'create':
            setCreateDialog({ 
              open: true, 
              type: pendingDialog.data?.createType || null, 
              parentId: pendingDialog.data?.parentId 
            });
            setNewName('');
            break;
          case 'rename':
            if (pendingDialog.data?.item) {
              setRenameDialog({ open: true, item: pendingDialog.data.item });
              setNewName(pendingDialog.data.item.name);
            }
            break;
          case 'delete':
            if (pendingDialog.data?.item) {
              setDeleteDialog({ open: true, item: pendingDialog.data.item });
            }
            break;
          case 'move':
            if (pendingDialog.data?.item) {
              setMoveDialog({ 
                open: true, 
                item: pendingDialog.data.item, 
                mode: pendingDialog.data.mode || 'move' 
              });
              setSelectedTargetFolder(null);
              setExpandedFolders(new Set());
            }
            break;
          case 'gitFolder':
            setGitFolderDialog({ open: true, parentId: pendingDialog.data?.parentId });
            setGitRepoUrl('');
            setGitProvider('');
            setGitFolderName('');
            setSparseCheckoutMode(false);
            break;
        }
        setPendingDialog({ type: null });
      }, 100); // 100ms 延迟确保 DropdownMenu 动画完成
      
      return () => clearTimeout(timer);
    }
  }, [pendingDialog]);

  // 辅助函数：安全地打开对话框（从 DropdownMenu 调用时使用）
  const openDialogSafely = useCallback((
    dialogType: 'create' | 'rename' | 'delete' | 'move' | 'gitFolder',
    data?: {
      createType?: 'file' | 'directory' | 'notebook' | 'query';
      parentId?: number;
      item?: FileItem;
      mode?: 'move' | 'copy';
    }
  ) => {
    setPendingDialog({ type: dialogType, data });
  }, []);

  // 拖拽状态
  const [draggedItem, setDraggedItem] = useState<FileItem | null>(null);
  const [dragOverItem, setDragOverItem] = useState<number | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  // Expand current user's directory by default
  useEffect(() => {
    if (currentUser?.email && !expandedUsers.has(currentUser.email)) {
      setExpandedUsers(prev => new Set([...prev, currentUser.email]));
      setSelectedUserEmail(currentUser.email);
    }
  }, [currentUser?.email]);

  // Sync currentFolder with updated fileTree after refresh
  useEffect(() => {
    if (currentFolder && fileTree.length > 0) {
      // Find the updated folder in the new fileTree
      const findFolder = (items: FileItem[], targetId: number): FileItem | null => {
        for (const item of items) {
          if (item.id === targetId) return item;
          if (item.children) {
            const found = findFolder(item.children, targetId);
            if (found) return found;
          }
        }
        return null;
      };
      
      const updatedFolder = findFolder(fileTree, currentFolder.id);
      if (updatedFolder) {
        setCurrentFolder(updatedFolder);
        // Also update the folderPath with fresh data
        setFolderPath(prev => 
          prev.map(f => {
            const updated = findFolder(fileTree, f.id);
            return updated || f;
          })
        );
      }
    }
  }, [fileTree]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const userList = await getUsersByAppId();
      setUsers(userList);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserExpand = (email: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(email)) {
      newExpanded.delete(email);
    } else {
      newExpanded.add(email);
    }
    setExpandedUsers(newExpanded);
  };

  const handleUserClick = (user: UserResponse) => {
    // Drill down to user's files view (Databricks style)
    setSelectedUser(user);
    setSelectedUserEmail(user.email);
    setCurrentView('userFiles');
    // Reset folder navigation when selecting a user
    setCurrentFolder(null);
    setFolderPath([]);
    onSelectUserDirectory?.(user.email);
  };

  const handleBackToUsers = () => {
    // If we're in a subfolder, go back one level
    if (folderPath.length > 0) {
      const newPath = [...folderPath];
      newPath.pop();
      setFolderPath(newPath);
      setCurrentFolder(newPath.length > 0 ? newPath[newPath.length - 1] : null);
    } else {
      // If at root level, go back to users list
      setCurrentView('users');
      setSelectedUser(null);
      setCurrentFolder(null);
      setFolderPath([]);
    }
  };

  // Navigate into a folder
  const handleFolderNavigate = useCallback((folder: FileItem) => {
    // Ensure the folder has a children array (even if empty)
    // This fixes the issue where newly created folders don't have children property
    const folderWithChildren: FileItem = {
      ...folder,
      children: folder.children || []
    };
    setFolderPath(prev => [...prev, folderWithChildren]);
    setCurrentFolder(folderWithChildren);
  }, []);

  // Navigate to a specific folder in the breadcrumb path
  const handleBreadcrumbNavigate = (index: number) => {
    if (index < 0) {
      // Go to root
      setCurrentFolder(null);
      setFolderPath([]);
    } else {
      const newPath = folderPath.slice(0, index + 1);
      setFolderPath(newPath);
      setCurrentFolder(newPath[newPath.length - 1]);
    }
  };

  const toggleExpand = (itemId: number) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedNodes(newExpanded);
  };

  const handleItemClick = useCallback(async (item: FileItem) => {
    setSelectedNodeId(item.id);
    if (item.type === 'directory') {
      // Navigate into the folder instead of expanding
      handleFolderNavigate(item);
    } else {
      try {
        await openFile(item);
      } catch (error) {
        console.error('打开文件失败:', error);
      }
    }
  }, [handleFolderNavigate, openFile, setSelectedNodeId]);

  const handleCreate = async (type: 'file' | 'directory' | 'notebook' | 'query', name: string, parentId?: number) => {
    try {
      setOperationLoading(true);
      if (type === 'directory') {
        await createDirectory(name, parentId);
      } else if (type === 'notebook') {
        // 创建 Notebook 文件
        const notebookName = name.endsWith('.ipynb') ? name : `${name}.ipynb`;
        const emptyNotebook = JSON.stringify({
          cells: [],
          metadata: {
            kernelspec: {
              display_name: 'Python 3',
              language: 'python',
              name: 'python3'
            },
            language_info: {
              name: 'python',
              version: '3.8'
            }
          },
          nbformat: 4,
          nbformat_minor: 4
        }, null, 2);
        await createFile(notebookName, emptyNotebook, parentId);
      } else if (type === 'query') {
        // 创建 SQL Query 文件
        const queryName = name.endsWith('.sql') ? name : `${name}.sql`;
        await createFile(queryName, '-- SQL Query\n', parentId);
      } else {
        await createFile(name, '', parentId);
      }
      
      // 先关闭对话框，清空状态，等待 Dialog 完全关闭后再进行后续操作
      // 这样可以避免 Radix UI Dialog 的焦点管理问题导致页面卡死
      setCreateDialog({ open: false, type: null });
      setNewName('');
      setOperationLoading(false);
      
      // 使用 requestAnimationFrame 确保 Dialog 完全关闭后再更新其他状态
      requestAnimationFrame(() => {
        // 刷新文件树
        refreshFileTree();
        // 创建成功后自动展开父目录
        if (parentId !== undefined) {
          const newExpanded = new Set(expandedNodes);
          newExpanded.add(parentId);
          setExpandedNodes(newExpanded);
        }
        setSnackbar({ open: true, message: t('explorer.createSuccess'), severity: 'success' });
      });
    } catch (error) {
      console.error('创建失败:', error);
      setCreateDialog({ open: false, type: null });
      setNewName('');
      setOperationLoading(false);
      setSnackbar({ open: true, message: t('explorer.createFailed'), severity: 'error' });
    }
  };

  // Handle Git folder creation
  const handleCreateGitFolder = async () => {
    if (!gitFolderName.trim()) return;
    
    try {
      setOperationLoading(true);
      // For now, just create a regular directory with the git folder name
      // TODO: Implement actual git clone functionality with gitRepoUrl and gitProvider
      await createDirectory(gitFolderName, gitFolderDialog.parentId);
      
      // 先关闭对话框，清空状态
      setGitFolderDialog({ open: false });
      setGitRepoUrl('');
      setGitProvider('');
      setGitFolderName('');
      setSparseCheckoutMode(false);
      setOperationLoading(false);
      
      // 使用 requestAnimationFrame 确保 Dialog 完全关闭后再更新其他状态
      requestAnimationFrame(() => {
        refreshFileTree();
        setSnackbar({ open: true, message: t('explorer.createSuccess'), severity: 'success' });
      });
    } catch (error) {
      console.error('创建 Git folder 失败:', error);
      setGitFolderDialog({ open: false });
      setGitRepoUrl('');
      setGitProvider('');
      setGitFolderName('');
      setSparseCheckoutMode(false);
      setOperationLoading(false);
      setSnackbar({ open: true, message: t('explorer.createFailed'), severity: 'error' });
    }
  };

  const handleRename = async () => {
    if (!renameDialog.item || !newName.trim()) return;
    setOperationLoading(true);
    try {
      await updateObject(renameDialog.item.id, { name: newName });
      
      // 先关闭对话框，清空状态
      setRenameDialog({ open: false, item: null });
      setNewName('');
      setOperationLoading(false);
      
      // 使用 requestAnimationFrame 确保 Dialog 完全关闭后再更新其他状态
      requestAnimationFrame(() => {
        refreshFileTree();
        setSnackbar({ open: true, message: t('explorer.renameSuccess'), severity: 'success' });
      });
    } catch (error) {
      console.error('重命名失败:', error);
      setRenameDialog({ open: false, item: null });
      setNewName('');
      setOperationLoading(false);
      setSnackbar({ open: true, message: t('explorer.renameFailed'), severity: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.item) return;
    setOperationLoading(true);
    try {
      const itemToDelete = deleteDialog.item;
      const tabsToClose = tabs.filter(tab => 
        tab.filePath.startsWith(itemToDelete.path) || tab.fileId === itemToDelete.id
      );
      tabsToClose.forEach(tab => closeTab(tab.id));
      
      await deleteObject(itemToDelete.id);
      
      // 先关闭对话框
      setDeleteDialog({ open: false, item: null });
      setOperationLoading(false);
      
      // 使用 requestAnimationFrame 确保 Dialog 完全关闭后再更新其他状态
      requestAnimationFrame(() => {
        refreshFileTree();
        setSnackbar({ open: true, message: t('explorer.deleteSuccess'), severity: 'success' });
      });
    } catch (error) {
      console.error('删除失败:', error);
      setDeleteDialog({ open: false, item: null });
      setOperationLoading(false);
      setSnackbar({ open: true, message: t('explorer.deleteFailed'), severity: 'error' });
    }
  };

  const handleMove = async () => {
    if (!moveDialog.item) return;
    setOperationLoading(true);
    try {
      if (moveDialog.mode === 'move') {
        await moveObject(moveDialog.item.id, selectedTargetFolder ?? undefined);
      } else {
        await copyObject(moveDialog.item.id, selectedTargetFolder ?? undefined);
      }
      
      const successMessage = moveDialog.mode === 'move' ? t('explorer.moveSuccess') : t('explorer.copySuccess');
      
      // 先关闭对话框，清空状态
      setMoveDialog({ open: false, item: null, mode: 'move' });
      setSelectedTargetFolder(null);
      setExpandedFolders(new Set());
      setOperationLoading(false);
      
      // 使用 requestAnimationFrame 确保 Dialog 完全关闭后再更新其他状态
      requestAnimationFrame(() => {
        refreshFileTree();
        setSnackbar({ open: true, message: successMessage, severity: 'success' });
      });
    } catch (error) {
      console.error(`${moveDialog.mode === 'move' ? '移动' : '复制'}失败:`, error);
      const errorMessage = moveDialog.mode === 'move' ? t('explorer.moveFailed') : t('explorer.copyFailed');
      setMoveDialog({ open: false, item: null, mode: 'move' });
      setSelectedTargetFolder(null);
      setExpandedFolders(new Set());
      setOperationLoading(false);
      setSnackbar({ open: true, message: errorMessage, severity: 'error' });
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

    const handleContextAction = async (action: string) => {
      switch (action) {
        case 'newFile':
          // 使用延迟打开对话框，避免 DropdownMenu 焦点冲突
          openDialogSafely('create', { createType: 'file', parentId: item.id });
          break;
        case 'newFolder':
          openDialogSafely('create', { createType: 'directory', parentId: item.id });
          break;
        case 'newGitFolder':
          openDialogSafely('gitFolder', { parentId: item.id });
          break;
        case 'newNotebook':
          openDialogSafely('create', { createType: 'notebook', parentId: item.id });
          break;
        case 'newQuery':
          openDialogSafely('create', { createType: 'query', parentId: item.id });
          break;
        case 'openInNewTab':
          // 在新浏览器标签页中打开文件
          if (!isFolder) {
            const url = getFileUrl(item.id);
            window.open(url, '_blank');
          }
          break;
        case 'copyUrl':
          try {
            const url = getFileUrl(item.id);
            await navigator.clipboard.writeText(url);
            setSnackbar({ open: true, message: t('explorer.copiedToClipboard'), severity: 'success' });
          } catch {
            setSnackbar({ open: true, message: t('explorer.copyFailed'), severity: 'error' });
          }
          break;
        case 'copyFullPath':
          try {
            await navigator.clipboard.writeText(item.full_path);
            setSnackbar({ open: true, message: t('explorer.copiedToClipboard'), severity: 'success' });
          } catch {
            setSnackbar({ open: true, message: t('explorer.copyFailed'), severity: 'error' });
          }
          break;
        case 'rename':
          openDialogSafely('rename', { item });
          break;
        case 'move':
          openDialogSafely('move', { item, mode: 'move' });
          break;
        case 'clone':
          // 克隆功能与复制类似，但在同一位置创建副本
          setOperationLoading(true);
          try {
            await copyObject(item.id, item.parent_id ?? undefined);
            await refreshFileTree();
            setSnackbar({ open: true, message: t('explorer.copySuccess'), severity: 'success' });
          } catch (error) {
            console.error('克隆失败:', error);
            setSnackbar({ open: true, message: t('explorer.copyFailed'), severity: 'error' });
          } finally {
            setOperationLoading(false);
          }
          break;
        case 'download':
          if (!isFolder) {
            try {
              await downloadFile(item.id, item.name);
              setSnackbar({ open: true, message: t('explorer.downloadSuccess'), severity: 'success' });
            } catch (error) {
              console.error('下载失败:', error);
              setSnackbar({ open: true, message: t('explorer.downloadFailed'), severity: 'error' });
            }
          }
          break;
        case 'share':
          // TODO: 实现共享/权限对话框
          setSnackbar({ open: true, message: 'Share feature coming soon', severity: 'info' });
          break;
        case 'favorite':
          // TODO: 实现收藏功能
          setSnackbar({ open: true, message: t('explorer.addToFavoritesSuccess'), severity: 'success' });
          break;
        case 'delete':
          openDialogSafely('delete', { item });
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
              {isFolder ? (
                <span className="w-4 h-4 flex items-center justify-center text-muted-foreground">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>
              ) : (
                <span className="w-4" />
              )}
              
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
              
              <span className={cn(
                'flex-1 truncate text-left',
                isSelected && 'font-medium'
              )}>
                {item.name}
              </span>
              
              {/* 三点菜单按钮 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      'opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent',
                      'transition-opacity focus:opacity-100'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48" align="start">
                  {/* 在新标签页打开（仅文件） */}
                  {!isFolder && (
                    <DropdownMenuItem onClick={() => handleContextAction('openInNewTab')}>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      {t('explorer.openInNewTab')}
                    </DropdownMenuItem>
                  )}
                  
                  {/* 复制 URL/路径 子菜单 */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Link className="w-4 h-4 mr-2" />
                      {t('explorer.copyUrlPath')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-36">
                      <DropdownMenuItem onClick={() => handleContextAction('copyUrl')}>
                        <Link className="w-4 h-4 mr-2" />
                        {t('explorer.copyUrl')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleContextAction('copyFullPath')}>
                        <FileText className="w-4 h-4 mr-2" />
                        {t('explorer.copyFullPath')}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  
                  <DropdownMenuSeparator />
                  
                  {/* 创建子菜单（仅文件夹） */}
                  {isFolder && (
                    <>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Plus className="w-4 h-4 mr-2" />
                          {t('explorer.create')}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-44">
                          <DropdownMenuItem onClick={() => handleContextAction('newFolder')}>
                            <FolderPlus className="w-4 h-4 mr-2" />
                            {t('explorer.newFolder')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleContextAction('newGitFolder')}>
                            <GitBranch className="w-4 h-4 mr-2" />
                            {t('explorer.newGitFolder')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleContextAction('newNotebook')}>
                            <Book className="w-4 h-4 mr-2" />
                            {t('explorer.newNotebook')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleContextAction('newFile')}>
                            <FilePlus className="w-4 h-4 mr-2" />
                            {t('explorer.newFile')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleContextAction('newQuery')}>
                            <Database className="w-4 h-4 mr-2" />
                            {t('explorer.newQuery')}
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  
                  {/* 重命名 */}
                  <DropdownMenuItem onClick={() => handleContextAction('rename')}>
                    <Pencil className="w-4 h-4 mr-2" />
                    {t('explorer.rename')}
                  </DropdownMenuItem>
                  
                  {/* 移动 */}
                  <DropdownMenuItem onClick={() => handleContextAction('move')}>
                    <Move className="w-4 h-4 mr-2" />
                    {t('explorer.move')}
                  </DropdownMenuItem>
                  
                  {/* 克隆 */}
                  <DropdownMenuItem onClick={() => handleContextAction('clone')}>
                    <Copy className="w-4 h-4 mr-2" />
                    {t('explorer.clone')}
                  </DropdownMenuItem>
                  
                  {/* 下载（仅文件） */}
                  {!isFolder && (
                    <DropdownMenuItem onClick={() => handleContextAction('download')}>
                      <Download className="w-4 h-4 mr-2" />
                      {t('explorer.download')}
                    </DropdownMenuItem>
                  )}
                  
                  <DropdownMenuSeparator />
                  
                  {/* 共享（权限） */}
                  <DropdownMenuItem onClick={() => handleContextAction('share')}>
                    <Share2 className="w-4 h-4 mr-2" />
                    {t('explorer.sharePermissions')}
                  </DropdownMenuItem>
                  
                  {/* 添加到收藏 */}
                  <DropdownMenuItem onClick={() => handleContextAction('favorite')}>
                    <Star className="w-4 h-4 mr-2" />
                    {t('explorer.addToFavorites')}
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  
                  {/* 移到回收站 */}
                  <DropdownMenuItem 
                    onClick={() => handleContextAction('delete')}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t('explorer.moveToTrash')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            {/* 在新标签页打开（仅文件） */}
            {!isFolder && (
              <ContextMenuItem onClick={() => handleContextAction('openInNewTab')}>
                <ExternalLink className="w-4 h-4 mr-2" />
                {t('explorer.openInNewTab')}
              </ContextMenuItem>
            )}
            
            {/* 复制 URL/路径 子菜单 */}
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Link className="w-4 h-4 mr-2" />
                {t('explorer.copyUrlPath')}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-36">
                <ContextMenuItem onClick={() => handleContextAction('copyUrl')}>
                  <Link className="w-4 h-4 mr-2" />
                  {t('explorer.copyUrl')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleContextAction('copyFullPath')}>
                  <FileText className="w-4 h-4 mr-2" />
                  {t('explorer.copyFullPath')}
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            
            <ContextMenuSeparator />
            
            {/* 创建子菜单（仅文件夹） */}
            {isFolder && (
              <>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('explorer.create')}
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-44">
                    <ContextMenuItem onClick={() => handleContextAction('newFolder')}>
                      <FolderPlus className="w-4 h-4 mr-2" />
                      {t('explorer.newFolder')}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleContextAction('newGitFolder')}>
                      <GitBranch className="w-4 h-4 mr-2" />
                      {t('explorer.newGitFolder')}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => handleContextAction('newNotebook')}>
                      <Book className="w-4 h-4 mr-2" />
                      {t('explorer.newNotebook')}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleContextAction('newFile')}>
                      <FilePlus className="w-4 h-4 mr-2" />
                      {t('explorer.newFile')}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleContextAction('newQuery')}>
                      <Database className="w-4 h-4 mr-2" />
                      {t('explorer.newQuery')}
                    </ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
              </>
            )}
            
            {/* 重命名 */}
            <ContextMenuItem onClick={() => handleContextAction('rename')}>
              <Pencil className="w-4 h-4 mr-2" />
              {t('explorer.rename')}
            </ContextMenuItem>
            
            {/* 移动 */}
            <ContextMenuItem onClick={() => handleContextAction('move')}>
              <Move className="w-4 h-4 mr-2" />
              {t('explorer.move')}
            </ContextMenuItem>
            
            {/* 克隆 */}
            <ContextMenuItem onClick={() => handleContextAction('clone')}>
              <Copy className="w-4 h-4 mr-2" />
              {t('explorer.clone')}
            </ContextMenuItem>
            
            {/* 下载（仅文件） */}
            {!isFolder && (
              <ContextMenuItem onClick={() => handleContextAction('download')}>
                <Download className="w-4 h-4 mr-2" />
                {t('explorer.download')}
              </ContextMenuItem>
            )}
            
            <ContextMenuSeparator />
            
            {/* 共享（权限） */}
            <ContextMenuItem onClick={() => handleContextAction('share')}>
              <Share2 className="w-4 h-4 mr-2" />
              {t('explorer.sharePermissions')}
            </ContextMenuItem>
            
            {/* 添加到收藏 */}
            <ContextMenuItem onClick={() => handleContextAction('favorite')}>
              <Star className="w-4 h-4 mr-2" />
              {t('explorer.addToFavorites')}
            </ContextMenuItem>
            
            <ContextMenuSeparator />
            
            {/* 移到回收站 */}
            <ContextMenuItem 
              onClick={() => handleContextAction('delete')}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('explorer.moveToTrash')}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        
        {isFolder && isExpanded && item.children && (
          <div>
            {item.children.map(child => renderFileItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Helper function to flatten file tree for display
  const flattenFileTree = (items: FileItem[]): FileItem[] => {
    return items;
  };

  // Sort files based on current sort option
  const sortFiles = (items: FileItem[]): FileItem[] => {
    return [...items].sort((a, b) => {
      switch (sortBy) {
        case 'dateCreated':
          // Sort by created_at descending (newest first)
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateB - dateA;
        case 'name':
          // Sort by name ascending (alphabetical)
          return a.name.localeCompare(b.name);
        case 'type':
          // Sort by type: directories first, then by extension
          if (a.type === 'directory' && b.type !== 'directory') return -1;
          if (a.type !== 'directory' && b.type === 'directory') return 1;
          if (a.type === 'directory' && b.type === 'directory') {
            return a.name.localeCompare(b.name);
          }
          // Both are files, sort by extension
          const extA = a.name.split('.').pop()?.toLowerCase() || '';
          const extB = b.name.split('.').pop()?.toLowerCase() || '';
          if (extA !== extB) return extA.localeCompare(extB);
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  };

  // Render file item in flat list view (Databricks style)
  const renderFlatFileItem = (item: FileItem): React.ReactNode => {
    const isSelected = selectedNodeId === item.id;
    const isFolder = item.type === 'directory';
    const fileConfig = !isFolder ? getFileIcon(item.name, isDarkMode) : null;

    const handleContextAction = async (action: string) => {
      switch (action) {
        case 'newFile':
          openDialogSafely('create', { createType: 'file', parentId: item.id });
          break;
        case 'newFolder':
          openDialogSafely('create', { createType: 'directory', parentId: item.id });
          break;
        case 'newGitFolder':
          openDialogSafely('gitFolder', { parentId: item.id });
          break;
        case 'newNotebook':
          openDialogSafely('create', { createType: 'notebook', parentId: item.id });
          break;
        case 'newQuery':
          openDialogSafely('create', { createType: 'query', parentId: item.id });
          break;
        case 'openInNewTab':
          if (!isFolder) {
            const url = getFileUrl(item.id);
            window.open(url, '_blank');
          }
          break;
        case 'copyUrl':
          try {
            const url = getFileUrl(item.id);
            await navigator.clipboard.writeText(url);
            setSnackbar({ open: true, message: t('explorer.copiedToClipboard'), severity: 'success' });
          } catch {
            setSnackbar({ open: true, message: t('explorer.copyFailed'), severity: 'error' });
          }
          break;
        case 'copyFullPath':
          try {
            await navigator.clipboard.writeText(item.full_path);
            setSnackbar({ open: true, message: t('explorer.copiedToClipboard'), severity: 'success' });
          } catch {
            setSnackbar({ open: true, message: t('explorer.copyFailed'), severity: 'error' });
          }
          break;
        case 'rename':
          openDialogSafely('rename', { item });
          break;
        case 'move':
          openDialogSafely('move', { item, mode: 'move' });
          break;
        case 'clone':
          setOperationLoading(true);
          try {
            await copyObject(item.id, item.parent_id ?? undefined);
            await refreshFileTree();
            setSnackbar({ open: true, message: t('explorer.copySuccess'), severity: 'success' });
          } catch (error) {
            console.error('克隆失败:', error);
            setSnackbar({ open: true, message: t('explorer.copyFailed'), severity: 'error' });
          } finally {
            setOperationLoading(false);
          }
          break;
        case 'download':
          if (!isFolder) {
            try {
              await downloadFile(item.id, item.name);
              setSnackbar({ open: true, message: t('explorer.downloadSuccess'), severity: 'success' });
            } catch (error) {
              console.error('下载失败:', error);
              setSnackbar({ open: true, message: t('explorer.downloadFailed'), severity: 'error' });
            }
          }
          break;
        case 'share':
          setSnackbar({ open: true, message: 'Share feature coming soon', severity: 'info' });
          break;
        case 'favorite':
          setSnackbar({ open: true, message: t('explorer.addToFavoritesSuccess'), severity: 'success' });
          break;
        case 'delete':
          openDialogSafely('delete', { item });
          break;
      }
    };

    return (
      <div 
        key={item.id} 
        className="group"
        onClick={() => handleItemClick(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleItemClick(item);
          }
        }}
      >
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-[13px] transition-colors cursor-pointer',
                'hover:bg-accent/50 border-b border-border/50',
                isSelected && 'bg-primary/10 hover:bg-primary/15'
              )}
            >
              {/* Icon */}
              <span className="flex-shrink-0">
                {isFolder ? (
                  <Folder className="w-4 h-4 text-amber-500" />
                ) : (
                  <span style={{ color: fileConfig?.color }}>
                    {fileConfig?.icon}
                  </span>
                )}
              </span>
              
              {/* File name */}
              <span className={cn(
                'flex-1 truncate text-left',
                isSelected && 'font-medium'
              )}>
                {item.name}
              </span>
              
              {/* More options button */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      'opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent',
                      'transition-opacity focus:opacity-100'
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48" align="end">
                {!isFolder && (
                  <DropdownMenuItem onClick={() => handleContextAction('openInNewTab')}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    {t('explorer.openInNewTab')}
                  </DropdownMenuItem>
                )}
                
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Link className="w-4 h-4 mr-2" />
                    {t('explorer.copyUrlPath')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-36">
                    <DropdownMenuItem onClick={() => handleContextAction('copyUrl')}>
                      <Link className="w-4 h-4 mr-2" />
                      {t('explorer.copyUrl')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleContextAction('copyFullPath')}>
                      <FileText className="w-4 h-4 mr-2" />
                      {t('explorer.copyFullPath')}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                
                <DropdownMenuSeparator />
                
                {isFolder && (
                  <>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Plus className="w-4 h-4 mr-2" />
                        {t('explorer.create')}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-44">
                        <DropdownMenuItem onClick={() => handleContextAction('newFolder')}>
                          <FolderPlus className="w-4 h-4 mr-2" />
                          {t('explorer.newFolder')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleContextAction('newGitFolder')}>
                          <GitBranch className="w-4 h-4 mr-2" />
                          {t('explorer.newGitFolder')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleContextAction('newNotebook')}>
                          <Book className="w-4 h-4 mr-2" />
                          {t('explorer.newNotebook')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleContextAction('newFile')}>
                          <FilePlus className="w-4 h-4 mr-2" />
                          {t('explorer.newFile')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleContextAction('newQuery')}>
                          <Database className="w-4 h-4 mr-2" />
                          {t('explorer.newQuery')}
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                  </>
                )}
                
                <DropdownMenuItem onClick={() => handleContextAction('rename')}>
                  <Pencil className="w-4 h-4 mr-2" />
                  {t('explorer.rename')}
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={() => handleContextAction('move')}>
                  <Move className="w-4 h-4 mr-2" />
                  {t('explorer.move')}
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={() => handleContextAction('clone')}>
                  <Copy className="w-4 h-4 mr-2" />
                  {t('explorer.clone')}
                </DropdownMenuItem>
                
                {!isFolder && (
                  <DropdownMenuItem onClick={() => handleContextAction('download')}>
                    <Download className="w-4 h-4 mr-2" />
                    {t('explorer.download')}
                  </DropdownMenuItem>
                )}
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem onClick={() => handleContextAction('share')}>
                  <Share2 className="w-4 h-4 mr-2" />
                  {t('explorer.sharePermissions')}
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={() => handleContextAction('favorite')}>
                  <Star className="w-4 h-4 mr-2" />
                  {t('explorer.addToFavorites')}
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem 
                  onClick={() => handleContextAction('delete')}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('explorer.moveToTrash')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {!isFolder && (
            <ContextMenuItem onClick={() => handleContextAction('openInNewTab')}>
              <ExternalLink className="w-4 h-4 mr-2" />
              {t('explorer.openInNewTab')}
            </ContextMenuItem>
          )}
          
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Link className="w-4 h-4 mr-2" />
              {t('explorer.copyUrlPath')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-36">
              <ContextMenuItem onClick={() => handleContextAction('copyUrl')}>
                <Link className="w-4 h-4 mr-2" />
                {t('explorer.copyUrl')}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleContextAction('copyFullPath')}>
                <FileText className="w-4 h-4 mr-2" />
                {t('explorer.copyFullPath')}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          
          <ContextMenuSeparator />
          
          {isFolder && (
            <>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('explorer.create')}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-44">
                  <ContextMenuItem onClick={() => handleContextAction('newFolder')}>
                    <FolderPlus className="w-4 h-4 mr-2" />
                    {t('explorer.newFolder')}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleContextAction('newGitFolder')}>
                    <GitBranch className="w-4 h-4 mr-2" />
                    {t('explorer.newGitFolder')}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => handleContextAction('newNotebook')}>
                    <Book className="w-4 h-4 mr-2" />
                    {t('explorer.newNotebook')}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleContextAction('newFile')}>
                    <FilePlus className="w-4 h-4 mr-2" />
                    {t('explorer.newFile')}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleContextAction('newQuery')}>
                    <Database className="w-4 h-4 mr-2" />
                    {t('explorer.newQuery')}
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
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
          
          <ContextMenuItem onClick={() => handleContextAction('clone')}>
            <Copy className="w-4 h-4 mr-2" />
            {t('explorer.clone')}
          </ContextMenuItem>
          
          {!isFolder && (
            <ContextMenuItem onClick={() => handleContextAction('download')}>
              <Download className="w-4 h-4 mr-2" />
              {t('explorer.download')}
            </ContextMenuItem>
          )}
          
          <ContextMenuSeparator />
          
          <ContextMenuItem onClick={() => handleContextAction('share')}>
            <Share2 className="w-4 h-4 mr-2" />
            {t('explorer.sharePermissions')}
          </ContextMenuItem>
          
          <ContextMenuItem onClick={() => handleContextAction('favorite')}>
            <Star className="w-4 h-4 mr-2" />
            {t('explorer.addToFavorites')}
          </ContextMenuItem>
          
          <ContextMenuSeparator />
          
          <ContextMenuItem 
            onClick={() => handleContextAction('delete')}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {t('explorer.moveToTrash')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* View: Users List or User Files */}
      {currentView === 'users' ? (
        // Users list view
        <div className="py-1">
          <Collapsible open={isUsersExpanded} onOpenChange={setIsUsersExpanded}>
            <CollapsibleTrigger asChild>
              <button className={cn(
                'w-full flex items-center gap-1 px-2 py-1.5 rounded-md text-[13px] transition-colors',
                'hover:bg-accent/50',
                isDarkMode ? 'text-zinc-300' : 'text-zinc-700'
              )}>
                <span className="w-4 h-4 flex items-center justify-center text-muted-foreground">
                  {isUsersExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>
                {isUsersExpanded ? (
                  <FolderOpen className="w-4 h-4 text-amber-500" />
                ) : (
                  <Folder className="w-4 h-4 text-amber-500" />
                )}
                <span className="font-medium">Users</span>
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              {loading ? (
                <div className="px-8 py-2 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.loading')}
                </div>
              ) : users.length === 0 ? (
                <div className="px-8 py-2 text-sm text-muted-foreground">
                  {t('common.noData')}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {users.map((user) => {
                    const isCurrentUser = currentUser?.email === user.email;
                    
                    return (
                      <button
                        key={user.id}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-[13px] transition-colors',
                          'hover:bg-accent/50 border-b border-border/50'
                        )}
                        style={{ paddingLeft: '28px' }}
                        onClick={() => handleUserClick(user)}
                      >
                        <Folder className={cn(
                          "w-4 h-4",
                          isCurrentUser ? "text-blue-500" : "text-amber-500"
                        )} />
                        <span className="truncate flex-1 text-left">
                          {user.email}
                        </span>
                        {isCurrentUser && (
                          <UserIcon className="w-3 h-3 text-blue-500 flex-shrink-0" />
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      ) : (
        // User files view (drill-down)
        <div className="h-full flex flex-col">
          {/* Header with back button and breadcrumb */}
          <div className="flex items-center justify-between px-2 py-2 border-b border-border">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={handleBackToUsers}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {/* Show current folder name or user email */}
              <span className="font-semibold text-sm truncate">
                {currentFolder ? currentFolder.name : (selectedUser?.email || 'Users')}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Sort dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuRadioGroup value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                    <DropdownMenuRadioItem value="dateCreated">
                      {t('explorer.sortByDateCreated')}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name">
                      {t('explorer.sortByName')}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="type">
                      {t('explorer.sortByType')}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {/* Open in new browser tab */}
                  <DropdownMenuItem onClick={() => {
                    // Open user folder in new tab
                    if (selectedUser) {
                      const url = `${window.location.origin}/workspace?user=${selectedUser.email}`;
                      window.open(url, '_blank');
                    }
                  }}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    {t('explorer.openInNewTab')}
                  </DropdownMenuItem>
                  
                  {/* Copy URL/path */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Link className="w-4 h-4 mr-2" />
                      {t('explorer.copyUrlPath')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-36">
                      <DropdownMenuItem onClick={async () => {
                        if (selectedUser) {
                          const url = `${window.location.origin}/workspace?user=${selectedUser.email}`;
                          await navigator.clipboard.writeText(url);
                          setSnackbar({ open: true, message: t('explorer.copiedToClipboard'), severity: 'success' });
                        }
                      }}>
                        <Link className="w-4 h-4 mr-2" />
                        URL
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        if (selectedUser) {
                          await navigator.clipboard.writeText(`/Workspace/Users/${selectedUser.email}`);
                          setSnackbar({ open: true, message: t('explorer.copiedToClipboard'), severity: 'success' });
                        }
                      }}>
                        <FileText className="w-4 h-4 mr-2" />
                        {t('explorer.fullPath')}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  
                  {/* Create submenu */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Plus className="w-4 h-4 mr-2" />
                      {t('explorer.create')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-52">
                      <DropdownMenuItem onClick={() => {
                        openDialogSafely('create', { createType: 'directory', parentId: currentFolder?.id });
                      }}>
                        <FolderPlus className="w-4 h-4 mr-2" />
                        {t('explorer.newFolder')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        openDialogSafely('gitFolder', { parentId: currentFolder?.id });
                      }}>
                        <GitBranch className="w-4 h-4 mr-2" />
                        {t('explorer.newGitFolder')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => {
                        openDialogSafely('create', { createType: 'notebook', parentId: currentFolder?.id });
                      }}>
                        <Book className="w-4 h-4 mr-2" />
                        {t('explorer.newNotebook')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        openDialogSafely('create', { createType: 'file', parentId: currentFolder?.id });
                      }}>
                        <FilePlus className="w-4 h-4 mr-2" />
                        {t('explorer.newFile')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        openDialogSafely('create', { createType: 'query', parentId: currentFolder?.id });
                      }}>
                        <Database className="w-4 h-4 mr-2" />
                        {t('explorer.newQuery')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => {
                        setSnackbar({ open: true, message: 'Dashboard feature coming soon', severity: 'info' });
                      }}>
                        <LayoutDashboard className="w-4 h-4 mr-2" />
                        Dashboard
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSnackbar({ open: true, message: 'Genie space feature coming soon', severity: 'info' });
                      }}>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Genie space
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => {
                        setSnackbar({ open: true, message: 'ETL Pipeline feature coming soon', severity: 'info' });
                      }}>
                        <Workflow className="w-4 h-4 mr-2" />
                        ETL Pipeline
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSnackbar({ open: true, message: 'Legacy Alert feature coming soon', severity: 'info' });
                      }}>
                        <Bell className="w-4 h-4 mr-2" />
                        Legacy Alert
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSnackbar({ open: true, message: 'Alert Preview feature coming soon', severity: 'info' });
                      }}>
                        <Bell className="w-4 h-4 mr-2" />
                        Alert Preview
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSnackbar({ open: true, message: 'MLflow experiment feature coming soon', severity: 'info' });
                      }}>
                        <FlaskConical className="w-4 h-4 mr-2" />
                        MLflow experiment
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  
                  {/* Import */}
                  <DropdownMenuItem onClick={() => {
                    setSnackbar({ open: true, message: 'Import feature coming soon', severity: 'info' });
                  }}>
                    <Upload className="w-4 h-4 mr-2" />
                    {t('explorer.import')}
                  </DropdownMenuItem>
                  
                  {/* Download as */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FileDown className="w-4 h-4 mr-2" />
                      {t('explorer.downloadAs')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      <DropdownMenuItem onClick={() => {
                        setSnackbar({ open: true, message: 'DBC archive download coming soon', severity: 'info' });
                      }}>
                        <FileArchive className="w-4 h-4 mr-2" />
                        DBC archive (notebooks only)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSnackbar({ open: true, message: 'Zip Source download coming soon', severity: 'info' });
                      }}>
                        <FileArchive className="w-4 h-4 mr-2" />
                        Zip - Source (notebooks + files only)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSnackbar({ open: true, message: 'Zip HTML download coming soon', severity: 'info' });
                      }}>
                        <FileArchive className="w-4 h-4 mr-2" />
                        Zip - HTML (notebooks only)
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  
                  <DropdownMenuSeparator />
                  
                  {/* Share (Permissions) */}
                  <DropdownMenuItem onClick={() => {
                    setSnackbar({ open: true, message: 'Share feature coming soon', severity: 'info' });
                  }}>
                    <Share2 className="w-4 h-4 mr-2" />
                    {t('explorer.sharePermissions')}
                  </DropdownMenuItem>
                  
                  {/* Add to favorites */}
                  <DropdownMenuItem onClick={() => {
                    setSnackbar({ open: true, message: t('explorer.addToFavoritesSuccess'), severity: 'success' });
                  }}>
                    <Star className="w-4 h-4 mr-2" />
                    {t('explorer.addToFavorites')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          {/* File list */}
          <ScrollArea className="flex-1">
            {fileTreeLoading ? (
              <div className="px-4 py-8 text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('common.loading')}
              </div>
            ) : selectedUser && currentUser?.email !== selectedUser.email ? (
              <div className="px-4 py-8 text-sm text-muted-foreground text-center">
                {t('common.noPermission', { defaultValue: '暂无权限查看' })}
              </div>
            ) : (() => {
              // Get items to display based on current folder
              const itemsToDisplay = currentFolder 
                ? (currentFolder.children || [])
                : fileTree;
              
              if (itemsToDisplay.length === 0) {
                return (
                  <div className="px-4 py-8 text-sm text-muted-foreground text-center">
                    {t('common.noData')}
                  </div>
                );
              }
              
              return (
                <div>
                  {sortFiles(itemsToDisplay).map(item => renderFlatFileItem(item))}
                </div>
              );
            })()}
          </ScrollArea>
        </div>
      )}

      {/* Dialogs */}
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
              {createDialog.type === 'directory' && t('explorer.newFolder')}
              {createDialog.type === 'notebook' && t('explorer.newNotebook')}
              {createDialog.type === 'query' && t('explorer.newQuery')}
              {createDialog.type === 'file' && t('explorer.newFile')}
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
            {newName && (createDialog.type === 'notebook' || createDialog.type === 'query') && (
              <p className="mt-2 text-sm text-muted-foreground">
                {t('workspace.fileWillBe', { 
                  name: createDialog.type === 'notebook' 
                    ? (newName.endsWith('.ipynb') ? newName : `${newName}.ipynb`)
                    : (newName.endsWith('.sql') ? newName : `${newName}.sql`)
                })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog({ open: false, type: null })}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={() => {
                if (newName.trim()) {
                  handleCreate(createDialog.type!, newName, createDialog.parentId);
                }
              }}
              disabled={operationLoading || !newName.trim()}
            >
              {operationLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Git Folder 创建对话框 */}
      <Dialog open={gitFolderDialog.open} onOpenChange={(open) => {
        if (!open) {
          setGitFolderDialog({ open: false });
          setGitRepoUrl('');
          setGitProvider('');
          setGitFolderName('');
          setSparseCheckoutMode(false);
        }
      }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Create Git folder</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Git repository URL and Git provider in same row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="git-repo-url" className="text-sm flex items-center gap-1">
                  Git repository URL
                  <span className="text-muted-foreground cursor-help" title="The URL of your Git repository">ⓘ</span>
                </Label>
                <Input
                  id="git-repo-url"
                  placeholder="https://example.com/organization/project.git"
                  value={gitRepoUrl}
                  onChange={(e) => setGitRepoUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="git-provider" className="text-sm flex items-center gap-1">
                  Git provider
                  <span className="text-muted-foreground cursor-help" title="Select your Git provider">ⓘ</span>
                </Label>
                <Select value={gitProvider} onValueChange={setGitProvider}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Git provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="github">GitHub</SelectItem>
                    <SelectItem value="gitlab">GitLab</SelectItem>
                    <SelectItem value="bitbucket">Bitbucket</SelectItem>
                    <SelectItem value="azure">Azure DevOps</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Git folder name */}
            <div className="space-y-2">
              <Label htmlFor="git-folder-name" className="text-sm">
                Git folder name
              </Label>
              <Input
                id="git-folder-name"
                placeholder=""
                value={gitFolderName}
                onChange={(e) => setGitFolderName(e.target.value)}
              />
            </div>
            
            {/* Sparse checkout mode */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="sparse-checkout"
                checked={sparseCheckoutMode}
                onChange={(e) => setSparseCheckoutMode(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="sparse-checkout" className="text-sm font-normal flex items-center gap-1">
                Sparse checkout mode
                <span className="text-muted-foreground cursor-help" title="Only checkout specific files/folders">ⓘ</span>
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setGitFolderDialog({ open: false });
                setGitRepoUrl('');
                setGitProvider('');
                setGitFolderName('');
                setSparseCheckoutMode(false);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateGitFolder}
              disabled={operationLoading || !gitFolderName.trim()}
              className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white"
            >
              {operationLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Git folder
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
