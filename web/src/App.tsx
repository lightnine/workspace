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

const drawerWidth = 220;

// 创建主题
const getTheme = (mode: 'light' | 'dark') =>
  createTheme({
    palette: {
      mode,
      primary: {
        main: '#2563EB',
        light: '#3B82F6',
        dark: '#1D4ED8',
        contrastText: '#ffffff'
      },
      secondary: {
        main: '#7C3AED',
        light: '#A78BFA',
        dark: '#5B21B6'
      },
      error: {
        main: '#EF4444',
        light: '#F87171',
        dark: '#DC2626',
        lighter: mode === 'dark' ? '#3D1F1F' : '#FEF2F2'
      } as any,
      success: {
        main: '#10B981',
        light: '#34D399',
        dark: '#059669'
      },
      warning: {
        main: '#F59E0B',
        light: '#FBBF24',
        dark: '#D97706'
      },
      info: {
        main: '#06B6D4',
        light: '#22D3EE',
        dark: '#0891B2'
      },
      grey: {
        50: mode === 'dark' ? '#18181B' : '#FAFAFA',
        100: mode === 'dark' ? '#27272A' : '#F4F4F5',
        200: mode === 'dark' ? '#3F3F46' : '#E4E4E7',
        300: mode === 'dark' ? '#52525B' : '#D4D4D8',
        400: mode === 'dark' ? '#71717A' : '#A1A1AA',
        500: mode === 'dark' ? '#A1A1AA' : '#71717A'
      },
      background: {
        default: mode === 'dark' ? '#09090B' : '#FAFAFA',
        paper: mode === 'dark' ? '#18181B' : '#FFFFFF'
      },
      text: {
        primary: mode === 'dark' ? '#FAFAFA' : '#18181B',
        secondary: mode === 'dark' ? '#A1A1AA' : '#71717A'
      },
      divider: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
    },
    typography: {
      fontFamily: [
        'Inter',
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
      },
      body1: {
        fontSize: '0.9375rem'
      },
      body2: {
        fontSize: '0.875rem'
      }
    },
    shape: {
      borderRadius: 8
    },
    shadows: [
      'none',
      mode === 'dark' 
        ? '0 1px 2px 0 rgba(0, 0, 0, 0.3)' 
        : '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      mode === 'dark'
        ? '0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 1px 2px -1px rgba(0, 0, 0, 0.4)'
        : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
      mode === 'dark'
        ? '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.4)'
        : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
      mode === 'dark'
        ? '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.4)'
        : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
      mode === 'dark'
        ? '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4)'
        : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      ...Array(19).fill('none')
    ] as any,
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            scrollbarColor: mode === 'dark' ? '#3F3F46 transparent' : '#D4D4D8 transparent',
            '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
              width: 8,
              height: 8
            },
            '&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track': {
              background: 'transparent'
            },
            '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
              backgroundColor: mode === 'dark' ? '#3F3F46' : '#D4D4D8',
              borderRadius: 4,
              '&:hover': {
                backgroundColor: mode === 'dark' ? '#52525B' : '#A1A1AA'
              }
            }
          }
        }
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: mode === 'dark' ? '#18181B' : '#FFFFFF',
            borderRight: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`
          }
        }
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            boxShadow: 'none',
            borderBottom: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: mode === 'dark'
              ? '0 1px 3px rgba(0, 0, 0, 0.3)'
              : '0 1px 3px rgba(0, 0, 0, 0.08)',
            border: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
            borderRadius: 12,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              boxShadow: mode === 'dark'
                ? '0 4px 12px rgba(0, 0, 0, 0.4)'
                : '0 4px 12px rgba(0, 0, 0, 0.12)',
              borderColor: mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'
            }
          }
        }
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            borderRadius: 8,
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none'
            }
          },
          contained: {
            '&:hover': {
              boxShadow: mode === 'dark'
                ? '0 4px 12px rgba(37, 99, 235, 0.3)'
                : '0 4px 12px rgba(37, 99, 235, 0.25)'
            }
          }
        }
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            transition: 'all 0.15s ease'
          }
        }
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: '2px 8px',
            padding: '8px 12px',
            transition: 'all 0.15s ease',
            '&.Mui-selected': {
              backgroundColor: mode === 'dark' ? 'rgba(37, 99, 235, 0.15)' : 'rgba(37, 99, 235, 0.1)',
              color: mode === 'dark' ? '#60A5FA' : '#2563EB',
              '&:hover': {
                backgroundColor: mode === 'dark' ? 'rgba(37, 99, 235, 0.2)' : 'rgba(37, 99, 235, 0.15)'
              },
              '& .MuiListItemIcon-root': {
                color: mode === 'dark' ? '#60A5FA' : '#2563EB'
              }
            },
            '&:hover': {
              backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'
            }
          }
        }
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            fontWeight: 500
          }
        }
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: mode === 'dark' ? '#27272A' : '#18181B',
            color: '#FAFAFA',
            fontSize: '0.75rem',
            fontWeight: 500,
            padding: '6px 12px',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
          },
          arrow: {
            color: mode === 'dark' ? '#27272A' : '#18181B'
          }
        }
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 12,
            boxShadow: mode === 'dark'
              ? '0 10px 40px rgba(0, 0, 0, 0.5)'
              : '0 10px 40px rgba(0, 0, 0, 0.15)',
            border: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`
          }
        }
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            margin: '2px 6px',
            padding: '8px 12px',
            '&:hover': {
              backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'
            }
          }
        }
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            boxShadow: mode === 'dark'
              ? '0 20px 60px rgba(0, 0, 0, 0.6)'
              : '0 20px 60px rgba(0, 0, 0, 0.2)'
          }
        }
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 8,
              '& fieldset': {
                borderColor: mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'
              },
              '&:hover fieldset': {
                borderColor: mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
              }
            }
          }
        }
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            height: 2,
            borderRadius: '2px 2px 0 0'
          }
        }
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            minHeight: 44
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
          <Toolbar sx={{ px: { xs: 2, sm: 3 }, gap: 2, minHeight: '56px !important' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                mr: 2
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  letterSpacing: '-0.02em'
                }}
              >
                DW
              </Box>
              <Box 
                sx={{ 
                  display: { xs: 'none', sm: 'block' },
                  fontWeight: 600,
                  fontSize: '1rem',
                  color: 'text.primary',
                  letterSpacing: '-0.01em'
                }}
              >
                Workspace
              </Box>
            </Box>
            <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'flex-end', maxWidth: { xs: '100%', md: 480 } }}>
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
          <Toolbar sx={{ minHeight: '56px !important' }} />
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
