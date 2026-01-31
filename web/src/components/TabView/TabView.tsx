import React from 'react';
import { X, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useEditor } from '../../context/EditorContext';

const getFileColor = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'py':
      return 'text-blue-500';
    case 'ipynb':
      return 'text-orange-500';
    case 'js':
    case 'jsx':
      return 'text-yellow-500';
    case 'ts':
    case 'tsx':
      return 'text-blue-400';
    case 'json':
      return 'text-green-500';
    case 'md':
      return 'text-purple-500';
    case 'sql':
      return 'text-pink-500';
    default:
      return 'text-muted-foreground';
  }
};

export const TabView: React.FC = () => {
  const { tabs, activeTabId, setActiveTabId, closeTab } = useEditor();

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex border-b border-border bg-background">
      <ScrollArea className="flex-1">
        <div className="flex">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const fileColor = getFileColor(tab.fileName);

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={cn(
                  'group flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors min-w-0',
                  isActive
                    ? 'border-primary text-foreground bg-background'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                {/* File name with color */}
                <span className={cn('truncate max-w-[160px]', fileColor)}>
                  {tab.fileName}
                </span>

                {/* Dirty indicator or close button */}
                {tab.isDirty ? (
                  <Circle className="w-2.5 h-2.5 fill-current text-primary flex-shrink-0" />
                ) : (
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => handleCloseTab(e, tab.id)}
                    className={cn(
                      'p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all flex-shrink-0',
                      isActive && 'opacity-60'
                    )}
                  >
                    <X className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};
