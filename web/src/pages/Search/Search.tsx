import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { SearchBar } from '../../components/SearchBar/SearchBar';
import { useEditor } from '../../context/EditorContext';
import { getObjectById } from '../../services/api';
import { SearchSuggestion } from '../../types';

export const Search: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openFile } = useEditor();

  const handleSelectResult = async (suggestion: SearchSuggestion) => {
    if (suggestion.type === 'directory') {
      navigate(`/workspace?path=${encodeURIComponent(suggestion.path)}`);
    } else {
      const fileItem = await getObjectById(suggestion.id);
      await openFile(fileItem);
      navigate('/workspace');
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <SearchIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-semibold">{t('search.title')}</h1>
          <p className="text-muted-foreground">
            {t('search.description')}
          </p>
        </div>
        
        <SearchBar
          defaultExpanded
          disableClose
          onSelectResult={handleSelectResult}
        />
      </div>
    </div>
  );
};
