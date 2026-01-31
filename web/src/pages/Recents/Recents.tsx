import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { File, Folder, FileCode, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { RecentItem } from '../../types';
import { getRecents, getObjectById } from '../../services/api';
import { useEditor } from '../../context/EditorContext';

export const Recents: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return t('recents.justNow');
    if (hours < 24) return t('recents.hoursAgo', { count: hours });
    if (days < 7) return t('recents.daysAgo', { count: days });
    return date.toLocaleDateString();
  };

  const handleOpenRecent = async (item: RecentItem) => {
    if (item.type === 'directory') {
      navigate(`/workspace?path=${encodeURIComponent(item.filePath)}`);
    } else {
      const fileItem = await getObjectById(item.fileId);
      // openFile will automatically navigate to the correct URL
      await openFile(fileItem);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            <Clock className="w-6 h-6" />
            {t('recents.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('recents.subtitle')}
          </p>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">
                {t('common.loading')}
              </div>
            ) : recents.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t('recents.empty')}</p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-280px)]">
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
