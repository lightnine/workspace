import React from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SearchBar } from '../SearchBar/SearchBar';
import { UserMenu } from '../UserMenu/UserMenu';
import { useApp } from '../../context/AppContext';

export const Header: React.FC = () => {
  const { t } = useTranslation();
  const { currentAppId } = useApp();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-background">
      <div className="flex items-center h-full px-4 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 min-w-[180px]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white font-bold text-sm">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span className="font-semibold text-foreground hidden sm:block">
            databricks
          </span>
        </div>

        {/* Global Search - Centered */}
        <div className="flex-1 flex justify-center max-w-2xl mx-auto">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              type="text"
              placeholder={t('search.globalPlaceholder')}
              className="w-full pl-9 pr-16 h-9 bg-muted/50 border-transparent hover:border-border focus:border-primary transition-colors"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              ⌘ + P
            </span>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-3 min-w-[180px] justify-end">
          {/* App ID Display */}
          {currentAppId && (
            <span className="text-xs text-muted-foreground hidden md:block">
              {currentAppId}
            </span>
          )}
          {/* User Menu */}
          <UserMenu />
        </div>
      </div>
    </header>
  );
};
