import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Avatar,
  Chip,
  IconButton
} from '@mui/material';
import {
  InsertDriveFile as FileIcon,
  Folder as FolderIcon,
  History as HistoryIcon,
  AccessTime as TimeIcon,
  MoreVert as MoreIcon
} from '@mui/icons-material';
import { RecentItem } from '../../types';
import { getRecents } from '../../services/api';

export const Recents: React.FC = () => {
  const { t } = useTranslation();
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
    return type === 'directory' ? <FolderIcon /> : <FileIcon />;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return '今天';
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days} 天前`;
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  };

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 3, md: 4 },
        maxWidth: 1200,
        mx: 'auto'
      }}
    >
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Avatar
            sx={{
              bgcolor: 'primary.main',
              width: 48,
              height: 48
            }}
          >
            <HistoryIcon />
          </Avatar>
          <Box>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                background: 'linear-gradient(135deg, #0B5FFF 0%, #7C3AED 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              {t('recents.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {recents.length}{t('recents.items')}
            </Typography>
          </Box>
        </Box>
      </Box>

      {loading ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              {t('common.loading')}
            </Typography>
          </CardContent>
        </Card>
      ) : recents.length === 0 ? (
        <Card>
          <CardContent
            sx={{
              textAlign: 'center',
              py: 6,
              color: 'text.secondary'
            }}
          >
            <HistoryIcon sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
            <Typography variant="h6" gutterBottom>
              {t('recents.noRecents')}
            </Typography>
            <Typography variant="body2">
              {t('recents.noRecentsDesc')}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent sx={{ p: 0 }}>
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
                      py: 2,
                      px: 3,
                      '&:hover': {
                        bgcolor: 'action.hover'
                      }
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 48,
                        color: item.type === 'directory' ? 'primary.main' : 'text.secondary'
                      }}
                    >
                      {getTypeIcon(item.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
          </CardContent>
        </Card>
      )}
    </Box>
  );
};
