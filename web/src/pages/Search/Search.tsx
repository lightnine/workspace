import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Avatar, Card, CardContent } from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { SearchBar } from '../../components/SearchBar/SearchBar';
import { SearchSuggestion } from '../../types';
import { useEditor } from '../../context/EditorContext';

export const Search: React.FC = () => {
  const { t } = useTranslation();
  const { openFile } = useEditor();

  const handleSelectResult = async (suggestion: SearchSuggestion) => {
    try {
      // 从后端获取对象详情
      const { getObjectById } = await import('../../services/api');
      const file = await getObjectById(suggestion.id);
      await openFile(file);
    } catch (error) {
      console.error('打开文件失败:', error);
    }
  };

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 3, md: 4 },
        maxWidth: 1000,
        mx: 'auto',
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Box sx={{ width: '100%', textAlign: 'center', mb: 4 }}>
        <Avatar
          sx={{
            bgcolor: 'primary.main',
            width: 80,
            height: 80,
            mx: 'auto',
            mb: 3
          }}
        >
          <SearchIcon sx={{ fontSize: 40 }} />
        </Avatar>
        <Typography
          variant="h3"
          sx={{
            fontWeight: 700,
            mb: 2,
            background: 'linear-gradient(135deg, #0B5FFF 0%, #7C3AED 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}
        >
          {t('search.title')}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          {t('search.subtitle')}
        </Typography>
      </Box>

      <Card
        sx={{
          width: '100%',
          maxWidth: 800,
          p: 2,
          boxShadow: 3
        }}
      >
        <CardContent sx={{ p: 0 }}>
          <SearchBar 
            onSelectResult={handleSelectResult} 
            defaultExpanded={true} 
            disableClose={true}
          />
        </CardContent>
      </Card>

      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          {t('search.hint')}
        </Typography>
      </Box>
    </Box>
  );
};
