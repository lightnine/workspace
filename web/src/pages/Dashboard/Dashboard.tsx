import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Button,
  Chip,
  Avatar,
  IconButton
} from '@mui/material';
import {
  InsertDriveFile as FileIcon,
  History as HistoryIcon,
  Folder as FolderIcon,
  Upload as UploadIcon,
  CreateNewFolder as CreateFolderIcon,
  Code as CodeIcon,
  AccessTime as TimeIcon,
  MoreVert as MoreIcon
} from '@mui/icons-material';
import { RecentItem } from '../../types';
import { getRecents } from '../../services/api';
import { useWorkspace } from '../../context/WorkspaceContext';

export const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openCreateDialog } = useWorkspace();
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRecents = async () => {
      try {
        const data = await getRecents();
        setRecents(data);
      } catch (error) {
        console.error('加载最近访问失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadRecents();
  }, []);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'directory':
        return <FolderIcon />;
      default:
        return <FileIcon />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
  };

  const handleCreateNotebook = () => {
    openCreateDialog('notebook');
    navigate('/workspace');
  };

  const handleCreateFolder = () => {
    openCreateDialog('directory');
    navigate('/workspace');
  };

  const handleUploadFile = () => {
    // TODO: 实现上传文件功能
    navigate('/workspace');
  };

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 3, md: 4 },
        maxWidth: 1400,
        mx: 'auto',
        background: 'linear-gradient(180deg, rgba(11, 95, 255, 0.03) 0%, transparent 100%)',
        minHeight: 'calc(100vh - 64px)'
      }}
    >
      {/* 欢迎区域 */}
      <Box sx={{ mb: 4 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            mb: 1,
            background: 'linear-gradient(135deg, #0B5FFF 0%, #7C3AED 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}
        >
          {t('dashboard.welcome')}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.1rem' }}>
          {t('dashboard.subtitle')}
        </Typography>
      </Box>

      {/* 快捷操作卡片 */}
      <Box sx={{ mb: 4 }}>
        <Card
          sx={{
            background: 'linear-gradient(135deg, rgba(11, 95, 255, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%)',
            border: '1px solid',
            borderColor: 'primary.main',
            borderOpacity: 0.2
          }}
        >
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              {t('dashboard.quickStart')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              <Button
                variant="contained"
                startIcon={<CodeIcon />}
                onClick={handleCreateNotebook}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  px: 3,
                  py: 1.5,
                  background: 'linear-gradient(135deg, #0B5FFF 0%, #4D9EFF 100%)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #0052CC 0%, #0B5FFF 100%)'
                  }
                }}
              >
                {t('dashboard.newNotebook')}
              </Button>
              <Button
                variant="outlined"
                startIcon={<CreateFolderIcon />}
                onClick={handleCreateFolder}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  px: 3,
                  py: 1.5
                }}
              >
                {t('common.newFolder')}
              </Button>
              <Button
                variant="outlined"
                startIcon={<UploadIcon />}
                onClick={handleUploadFile}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  px: 3,
                  py: 1.5
                }}
              >
                {t('common.uploadFile')}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
        {/* 最近访问 */}
        <Box sx={{ flex: { md: 2 }, minWidth: 0 }}>
          <Card>
            <CardContent sx={{ p: 0 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 2.5,
                  borderBottom: '1px solid',
                  borderColor: 'divider'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Avatar
                    sx={{
                      bgcolor: 'primary.main',
                      width: 40,
                      height: 40
                    }}
                  >
                    <HistoryIcon />
                  </Avatar>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      最近访问
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {recents.length} 个项目
                    </Typography>
                  </Box>
                </Box>
              </Box>
              {loading ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    加载中...
                  </Typography>
                </Box>
              ) : recents.length === 0 ? (
                <Box
                  sx={{
                    p: 4,
                    textAlign: 'center',
                    color: 'text.secondary'
                  }}
                >
                  <HistoryIcon sx={{ fontSize: 48, mb: 2, opacity: 0.3 }} />
                  <Typography variant="body2">
                    暂无最近访问的文件
                  </Typography>
                </Box>
              ) : (
                <List sx={{ p: 0 }}>
                  {recents.map((item, index) => (
                    <ListItem
                      key={item.id}
                      disablePadding
                      sx={{
                        borderBottom: index < recents.length - 1 ? '1px solid' : 'none',
                        borderColor: 'divider'
                      }}
                    >
                      <ListItemButton
                        sx={{
                          py: 1.5,
                          px: 2.5,
                          '&:hover': {
                            bgcolor: 'action.hover'
                          }
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            minWidth: 40,
                            color: item.type === 'directory' ? 'primary.main' : 'text.secondary'
                          }}
                        >
                          {getTypeIcon(item.type)}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                {item.fileName}
                              </Typography>
                              <Chip
                                label={item.type}
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: '0.7rem',
                                  textTransform: 'capitalize'
                                }}
                              />
                            </Box>
                          }
                          secondary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                              <Typography variant="caption" color="text.secondary">
                                {item.filePath}
                              </Typography>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
                                <TimeIcon sx={{ fontSize: 14 }} />
                                <Typography variant="caption" color="text.secondary">
                                  {formatDate(item.lastAccessed)}
                                </Typography>
                              </Box>
                            </Box>
                          }
                        />
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <MoreIcon fontSize="small" />
                        </IconButton>
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* 快捷操作 */}
        <Box sx={{ flex: { md: 1 }, minWidth: 0 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                {t('dashboard.commonActions')}
              </Typography>
              <List sx={{ p: 0 }}>
                <ListItem disablePadding sx={{ mb: 1 }}>
                  <ListItemButton
                    onClick={handleCreateNotebook}
                    sx={{
                      borderRadius: 2,
                      py: 1.5,
                      '&:hover': {
                        bgcolor: 'action.hover'
                      }
                    }}
                  >
                    <ListItemIcon>
                      <CodeIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={t('dashboard.newNotebook')}
                      secondary={t('dashboard.createNotebook')}
                    />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding sx={{ mb: 1 }}>
                  <ListItemButton
                    onClick={handleCreateFolder}
                    sx={{
                      borderRadius: 2,
                      py: 1.5,
                      '&:hover': {
                        bgcolor: 'action.hover'
                      }
                    }}
                  >
                    <ListItemIcon>
                      <CreateFolderIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={t('common.newFolder')}
                      secondary={t('dashboard.organizeFiles')}
                    />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={handleUploadFile}
                    sx={{
                      borderRadius: 2,
                      py: 1.5,
                      '&:hover': {
                        bgcolor: 'action.hover'
                      }
                    }}
                  >
                    <ListItemIcon>
                      <UploadIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={t('common.uploadFile')}
                      secondary={t('dashboard.importFromLocal')}
                    />
                  </ListItemButton>
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
};
