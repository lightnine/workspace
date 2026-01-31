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
  FlaskConical,
  Plus,
  ChevronRight,
  Layers,
  Store,
  Server,
  Code2,
  HelpCircle,
  FileQuestion,
  BarChart3,
  Bot,
  Users,
  Sparkles,
  Boxes
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { NavModule } from '../../types';

interface NavItem {
  id: NavModule | string;
  labelKey: string;
  icon: React.ReactNode;
  path: string;
  badge?: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const navSections: NavSection[] = [
    {
      items: [
        { id: 'new', labelKey: 'sidebar.new', icon: <Plus className="w-4 h-4" />, path: '#' },
      ]
    },
    {
      items: [
        { id: 'workspace', labelKey: 'sidebar.workspace', icon: <Folder className="w-4 h-4" />, path: '/workspace' },
        { id: 'recents', labelKey: 'sidebar.recents', icon: <History className="w-4 h-4" />, path: '/recents' },
        { id: 'catalog', labelKey: 'sidebar.catalog', icon: <Layers className="w-4 h-4" />, path: '/catalog' },
      ]
    },
    {
      items: [
        { id: 'jobs', labelKey: 'sidebar.jobsPipelines', icon: <Briefcase className="w-4 h-4" />, path: '/jobs' },
        { id: 'compute', labelKey: 'sidebar.compute', icon: <Monitor className="w-4 h-4" />, path: '/compute' },
        { id: 'marketplace', labelKey: 'sidebar.marketplace', icon: <Store className="w-4 h-4" />, path: '/marketplace' },
      ]
    },
    {
      title: 'SQL',
      items: [
        { id: 'sql-editor', labelKey: 'sidebar.sqlEditor', icon: <Code2 className="w-4 h-4" />, path: '/sql' },
        { id: 'queries', labelKey: 'sidebar.queries', icon: <FileQuestion className="w-4 h-4" />, path: '/queries' },
        { id: 'dashboards', labelKey: 'sidebar.dashboards', icon: <LayoutDashboard className="w-4 h-4" />, path: '/dashboards' },
        { id: 'genie', labelKey: 'sidebar.genie', icon: <Sparkles className="w-4 h-4" />, path: '/genie', badge: 'Preview' },
        { id: 'alerts', labelKey: 'sidebar.alerts', icon: <BarChart3 className="w-4 h-4" />, path: '/alerts' },
        { id: 'query-history', labelKey: 'sidebar.queryHistory', icon: <History className="w-4 h-4" />, path: '/query-history' },
        { id: 'sql-warehouses', labelKey: 'sidebar.sqlWarehouses', icon: <Server className="w-4 h-4" />, path: '/sql-warehouses' },
      ]
    },
    {
      title: 'Data Engineering',
      items: [
        { id: 'job-runs', labelKey: 'sidebar.jobRuns', icon: <GitBranch className="w-4 h-4" />, path: '/job-runs' },
        { id: 'data-ingestion', labelKey: 'sidebar.dataIngestion', icon: <Database className="w-4 h-4" />, path: '/data-ingestion' },
      ]
    },
    {
      title: 'AI/ML',
      items: [
        { id: 'playground', labelKey: 'sidebar.playground', icon: <Bot className="w-4 h-4" />, path: '/playground' },
        { id: 'agents', labelKey: 'sidebar.agents', icon: <Users className="w-4 h-4" />, path: '/agents', badge: 'Preview' },
        { id: 'experiments', labelKey: 'sidebar.experiments', icon: <FlaskConical className="w-4 h-4" />, path: '/experiments' },
        { id: 'features', labelKey: 'sidebar.features', icon: <Boxes className="w-4 h-4" />, path: '/features' },
        { id: 'models', labelKey: 'sidebar.models', icon: <Layers className="w-4 h-4" />, path: '/models' },
        { id: 'serving', labelKey: 'sidebar.serving', icon: <Server className="w-4 h-4" />, path: '/serving' },
      ]
    },
  ];

  const handleNavClick = (path: string) => {
    if (path !== '#') {
      navigate(path);
    }
  };

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-[200px] border-r border-border bg-background z-40 hidden sm:block">
      <ScrollArea className="h-full">
        <nav className="py-2">
          {navSections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {section.title && (
                <div className="px-4 pt-4 pb-1">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {section.title}
                  </span>
                </div>
              )}
              <ul className="px-2 space-y-0.5">
                {section.items.map((item) => {
                  const isSelected = location.pathname === item.path;
                  const isNew = item.id === 'new';
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => handleNavClick(item.path)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-all duration-150',
                          isNew && 'bg-primary text-primary-foreground hover:bg-primary/90',
                          !isNew && isSelected
                            ? 'bg-accent text-foreground'
                            : !isNew && 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                      >
                        <span className={cn(
                          'transition-colors flex-shrink-0',
                          isNew ? 'text-primary-foreground' : isSelected ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {item.icon}
                        </span>
                        <span className="truncate">{t(item.labelKey)}</span>
                        {item.badge && (
                          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {sectionIndex < navSections.length - 1 && !section.title && (
                <Separator className="my-2 mx-2" />
              )}
            </div>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
};
