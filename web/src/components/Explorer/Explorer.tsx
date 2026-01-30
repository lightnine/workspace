import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  alpha,
  useTheme,
  Collapse
} from '@mui/material';
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  InsertDriveFile as FileIcon,
  MoreVert as MoreVertIcon,
  CreateNewFolder as CreateFolderIcon,
  NoteAdd as CreateFileIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  Description as NotebookIcon,
  Code as CodeIcon,
  DataObject as JsonIcon,
  Storage as SqlIcon,
  Article as MarkdownIcon
} from '@mui/icons-material';
import { FileItem } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useEditor } from '../../context/EditorContext';
import { useApp } from '../../context/AppContext';
import { createFile, createDirectory, updateObject, deleteObject } from '../../services/api';

// 获取文件图标和颜色
const getFileIcon = (fileName: string, isDarkMode: boolean) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  const iconConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    'py': { 
      icon: <CodeIcon sx={{ fontSize: 16 }} />, 
      color: '#3776AB' 
    },
    'ipynb': { 
      icon: <NotebookIcon sx={{ fontSize: 16 }} />, 
      color: '#F37626' 
    },
    'js': { 
      icon: <CodeIcon sx={{ fontSize: 16 }} />, 
      color: '#F7DF1E' 
    },
    'ts': { 
      icon: <CodeIcon sx={{ fontSize: 16 }} />, 
      color: '#3178C6' 
    },
    'tsx': { 
      icon: <CodeIcon sx={{ fontSize: 16 }} />, 
      color: '#3178C6' 
    },
    'jsx': { 
      icon: <CodeIcon sx={{ fontSize: 16 }} />, 
      color: '#61DAFB' 
    },
    'json': { 
      icon: <JsonIcon sx={{ fontSize: 16 }} />, 
      color: isDarkMode ? '#A1A1AA' : '#5B5B5B' 
    },
    'md': { 
      icon: <MarkdownIcon sx={{ fontSize: 16 }} />, 
      color: '#083FA1' 
    },
    'sql': { 
      icon: <SqlIcon sx={{ fontSize: 16 }} />, 
      color: '#E38C00' 
    }
  };
  
  return iconConfig[ext || ''] || { 
    icon: <FileIcon sx={{ fontSize: 16 }} />, 
    color: isDarkMode ? '#A1A1AA' : '#71717A' 
  };
};

