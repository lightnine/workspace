import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  File, 
  Folder, 
  FileCode, 
  FolderPlus, 
  Upload, 
  Clock,
  MoreVertical 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { RecentItem } from '../../types';
import { getRecents, getObjectById } from '../../services/api';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useEditor } from '../../context/EditorContext';

export const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openCreateDialog } = useWorkspace();
  const { openFile } = useEditor();
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRecents = async () => {
      const data = await getRecents();
      setRecents(data);
      setLoading(false);
    };

    loadRecents();
  }, []);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'directory':
        return <Folder className="w-5 h-5 text-blue-500" />;
      case 'notebook':
        return <FileCode className="w-5 h-5 text-orange-500" />;
      default:
        return <File className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
  };

  const handleCreateNotebook = () => {
    openCreateDialog('notebook');
    navigate('/workspace');
  };

  const handleCreateFolder = () => {
    openCreateDialog('directory');
    navigate('/workspace');
  };

  const handleOpenRecent = async (item: RecentItem) => {
    if (item.type === 'directory') {
      navigate(`/workspace?path=${encodeURIComponent(item.filePath)}`);
    } else {
      const fileItem = await getObjectById(item.fileId);
      await openFile(fileItem);
      navigate('/workspace');
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Welcome Section */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
            {t('dashboard.welcome')}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t('dashboard.subtitle')}
          </p>
        </div>

        {/* Quick Actions */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-violet-500/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('dashboard.quickStart')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button 
                onClick={handleCreateNotebook}
                className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
              >
                <FileCode className="w-4 h-4 mr-2" />
                {t('dashboard.newNotebook')}
              </Button>
              <Button variant="outline" onClick={handleCreateFolder}>
                <FolderPlus className="w-4 h-4 mr-2" />
                {t('dashboard.newFolder')}
              </Button>
              <Button variant="outline" onClick={() => navigate('/workspace')}>
                <Upload className="w-4 h-4 mr-2" />
                {t('dashboard.uploadFile')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Files */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {t('dashboard.recentFiles')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">
                {t('common.loading')}
              </div>
            ) : recents.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                {t('dashboard.noRecentFiles')}
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="divide-y divide-border">
                  {recents.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleOpenRecent(item)}
                      className="w-full flex items-center gap-4 px-6 py-4 hover:bg-accent transition-colors text-left"
                    >
                      {getTypeIcon(item.type)}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{item.fileName}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {item.filePath}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(item.accessedAt)}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
