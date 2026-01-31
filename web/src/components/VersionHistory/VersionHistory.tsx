import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { 
  X, 
  History, 
  RotateCcw,
  User as UserIcon,
  Loader2,
  ChevronRight,
  Save,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useApp } from '../../context/AppContext';
import { getVersionsByObjectId, getVersionContent, restoreVersion } from '../../services/api';

interface VersionInfo {
  id: string;
  version_number: number;
  size: number;
  message?: string;
  creator?: {
    id: string;
    email: string;
    username: string;
    display_name?: string;
  };
  created_at: string;
}

interface VersionHistoryProps {
  objectId: number;
  objectName: string;
  currentVersion: number;
  onClose: () => void;
  onRestore?: () => void;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  objectId,
  objectName,
  currentVersion,
  onClose,
  onRestore,
}) => {
  const { t } = useTranslation();
  const { theme: themeMode } = useApp();
  const isDarkMode = themeMode === 'dark';
  
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<VersionInfo | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    loadVersions();
  }, [objectId]);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const data = await getVersionsByObjectId(objectId);
      // Sort by version number descending (newest first)
      const sortedVersions = (data.items || []).sort((a: VersionInfo, b: VersionInfo) => 
        b.version_number - a.version_number
      );
      setVersions(sortedVersions);
    } catch (error) {
      console.error('Failed to load versions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVersionClick = async (version: VersionInfo) => {
    setSelectedVersionId(version.id);
    // Optionally load preview
    try {
      setLoadingPreview(true);
      const content = await getVersionContent(version.id);
      setPreviewContent(content);
    } catch (error) {
      console.error('Failed to load version content:', error);
      setPreviewContent(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleRestoreClick = (version: VersionInfo) => {
    setRestoringVersion(version);
    setRestoreDialogOpen(true);
  };

  const confirmRestore = async () => {
    if (!restoringVersion) return;
    
    try {
      setIsRestoring(true);
      await restoreVersion(restoringVersion.id);
      await loadVersions();
      onRestore?.();
    } catch (error) {
      console.error('Failed to restore version:', error);
    } finally {
      setIsRestoring(false);
      setRestoreDialogOpen(false);
      setRestoringVersion(null);
    }
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return t('version.justNow');
    if (minutes < 60) return t('version.minutesAgo', { count: minutes });
    if (hours < 24) return t('version.hoursAgo', { count: hours });
    if (days < 7) return t('version.daysAgo', { count: days });
    
    return formatDateTime(dateStr);
  };

  return (
    <div className={cn(
      'flex flex-col bg-background h-full',
      isDarkMode ? 'bg-zinc-900' : 'bg-white'
    )}>
      {/* Actions */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-2">
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
          onClick={loadVersions}
        >
          {t('version.clearHistory')}
        </Button>
        <span className="text-muted-foreground">|</span>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs text-blue-500 hover:text-blue-600"
        >
          {t('version.saveNow')}
        </Button>
      </div>

      {/* Version list */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t('version.noVersions')}
            </div>
          ) : (
            <div className="space-y-1">
              {versions.map((version, index) => {
                const isLatest = index === 0;
                const isSelected = selectedVersionId === version.id;
                const creatorName = version.creator?.display_name || 
                                   version.creator?.username || 
                                   version.creator?.email?.split('@')[0] || 
                                   'Unknown';
                
                return (
                  <div
                    key={version.id}
                    className={cn(
                      'group px-4 py-2 cursor-pointer transition-colors',
                      'hover:bg-accent/50',
                      isSelected && 'bg-primary/10'
                    )}
                    onClick={() => handleVersionClick(version)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        {/* Date and time */}
                        <div className={cn(
                          'text-sm font-medium',
                          isLatest && 'text-primary'
                        )}>
                          {formatDateTime(version.created_at)}
                          {isLatest && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              ({t('version.previous')})
                            </span>
                          )}
                        </div>
                        
                        {/* Creator info */}
                        <div className="flex items-center gap-1 mt-1">
                          <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                            <UserIcon className="w-2.5 h-2.5 text-white" />
                          </div>
                          <span className="text-xs text-muted-foreground truncate">
                            {creatorName}
                          </span>
                        </div>

                        {/* Message if exists */}
                        {version.message && (
                          <div className="mt-1 text-xs text-muted-foreground truncate">
                            {version.message}
                          </div>
                        )}
                      </div>

                      {/* Restore button */}
                      {!isLatest && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity',
                                'hover:bg-primary/10'
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRestoreClick(version);
                              }}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t('version.restore')}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Restore confirmation dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('version.restoreTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('version.restoreDescription', {
                date: restoringVersion ? formatDateTime(restoringVersion.created_at) : ''
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRestore}
              disabled={isRestoring}
            >
              {isRestoring && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('version.restore')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
