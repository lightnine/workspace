import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Box,
  Typography,
  alpha,
  useTheme
} from '@mui/material';
import {
  Folder as FolderIcon,
  History as HistoryIcon,
  Search as SearchIcon,
  Computer as ComputerIcon,
  Work as WorkIcon,
  AccountTree as PipelinesIcon,
  DataObject as SqlIcon,
  Dashboard as DashboardIcon,
  Science as ExperimentsIcon
} from '@mui/icons-material';
import { NavModule } from '../../types';
import { useApp } from '../../context/AppContext';

const drawerWidth = 220;

interface NavItem {
  id: NavModule;
  labelKey: string;
  icon: React.ReactNode;
  path: string;
}

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const { theme: themeMode } = useApp();
  const isDarkMode = themeMode === 'dark';

  const navItems: NavItem[] = [
    { id: 'workspace', labelKey: 'sidebar.workspace', icon: <FolderIcon />, path: '/workspace' },
    { id: 'recents', labelKey: 'sidebar.recents', icon: <HistoryIcon />, path: '/recents' },
    { id: 'search', labelKey: 'sidebar.search', icon: <SearchIcon />, path: '/search' },
    { id: 'compute', labelKey: 'sidebar.compute', icon: <ComputerIcon />, path: '/compute' },
    { id: 'jobs', labelKey: 'sidebar.jobs', icon: <WorkIcon />, path: '/jobs' },
    { id: 'pipelines', labelKey: 'sidebar.pipelines', icon: <PipelinesIcon />, path: '/pipelines' },
    { id: 'sql', labelKey: 'sidebar.sql', icon: <SqlIcon />, path: '/sql' },
    { id: 'dashboards', labelKey: 'sidebar.dashboards', icon: <DashboardIcon />, path: '/dashboards' },
    { id: 'experiments', labelKey: 'sidebar.experiments', icon: <ExperimentsIcon />, path: '/experiments' }
  ];

  const handleNavClick = (path: string) => {
    navigate(path);
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: { xs: 0, sm: drawerWidth },
        flexShrink: 0,
        display: { xs: 'none', sm: 'block' },
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          bgcolor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider'
        }
      }}
    >
      <Toolbar />
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography
          variant="caption"
          sx={{
            textTransform: 'uppercase',
            fontWeight: 600,
            fontSize: '0.65rem',
            color: 'text.secondary',
            letterSpacing: '0.08em'
          }}
        >
          {t('sidebar.navigation')}
        </Typography>
      </Box>
      <List sx={{ px: 1, py: 0.5 }}>
        {navItems.map((item) => {
          const isSelected = location.pathname === item.path;
          return (
            <ListItem key={item.id} disablePadding sx={{ mb: 0.25 }}>
              <ListItemButton
                selected={isSelected}
                onClick={() => handleNavClick(item.path)}
                sx={{
                  py: 1,
                  px: 1.5,
                  borderRadius: '8px',
                  transition: 'all 0.15s ease',
                  '& .MuiListItemIcon-root': {
                    minWidth: 36,
                    color: isSelected 
                      ? 'primary.main' 
                      : (isDarkMode ? alpha('#fff', 0.6) : alpha('#000', 0.5))
                  },
                  '&.Mui-selected': {
                    bgcolor: isDarkMode 
                      ? alpha(theme.palette.primary.main, 0.15)
                      : alpha(theme.palette.primary.main, 0.1),
                    '&:hover': {
                      bgcolor: isDarkMode 
                        ? alpha(theme.palette.primary.main, 0.2)
                        : alpha(theme.palette.primary.main, 0.15)
                    }
                  },
                  '&:hover': {
                    bgcolor: isDarkMode 
                      ? alpha('#fff', 0.05)
                      : alpha('#000', 0.04)
                  }
                }}
              >
                <ListItemIcon 
                  sx={{ 
                    '& .MuiSvgIcon-root': { 
                      fontSize: 20 
                    }
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={t(item.labelKey)}
                  primaryTypographyProps={{
                    fontSize: '0.875rem',
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected ? 'primary.main' : 'text.primary'
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Drawer>
  );
};
