import React from 'react';
import { Sidebar } from '../Sidebar/Sidebar';
import { Header } from './Header';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className="flex h-screen bg-background">
      {/* Header */}
      <Header />

      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <main className="flex-1 pt-14 pl-[220px] overflow-hidden">
        {children}
      </main>
    </div>
  );
};
