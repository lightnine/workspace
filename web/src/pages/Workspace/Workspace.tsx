import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Divider
} from '@mui/material';
import {
  Folder as FolderIcon,
  Add as AddIcon,
  CreateNewFolder as CreateFolderIcon,
  NoteAdd as CreateFileIcon,
  Code as CodeIcon,
  Storage as SqlIcon,
  Description as MarkdownIcon,
  InsertDriveFile as FileIcon
} from '@mui/icons-material';
import { Explorer } from '../../components/Explorer/Explorer';
import { TabView } from '../../components/TabView/TabView';
import { MonacoEditor } from '../../components/Editor/MonacoEditor';
import { useWorkspace, CreateFileType, FILE_TYPE_CONFIG } from '../../context/WorkspaceContext';

export const Workspace: React.FC = () => {
  const { t } = useTranslation();
  const { createDialog, openCreateDialog, closeCreateDialog, handleCreate: contextHandleCreate } = useWorkspace();

  // 新建菜单状态
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  // 本地输入状态
  const [newName, setNewName] = useState('');

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleCreateClick = (type: CreateFileType) => {
    handleMenuClose();
    openCreateDialog(type);
    setNewName('');
  };

  // 获取完整文件名（带扩展名）
  const getFullFileName = () => {
    if (!createDialog.type || createDialog.type === 'directory') return newName;
    const config = FILE_TYPE_CONFIG[createDialog.type];
    if (!config.extension || newName.endsWith(config.extension)) return newName;
    return newName + config.extension;
  };

  // 获取对话框标题
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

  // 获取文件名占位符
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

    try {
      await contextHandleCreate(newName);
      setNewName('');
    } catch (error) {
      console.error('创建失败:', error);
    }
  };

  const handleCloseDialog = () => {
    closeCreateDialog();
    setNewName('');
  };

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* 左侧文件浏览器 */}
      <Paper
        elevation={0}
        sx={{
          width: { xs: 0, sm: 300 },
          minWidth: { xs: 0, sm: 300 },
          display: { xs: 'none', sm: 'flex' },
          flexDirection: 'column',
          borderRight: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper'
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FolderIcon sx={{ color: 'primary.main' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {t('workspace.fileExplorer')}
            </Typography>
          </Box>
          <Tooltip title={t('common.newFile')}>
            <IconButton
              size="small"
              onClick={handleMenuOpen}
              sx={{
                bgcolor: 'primary.main',
                color: 'white',
                '&:hover': {
                  bgcolor: 'primary.dark'
                },
                width: 28,
                height: 28
              }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Explorer />
        </Box>
      </Paper>

      {/* 右侧编辑器区域 */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, bgcolor: 'background.default' }}>
        <TabView />
        <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <MonacoEditor height="100%" />
        </Box>
      </Box>

      {/* 新建菜单 */}
      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right'
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right'
        }}
      >
        <MenuItem onClick={() => handleCreateClick('notebook')}>
          <ListItemIcon>
            <CreateFileIcon fontSize="small" color="warning" />
          </ListItemIcon>
          {t('workspace.newNotebook')}
        </MenuItem>
        <MenuItem onClick={() => handleCreateClick('python')}>
          <ListItemIcon>
            <CodeIcon fontSize="small" color="primary" />
          </ListItemIcon>
          {t('workspace.newPython')}
        </MenuItem>
        <MenuItem onClick={() => handleCreateClick('sql')}>
          <ListItemIcon>
            <SqlIcon fontSize="small" color="secondary" />
          </ListItemIcon>
          {t('workspace.newSql')}
        </MenuItem>
        <MenuItem onClick={() => handleCreateClick('markdown')}>
          <ListItemIcon>
            <MarkdownIcon fontSize="small" color="info" />
          </ListItemIcon>
          {t('workspace.newMarkdown')}
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => handleCreateClick('file')}>
          <ListItemIcon>
            <FileIcon fontSize="small" />
          </ListItemIcon>
          {t('common.newFile')}
        </MenuItem>
        <MenuItem onClick={() => handleCreateClick('directory')}>
          <ListItemIcon>
            <CreateFolderIcon fontSize="small" />
          </ListItemIcon>
          {t('common.newFolder')}
        </MenuItem>
      </Menu>

      {/* 创建对话框 */}
      <Dialog
        open={createDialog.open}
        onClose={handleCloseDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {getDialogTitle()}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('common.name')}
            placeholder={getFileNamePlaceholder()}
            fullWidth
            variant="outlined"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) {
                handleCreate();
              }
            }}
            helperText={createDialog.type && createDialog.type !== 'directory' && createDialog.type !== 'file'
              ? t('workspace.fileWillBe', { name: getFullFileName() || getFileNamePlaceholder() })
              : undefined
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            disabled={!newName.trim()}
          >
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
