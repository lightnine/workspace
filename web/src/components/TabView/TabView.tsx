import React from 'react';
import {
  Box,
  Tabs,
  Tab,
  IconButton
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useEditor } from '../../context/EditorContext';

export const TabView: React.FC = () => {
  const { tabs, activeTabId, setActiveTabId, closeTab } = useEditor();

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
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
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
          '& .MuiTab-root': {
            minHeight: 40,
            textTransform: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
            px: 2,
            py: 1,
            '&.Mui-selected': {
              color: 'primary.main',
              fontWeight: 600
            }
          },
          '& .MuiTabs-indicator': {
            height: 2,
            borderRadius: '2px 2px 0 0'
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
                <span>{tab.fileName}</span>
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
                    p: 0.5,
                    opacity: 0.6,
                    '&:hover': {
                      opacity: 1,
                      bgcolor: 'action.hover'
                    }
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            }
          />
        ))}
      </Tabs>
    </Box>
  );
};
