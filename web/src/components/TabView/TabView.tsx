import React from 'react';
import {
  Box,
  Tabs,
  Tab,
  IconButton,
  alpha
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useEditor } from '../../context/EditorContext';
import { useApp } from '../../context/AppContext';

// 文件图标颜色映射
const getFileIconColor = (fileName: string, isDarkMode: boolean) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const colors: Record<string, string> = {
    'py': '#3776AB',
    'ipynb': '#F37626',
    'js': '#F7DF1E',
    'ts': '#3178C6',
    'tsx': '#3178C6',
    'jsx': '#61DAFB',
    'json': '#5B5B5B',
    'md': '#083FA1',
    'sql': '#E38C00',
    'html': '#E34F26',
    'css': '#1572B6',
    'scss': '#CC6699'
  };
  return colors[ext || ''] || (isDarkMode ? '#A1A1AA' : '#71717A');
};

export const TabView: React.FC = () => {
  const { tabs, activeTabId, setActiveTabId, closeTab } = useEditor();
  const { theme: themeMode } = useApp();
  const isDarkMode = themeMode === 'dark';

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTabId(newValue);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  if (tabs.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: isDarkMode ? alpha('#fff', 0.02) : 'background.paper',
        position: 'relative'
      }}
    >
      <Tabs
        value={activeTabId || false}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          minHeight: 40,
          '& .MuiTabs-indicator': {
            height: 2,
            borderRadius: '2px 2px 0 0',
            bgcolor: 'primary.main'
          },
          '& .MuiTabs-scrollButtons': {
            width: 28,
            '&.Mui-disabled': {
              opacity: 0.3
            }
          },
          '& .MuiTab-root': {
            minHeight: 40,
            textTransform: 'none',
            fontSize: '0.8125rem',
            fontWeight: 500,
            px: 1.5,
            py: 1,
            color: 'text.secondary',
            borderRight: '1px solid',
            borderColor: 'divider',
            transition: 'all 0.15s ease',
            '&.Mui-selected': {
              color: 'text.primary',
              bgcolor: isDarkMode ? alpha('#fff', 0.03) : alpha('#000', 0.02)
            },
            '&:hover': {
              bgcolor: isDarkMode ? alpha('#fff', 0.05) : alpha('#000', 0.04),
              color: 'text.primary'
            }
          }
        }}
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            value={tab.id}
            label={
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  position: 'relative'
                }}
              >
                {/* 文件类型指示点 */}
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '2px',
                    bgcolor: getFileIconColor(tab.fileName, isDarkMode),
                    flexShrink: 0
                  }}
                />
                <span style={{ 
                  maxWidth: 120, 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap' 
                }}>
                  {tab.fileName}
                </span>
                {tab.isDirty && (
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: 'warning.main',
                      flexShrink: 0
                    }}
                  />
                )}
                <IconButton
                  size="small"
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  sx={{
                    ml: 0.5,
                    p: 0.25,
                    width: 18,
                    height: 18,
                    opacity: 0.5,
                    borderRadius: '4px',
                    '&:hover': {
                      opacity: 1,
                      bgcolor: isDarkMode ? alpha('#fff', 0.1) : alpha('#000', 0.08)
                    }
                  }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            }
          />
        ))}
      </Tabs>
    </Box>
  );
};
