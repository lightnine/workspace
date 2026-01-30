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
          width: { xs: 0, sm: 280 },
          minWidth: { xs: 0, sm: 280 },
          display: { xs: 'none', sm: 'flex' },
          flexDirection: 'column',
          borderRight: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper'
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 48
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FolderIcon sx={{ color: '#F59E0B', fontSize: 20 }} />
            <Typography 
              variant="subtitle2" 
              sx={{ 
                fontWeight: 600,
                fontSize: '0.8125rem',
                color: 'text.primary'
              }}
            >
              {t('workspace.fileExplorer')}
            </Typography>
          </Box>
          <Tooltip title={t('common.newFile')} arrow>
            <IconButton
              size="small"
              onClick={handleMenuOpen}
              sx={{
                width: 28,
                height: 28,
                borderRadius: '6px',
                bgcolor: 'primary.main',
                color: 'white',
                '&:hover': {
                  bgcolor: 'primary.dark'
                }
              }}
            >
              <AddIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Explorer />
        </Box>
      </Paper>

      {/* 右侧编辑器区域 */}
      <Box 
        sx={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden', 
          minWidth: 0, 
          bgcolor: 'background.default' 
        }}
      >
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
        PaperProps={{
          sx: {
            minWidth: 200,
            borderRadius: '10px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            mt: 0.5
          }
        }}
      >
        <MenuItem onClick={() => handleCreateClick('notebook')}>
          <ListItemIcon>
            <CreateFileIcon fontSize="small" sx={{ color: '#F37626' }} />
          </ListItemIcon>
          <Typography fontSize="0.875rem">{t('workspace.newNotebook')}</Typography>
        </MenuItem>
        <MenuItem onClick={() => handleCreateClick('python')}>
          <ListItemIcon>
            <CodeIcon fontSize="small" sx={{ color: '#3776AB' }} />
          </ListItemIcon>
          <Typography fontSize="0.875rem">{t('workspace.newPython')}</Typography>
        </MenuItem>
        <MenuItem onClick={() => handleCreateClick('sql')}>
          <ListItemIcon>
            <SqlIcon fontSize="small" sx={{ color: '#E38C00' }} />
          </ListItemIcon>
          <Typography fontSize="0.875rem">{t('workspace.newSql')}</Typography>
        </MenuItem>
        <MenuItem onClick={() => handleCreateClick('markdown')}>
          <ListItemIcon>
            <MarkdownIcon fontSize="small" sx={{ color: '#083FA1' }} />
          </ListItemIcon>
          <Typography fontSize="0.875rem">{t('workspace.newMarkdown')}</Typography>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem onClick={() => handleCreateClick('file')}>
          <ListItemIcon>
            <FileIcon fontSize="small" color="action" />
          </ListItemIcon>
          <Typography fontSize="0.875rem">{t('common.newFile')}</Typography>
        </MenuItem>
        <MenuItem onClick={() => handleCreateClick('directory')}>
          <ListItemIcon>
            <CreateFolderIcon fontSize="small" sx={{ color: '#F59E0B' }} />
          </ListItemIcon>
          <Typography fontSize="0.875rem">{t('common.newFolder')}</Typography>
        </MenuItem>
      </Menu>

      {/* 创建对话框 */}
      <Dialog
        open={createDialog.open}
        onClose={handleCloseDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px'
          }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
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
            size="small"
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
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={handleCloseDialog}
            sx={{ borderRadius: '8px' }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            disabled={!newName.trim()}
            sx={{ borderRadius: '8px' }}
          >
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
