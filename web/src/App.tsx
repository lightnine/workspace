import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { EditorProvider } from './context/EditorContext';
import { KernelProvider } from './context/KernelContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppLayout } from './components/Layout/AppLayout';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Workspace } from './pages/Workspace/Workspace';
import { Recents } from './pages/Recents/Recents';
import { Search } from './pages/Search/Search';
import { AuthPage } from './pages/Auth/AuthPage';
import { useApp } from './context/AppContext';
import { useTranslation } from 'react-i18next';

const AppRoutes: React.FC = () => {
  const { t } = useTranslation();
  
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/workspace" element={<Workspace />} />
      {/* Notebook 编辑器路由: /editor/notebooks/{fileId} */}
      <Route path="/editor/notebooks/:fileId" element={<Workspace />} />
      {/* 普通文件编辑器路由: /editor/files/{fileId} */}
      <Route path="/editor/files/:fileId" element={<Workspace />} />
      <Route path="/recents" element={<Recents />} />
      <Route path="/search" element={<Search />} />
      <Route path="/compute" element={
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {t('pages.compute')}
        </div>
      } />
      <Route path="/jobs" element={
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {t('pages.jobs')}
        </div>
      } />
      <Route path="/pipelines" element={
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {t('pages.pipelines')}
        </div>
      } />
      <Route path="/sql" element={
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {t('pages.sql')}
        </div>
      } />
      <Route path="/dashboards" element={
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {t('pages.dashboards')}
        </div>
      } />
      <Route path="/experiments" element={
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {t('pages.experiments')}
        </div>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const AppContent: React.FC = () => {
  const { isAuthenticated } = useApp();

  // 未登录时显示登录页面
  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <AppLayout>
      <AppRoutes />
    </AppLayout>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Router>
        <AppProvider>
          <TooltipProvider>
            <WorkspaceProvider>
              <EditorProvider>
                <KernelProvider>
                  <AppContent />
                </KernelProvider>
              </EditorProvider>
            </WorkspaceProvider>
          </TooltipProvider>
        </AppProvider>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
