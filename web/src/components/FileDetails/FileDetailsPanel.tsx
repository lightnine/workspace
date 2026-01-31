import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { 
  X, 
  FileText, 
  History, 
  Info,
  User as UserIcon,
  Calendar,
  HardDrive,
  Globe,
  Lock,
  Users,
  GitBranch,
  Star,
  MoreHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { FileItem } from '../../types';
import { useApp } from '../../context/AppContext';
import { VersionHistory } from '../VersionHistory/VersionHistory';

interface FileDetailsPanelProps {
  file: FileItem | null;
  onClose: () => void;
  onVersionRestore?: () => void;
}

interface Permission {
  id: string;
  name: string;
  type: 'user' | 'group';
  permission: 'Can Manage' | 'Can View' | 'Can Edit';
}

export const FileDetailsPanel: React.FC<FileDetailsPanelProps> = ({
  file,
  onClose,
  onVersionRestore,
}) => {
  const { t } = useTranslation();
  const { theme: themeMode, user: currentUser } = useApp();
  const isDarkMode = themeMode === 'dark';
  
  const [activeTab, setActiveTab] = useState('details');
  const [permissions, setPermissions] = useState<Permission[]>([
    { id: '1', name: currentUser?.email || 'owner', type: 'user', permission: 'Can Manage' },
    { id: '2', name: 'Admins', type: 'group', permission: 'Can Manage' },
  ]);

  if (!file) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
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

  const getFileTypeLabel = (type: string) => {
    switch (type) {
      case 'notebook': return 'Notebook';
      case 'python': return 'Python';
      case 'sql': return 'SQL';
      case 'markdown': return 'Markdown';
      case 'directory': return 'Directory';
      default: return 'File';
    }
  };

  const getLanguageFromName = (name: string) => {
    if (name.endsWith('.py')) return 'Python';
    if (name.endsWith('.sql')) return 'SQL';
    if (name.endsWith('.ipynb')) return 'SQL'; // Based on image showing SQL for notebook
    if (name.endsWith('.md')) return 'Markdown';
    return 'Unknown';
  };

  return (
    <div className={cn(
      'w-[320px] min-w-[320px] flex flex-col border-l border-border bg-background',
      isDarkMode ? 'bg-zinc-900' : 'bg-white'
    )}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{t('fileDetails.title')}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* File Name and Path */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-start gap-2">
          <FileText className="w-5 h-5 text-orange-500 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate flex items-center gap-2">
              {file.name}
              <Star className="w-4 h-4 text-muted-foreground hover:text-yellow-500 cursor-pointer" />
            </h3>
            <p className="text-xs text-muted-foreground truncate mt-1">
              {file.path}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b h-auto p-0 bg-transparent">
          <TabsTrigger 
            value="details" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 text-xs"
          >
            <Info className="w-3.5 h-3.5 mr-1.5" />
            {t('fileDetails.details')}
          </TabsTrigger>
          <TabsTrigger 
            value="history" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 text-xs"
          >
            <History className="w-3.5 h-3.5 mr-1.5" />
            {t('fileDetails.history')}
          </TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-6">
              {/* About this notebook */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {t('fileDetails.about')}
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('fileDetails.owner')}</span>
                    <span className="text-sm">{file.creator?.display_name || file.creator?.username || file.creator?.email || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('fileDetails.created')}</span>
                    <div className="text-right">
                      <div className="text-sm">{formatDate(file.created_at)}</div>
                      <div className="text-xs text-muted-foreground">
                        by {file.creator?.display_name || file.creator?.username || 'Unknown'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('fileDetails.language')}</span>
                    <span className="text-sm">{getLanguageFromName(file.name)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('fileDetails.size')}</span>
                    <span className="text-sm">{formatFileSize(file.size)}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Permissions */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {t('fileDetails.permissions')}
                </h4>
                <div className="space-y-2">
                  {permissions.map((perm) => (
                    <div key={perm.id} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        {perm.type === 'user' ? (
                          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                            <UserIcon className="w-3.5 h-3.5 text-white" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                            <Users className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                        <span className="text-sm">{perm.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{perm.permission}</span>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="w-full mt-3">
                  <Lock className="w-3.5 h-3.5 mr-2" />
                  {t('fileDetails.share')}
                </Button>
              </div>

              <Separator />

              {/* Lineage */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {t('fileDetails.lineage')}
                </h4>
                <div className="rounded-lg border border-dashed border-border p-4 text-center">
                  <GitBranch className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {t('fileDetails.noLineage')}
                  </p>
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="flex-1 mt-0 overflow-hidden">
          <VersionHistory
            objectId={file.id}
            objectName={file.name}
            currentVersion={file.current_version}
            onClose={() => setActiveTab('details')}
            onRestore={onVersionRestore}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
