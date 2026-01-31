import React from 'react';
import { SearchBar } from '../SearchBar/SearchBar';
import { UserMenu } from '../UserMenu/UserMenu';

export const Header: React.FC = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-background">
      <div className="flex items-center h-full px-4 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mr-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center text-white font-bold text-xs">
            DW
          </div>
          <span className="font-semibold text-foreground hidden sm:block">
            Workspace
          </span>
        </div>

        {/* Search */}
        <div className="flex-1 flex justify-end max-w-md">
          <SearchBar />
        </div>

        {/* User Menu */}
        <UserMenu />
      </div>
    </header>
  );
};
