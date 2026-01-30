import React from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { AppProvider } from './context/AppContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { EditorProvider } from './context/EditorContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Sidebar } from './components/Sidebar/Sidebar';
import { SearchBar } from './components/SearchBar/SearchBar';
import { UserMenu } from './components/UserMenu/UserMenu';
import { AppBar, Toolbar, Box } from '@mui/material';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Workspace } from './pages/Workspace/Workspace';
import { Recents } from './pages/Recents/Recents';
import { Search } from './pages/Search/Search';
import { AuthPage } from './pages/Auth/AuthPage';
import { useApp } from './context/AppContext';

const AppRoutes: React.FC = () => {
  const { t } = useTranslation();
  
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/workspace" element={<Workspace />} />
      <Route path="/recents" element={<Recents />} />
      <Route path="/search" element={<Search />} />
      <Route path="/compute" element={<div>{t('pages.compute')}</div>} />
      <Route path="/jobs" element={<div>{t('pages.jobs')}</div>} />
      <Route path="/pipelines" element={<div>{t('pages.pipelines')}</div>} />
      <Route path="/sql" element={<div>{t('pages.sql')}</div>} />
      <Route path="/dashboards" element={<div>{t('pages.dashboards')}</div>} />
      <Route path="/experiments" element={<div>{t('pages.experiments')}</div>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const drawerWidth = 240;

// 创建主题
const getTheme = (mode: 'light' | 'dark') =>
  createTheme({
    palette: {
      mode,
      primary: {
        main: '#0B5FFF',
        light: '#4D9EFF',
        dark: '#0052CC',
        contrastText: '#ffffff'
      },
      secondary: {
        main: '#7C3AED',
        light: '#A78BFA',
        dark: '#5B21B6'
      },
      background: {
        default: mode === 'dark' ? '#0D1117' : '#F6F8FA',
        paper: mode === 'dark' ? '#161B22' : '#FFFFFF'
      },
      text: {
        primary: mode === 'dark' ? '#E6EDF3' : '#1F2328',
        secondary: mode === 'dark' ? '#8B949E' : '#656D76'
      }
    },
    typography: {
      fontFamily: [
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        '"Helvetica Neue"',
        'Arial',
        'sans-serif'
      ].join(','),
      h4: {
        fontWeight: 600,
        letterSpacing: '-0.02em'
      },
      h5: {
        fontWeight: 600,
        letterSpacing: '-0.01em'
      },
      h6: {
        fontWeight: 600
      }
    },
    shape: {
      borderRadius: 8
    },
    components: {
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: mode === 'dark' ? '#161B22' : '#FFFFFF',
            borderRight: `1px solid ${mode === 'dark' ? '#21262D' : '#D1D9E0'}`
          }
        }
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            boxShadow: mode === 'dark' 
              ? '0 1px 3px rgba(0, 0, 0, 0.3)' 
              : '0 1px 3px rgba(0, 0, 0, 0.1)',
            borderBottom: `1px solid ${mode === 'dark' ? '#21262D' : '#D1D9E0'}`
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: mode === 'dark'
              ? '0 1px 3px rgba(0, 0, 0, 0.3)'
              : '0 1px 3px rgba(0, 0, 0, 0.1)',
            border: `1px solid ${mode === 'dark' ? '#21262D' : '#D1D9E0'}`,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              boxShadow: mode === 'dark'
                ? '0 4px 12px rgba(0, 0, 0, 0.4)'
                : '0 4px 12px rgba(0, 0, 0, 0.15)'
            }
          }
        }
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            margin: '2px 8px',
            '&.Mui-selected': {
              backgroundColor: mode === 'dark' ? '#1F6FEB' : '#0969DA',
              color: '#FFFFFF',
              '&:hover': {
                backgroundColor: mode === 'dark' ? '#1F6FEB' : '#0969DA',
                opacity: 0.9
              },
              '& .MuiListItemIcon-root': {
                color: '#FFFFFF'
              }
            },
            '&:hover': {
              backgroundColor: mode === 'dark' ? '#21262D' : '#F3F4F6'
            }
          }
        }
      }
    }
  });

const AppContent: React.FC = () => {
  const { theme: themeMode, isAuthenticated } = useApp();
  const theme = getTheme(themeMode);

  // 未登录时显示登录页面
  if (!isAuthenticated) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthPage />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh' }}>
        {/* 顶部导航栏 */}
        <AppBar
          position="fixed"
          sx={{
            zIndex: (theme) => theme.zIndex.drawer + 1,
            bgcolor: 'background.paper',
            color: 'text.primary'
          }}
        >
          <Toolbar sx={{ px: { xs: 2, sm: 3 }, gap: 2 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mr: 2,
                fontWeight: 600,
                fontSize: '1.1rem',
                color: 'primary.main'
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  background: 'linear-gradient(135deg, #0B5FFF 0%, #7C3AED 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '0.9rem'
                }}
              >
                DW
              </Box>
              <Box sx={{ display: { xs: 'none', sm: 'block' } }}>Workspace</Box>
            </Box>
            <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'flex-end', maxWidth: { xs: '100%', md: 600 } }}>
              <SearchBar />
            </Box>
            <UserMenu />
          </Toolbar>
        </AppBar>

        {/* 侧边栏 */}
        <Sidebar />

        {/* 主内容区 */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 0,
            width: { xs: '100%', sm: `calc(100% - ${drawerWidth}px)` },
            overflow: 'hidden'
          }}
        >
          <Toolbar />
          <AppRoutes />
        </Box>
      </Box>
    </ThemeProvider>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Router>
        <AppProvider>
          <WorkspaceProvider>
            <EditorProvider>
              <AppContent />
            </EditorProvider>
          </WorkspaceProvider>
        </AppProvider>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
