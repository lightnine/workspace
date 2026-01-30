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
  Typography
} from '@mui/material';
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  InsertDriveFile as FileIcon,
  MoreVert as MoreVertIcon,
  CreateNewFolder as CreateFolderIcon,
  NoteAdd as CreateFileIcon,
  Edit as EditIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { FileItem } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useEditor } from '../../context/EditorContext';
import { createFile, createDirectory, updateObject, deleteObject } from '../../services/api';

export const Explorer: React.FC = () => {
  const { t } = useTranslation();
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

    return (
      <React.Fragment key={item.id}>
        <ListItem
          disablePadding
          onContextMenu={(e) => handleContextMenu(e, item)}
          sx={{ pl: level * 2 }}
        >
          <ListItemButton
            selected={isSelected}
            onClick={() => handleItemClick(item)}
            sx={{
              py: 0.75,
              px: 1.5,
              borderRadius: 1,
              mx: 0.5,
              '&.Mui-selected': {
                bgcolor: 'primary.main',
                color: 'white',
                '&:hover': {
                  bgcolor: 'primary.dark'
                },
                '& .MuiListItemIcon-root': {
                  color: 'white'
                }
              }
            }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              {isFolder
                ? (isExpanded ? (
                    <FolderOpenIcon sx={{ color: isSelected ? 'white' : 'primary.main' }} />
                  ) : (
                    <FolderIcon sx={{ color: isSelected ? 'white' : 'primary.main' }} />
                  ))
                : <FileIcon sx={{ color: isSelected ? 'white' : 'text.secondary' }} />}
            </ListItemIcon>
            <ListItemText
              primary={item.name}
              primaryTypographyProps={{
                fontSize: '0.875rem',
                fontWeight: isSelected ? 600 : 400
              }}
            />
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleContextMenu(e, item);
              }}
              sx={{
                opacity: 0.5,
                '&:hover': {
                  opacity: 1,
                  bgcolor: 'action.hover'
                }
              }}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </ListItemButton>
        </ListItem>
        {isFolder && isExpanded && item.children && (
          <List dense disablePadding>
            {item.children.map(child => renderFileItem(child, level + 1))}
          </List>
        )}
      </React.Fragment>
    );
  };

  if (loading) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {t('common.loading')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      {fileTree.length === 0 ? (
        <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
          <Typography variant="body2">{t('common.noData')}</Typography>
        </Box>
      ) : (
        <List dense>
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
          {t('explorer.newFile')}
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
          {t('explorer.newFolder')}
        </MenuItem>
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
          {t('explorer.rename')}
        </MenuItem>
        <MenuItem onClick={handleDelete}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          {t('explorer.delete')}
        </MenuItem>
      </Menu>

      {/* 重命名对话框 */}
      <Dialog open={renameDialog.open} onClose={() => setRenameDialog({ open: false, item: null })}>
        <DialogTitle>{t('explorer.rename')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('common.newName')}
            fullWidth
            variant="standard"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialog({ open: false, item: null })}>{t('common.cancel')}</Button>
          <Button onClick={handleRename}>{t('common.confirm')}</Button>
        </DialogActions>
      </Dialog>

      {/* 创建对话框 */}
      <Dialog open={createDialog.open} onClose={() => setCreateDialog({ open: false, type: null })}>
        <DialogTitle>
          {createDialog.type === 'directory' ? t('explorer.newFolder') : t('explorer.newFile')}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('common.name')}
            fullWidth
            variant="standard"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog({ open: false, type: null })}>{t('common.cancel')}</Button>
          <Button onClick={async () => {
            if (newName.trim()) {
              try {
                await handleCreate(createDialog.type!, newName, createDialog.parentId);
              } catch (error) {
                // 错误已在 handleCreate 中处理
              }
            }
          }}>
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
