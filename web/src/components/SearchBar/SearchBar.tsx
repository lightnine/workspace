import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, Folder, FileText, File } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { SearchSuggestion, FileType } from '../../types';
import { search } from '../../services/api';

interface SearchBarProps {
  onSelectResult?: (suggestion: SearchSuggestion) => void;
  defaultExpanded?: boolean;
  disableClose?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ 
  onSelectResult, 
  defaultExpanded = false, 
  disableClose = false 
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length > 0) {
      setLoading(true);
      const timer = setTimeout(async () => {
        const results = await search(query);
        setSuggestions(results);
        setShowSuggestions(true);
        setLoading(false);
      }, 300);

      return () => clearTimeout(timer);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        handleClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (!isExpanded) {
          handleExpand();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (!disableClose) {
          handleClose();
        } else {
          setShowSuggestions(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [disableClose]);

  const handleExpand = () => {
    setIsExpanded(true);
  };

  const handleClose = () => {
    if (disableClose) return;
    setIsExpanded(false);
    setQuery('');
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleSelect = (suggestion: SearchSuggestion) => {
    setShowSuggestions(false);
    setQuery('');
    if (!disableClose) {
      handleClose();
    }
    onSelectResult?.(suggestion);
  };

  const getTypeIcon = (type: FileType) => {
    switch (type) {
      case 'directory':
        return <Folder className="w-4 h-4 text-blue-500" />;
      case 'notebook':
        return <FileText className="w-4 h-4 text-orange-500" />;
      default:
        return <File className="w-4 h-4 text-muted-foreground" />;
    }
  };

  if (!isExpanded) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleExpand}
        className="text-muted-foreground hover:text-primary"
        aria-label={t('common.search')}
      >
        <Search className="w-5 h-5" />
      </Button>
    );
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', disableClose ? '' : 'max-w-[600px]')}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          className="pl-9 pr-9"
        />
        {!disableClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border bg-popover shadow-lg">
          <ScrollArea className="max-h-[400px]">
            <div className="p-1">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  onClick={() => handleSelect(suggestion)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-sm text-left hover:bg-accent transition-colors"
                >
                  {getTypeIcon(suggestion.type)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{suggestion.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{suggestion.path}</div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {loading && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border bg-popover shadow-lg p-4">
          <span className="text-sm text-muted-foreground">{t('search.searching')}</span>
        </div>
      )}
    </div>
  );
};