export const Explorer: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { theme: themeMode } = useApp();
  const isDarkMode = themeMode === 'dark';
  
  const { fileTree, expandedNodes, setExpandedNodes, selectedNodeId, setSelectedNodeId, refreshFileTree, loading } = useWorkspace();
  const { openFile } = useEditor();
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    item: FileItem | null;
  } | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; item: FileItem | null }>({ open: false, item: null });
  const [newName, setNewName] = useState('');
  const [createDialog, setCreateDialog] = useState<{ open: boolean; type: 'file' | 'directory' | null; parentId?: number }>({ open: false, type: null });

  const handleContextMenu = (event: React.MouseEvent, item: FileItem) => {
    event.preventDefault();
    setContextMenu(
      contextMenu === null
        ? {
            mouseX: event.clientX + 2,
            mouseY: event.clientY - 6,
            item
          }
        : null
    );
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
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
        await createFile(name, '', parentId); // 创建空文件
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
    try {
      await updateObject(renameDialog.item.id, { name: newName });
      await refreshFileTree();
      setRenameDialog({ open: false, item: null });
      setNewName('');
    } catch (error) {
      console.error('重命名失败:', error);
      throw error;
    }
  };

  const handleDelete = async () => {
    if (!contextMenu?.item) return;
    try {
      await deleteObject(contextMenu.item.id);
      await refreshFileTree();
      handleCloseContextMenu();
    } catch (error) {
      console.error('删除失败:', error);
      throw error;
    }
  };

  const renderFileItem = (item: FileItem, level: number = 0): React.ReactNode => {
    const isExpanded = expandedNodes.has(item.id);
    const isSelected = selectedNodeId === item.id;
    const isFolder = item.type === 'directory';
    const fileConfig = !isFolder ? getFileIcon(item.name, isDarkMode) : null;

    return (
      <React.Fragment key={item.id}>
        <ListItem
          disablePadding
          onContextMenu={(e) => handleContextMenu(e, item)}
          sx={{ 
            pl: level * 1.5,
            '&:hover .item-actions': {
              opacity: 1
            }
          }}
        >
          <ListItemButton
            selected={isSelected}
            onClick={() => handleItemClick(item)}
            sx={{
              py: 0.5,
              px: 1,
              minHeight: 32,
              borderRadius: '6px',
              mx: 0.5,
              transition: 'all 0.1s ease',
              '&.Mui-selected': {
                bgcolor: isDarkMode 
                  ? alpha(theme.palette.primary.main, 0.2)
                  : alpha(theme.palette.primary.main, 0.12),
                '&:hover': {
                  bgcolor: isDarkMode 
                    ? alpha(theme.palette.primary.main, 0.25)
                    : alpha(theme.palette.primary.main, 0.18)
                }
              },
              '&:hover': {
                bgcolor: isDarkMode 
                  ? alpha('#fff', 0.05)
                  : alpha('#000', 0.04)
              }
            }}
          >
            {/* 展开/折叠图标 */}
            {isFolder && (
              <Box 
                sx={{ 
                  width: 16, 
                  height: 16, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  mr: 0.5,
                  color: 'text.secondary'
                }}
              >
                {isExpanded ? (
                  <ExpandMoreIcon sx={{ fontSize: 16 }} />
                ) : (
                  <ChevronRightIcon sx={{ fontSize: 16 }} />
                )}
              </Box>
            )}
            {!isFolder && <Box sx={{ width: 16, mr: 0.5 }} />}
            
            <ListItemIcon sx={{ minWidth: 24, mr: 1 }}>
              {isFolder ? (
                isExpanded ? (
                  <FolderOpenIcon sx={{ fontSize: 18, color: '#F59E0B' }} />
                ) : (
                  <FolderIcon sx={{ fontSize: 18, color: '#F59E0B' }} />
                )
              ) : (
                <Box sx={{ color: fileConfig?.color }}>
                  {fileConfig?.icon}
                </Box>
              )}
            </ListItemIcon>
            <ListItemText
              primary={item.name}
              primaryTypographyProps={{
                fontSize: '0.8125rem',
                fontWeight: isSelected ? 500 : 400,
                color: 'text.primary',
                noWrap: true
              }}
            />
            <Box 
              className="item-actions"
              sx={{ 
                opacity: 0, 
                transition: 'opacity 0.1s',
                display: 'flex'
              }}
            >
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleContextMenu(e, item);
                }}
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '4px',
                  '&:hover': {
                    bgcolor: isDarkMode 
                      ? alpha('#fff', 0.1)
                      : alpha('#000', 0.08)
                  }
                }}
              >
                <MoreVertIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          </ListItemButton>
        </ListItem>
        
        {/* 子项目 */}
        {isFolder && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <List dense disablePadding>
              {item.children?.map(child => renderFileItem(child, level + 1))}
            </List>
          </Collapse>
        )}
      </React.Fragment>
    );
  };

  if (loading) {
    return (
      <Box 
        sx={{ 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}
      >
        <Typography variant="body2" color="text.secondary" fontSize="0.8125rem">
          {t('common.loading')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto', py: 0.5 }}>
      {fileTree.length === 0 ? (
        <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
          <Typography variant="body2" fontSize="0.8125rem">{t('common.noData')}</Typography>
        </Box>
      ) : (
        <List dense disablePadding>
          {fileTree.map(item => renderFileItem(item))}
        </List>
      )}

      {/* 右键菜单 */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        PaperProps={{
          sx: {
            minWidth: 180,
            borderRadius: '10px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.15)'
          }
        }}
      >
        <MenuItem
          onClick={() => {
            setCreateDialog({ open: true, type: 'file', parentId: contextMenu?.item?.id });
            handleCloseContextMenu();
          }}
        >
          <ListItemIcon>
            <CreateFileIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText 
            primary={t('explorer.newFile')}
            primaryTypographyProps={{ fontSize: '0.875rem' }}
          />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setCreateDialog({ open: true, type: 'directory', parentId: contextMenu?.item?.id });
            handleCloseContextMenu();
          }}
        >
          <ListItemIcon>
            <CreateFolderIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText 
            primary={t('explorer.newFolder')}
            primaryTypographyProps={{ fontSize: '0.875rem' }}
          />
        </MenuItem>
        <Box sx={{ my: 0.5, borderTop: 1, borderColor: 'divider' }} />
        <MenuItem
          onClick={() => {
            if (contextMenu?.item) {
              setRenameDialog({ open: true, item: contextMenu.item });
              setNewName(contextMenu.item.name);
            }
            handleCloseContextMenu();
          }}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText 
            primary={t('explorer.rename')}
            primaryTypographyProps={{ fontSize: '0.875rem' }}
          />
        </MenuItem>
        <MenuItem 
          onClick={handleDelete}
          sx={{
            color: 'error.main',
            '&:hover': {
              bgcolor: alpha(theme.palette.error.main, 0.1)
            }
          }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText 
            primary={t('explorer.delete')}
            primaryTypographyProps={{ fontSize: '0.875rem' }}
          />
        </MenuItem>
      </Menu>

      {/* 重命名对话框 */}
      <Dialog 
        open={renameDialog.open} 
        onClose={() => setRenameDialog({ open: false, item: null })}
        PaperProps={{
          sx: { borderRadius: '12px', minWidth: 360 }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>{t('explorer.rename')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('common.newName')}
            fullWidth
            variant="outlined"
            size="small"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) {
                handleRename();
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={() => setRenameDialog({ open: false, item: null })}
            sx={{ borderRadius: '8px' }}
          >
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleRename} 
            variant="contained"
            sx={{ borderRadius: '8px' }}
          >
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 创建对话框 */}
      <Dialog 
        open={createDialog.open} 
        onClose={() => setCreateDialog({ open: false, type: null })}
        PaperProps={{
          sx: { borderRadius: '12px', minWidth: 360 }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          {createDialog.type === 'directory' ? t('explorer.newFolder') : t('explorer.newFile')}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('common.name')}
            fullWidth
            variant="outlined"
            size="small"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) {
                handleCreate(createDialog.type!, newName, createDialog.parentId);
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={() => setCreateDialog({ open: false, type: null })}
            sx={{ borderRadius: '8px' }}
          >
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
            variant="contained"
            sx={{ borderRadius: '8px' }}
          >
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
