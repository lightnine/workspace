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
  Divider,
  Box,
  Typography
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

const drawerWidth = 240;

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
          boxSizing: 'border-box'
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
            fontSize: '0.7rem',
            color: 'text.secondary',
            letterSpacing: '0.05em'
          }}
        >
          {t('sidebar.navigation')}
        </Typography>
      </Box>
      <Divider />
      <List sx={{ px: 1, py: 1 }}>
        {navItems.map((item) => (
          <ListItem key={item.id} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => handleNavClick(item.path)}
              sx={{
                '& .MuiListItemIcon-root': {
                  minWidth: 40
                }
              }}
            >
              <ListItemIcon sx={{ color: location.pathname === item.path ? 'inherit' : 'text.secondary' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText 
                primary={t(item.labelKey)}
                primaryTypographyProps={{
                  fontSize: '0.9rem',
                  fontWeight: location.pathname === item.path ? 600 : 400
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
};
