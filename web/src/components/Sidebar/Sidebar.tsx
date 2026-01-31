import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Folder, 
  History, 
  Search, 
  Monitor, 
  Briefcase, 
  GitBranch, 
  Database, 
  LayoutDashboard, 
  FlaskConical 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NavModule } from '../../types';

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
    { id: 'workspace', labelKey: 'sidebar.workspace', icon: <Folder className="w-5 h-5" />, path: '/workspace' },
    { id: 'recents', labelKey: 'sidebar.recents', icon: <History className="w-5 h-5" />, path: '/recents' },
    { id: 'search', labelKey: 'sidebar.search', icon: <Search className="w-5 h-5" />, path: '/search' },
    { id: 'compute', labelKey: 'sidebar.compute', icon: <Monitor className="w-5 h-5" />, path: '/compute' },
    { id: 'jobs', labelKey: 'sidebar.jobs', icon: <Briefcase className="w-5 h-5" />, path: '/jobs' },
    { id: 'pipelines', labelKey: 'sidebar.pipelines', icon: <GitBranch className="w-5 h-5" />, path: '/pipelines' },
    { id: 'sql', labelKey: 'sidebar.sql', icon: <Database className="w-5 h-5" />, path: '/sql' },
    { id: 'dashboards', labelKey: 'sidebar.dashboards', icon: <LayoutDashboard className="w-5 h-5" />, path: '/dashboards' },
    { id: 'experiments', labelKey: 'sidebar.experiments', icon: <FlaskConical className="w-5 h-5" />, path: '/experiments' }
  ];

  const handleNavClick = (path: string) => {
    navigate(path);
  };

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-[220px] border-r border-border bg-background z-40 hidden sm:block">
      <ScrollArea className="h-full">
        <div className="px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('sidebar.navigation')}
          </span>
        </div>
        <nav className="px-2 pb-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isSelected = location.pathname === item.path;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => handleNavClick(item.path)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <span className={cn(
                      'transition-colors',
                      isSelected ? 'text-primary' : 'text-muted-foreground'
                    )}>
                      {item.icon}
                    </span>
                    <span>{t(item.labelKey)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </ScrollArea>
    </aside>
  );
};
