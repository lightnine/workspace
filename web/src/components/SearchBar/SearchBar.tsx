import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  TextField,
  InputAdornment,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Typography,
  IconButton,
  ClickAwayListener
} from '@mui/material';
import { Search as SearchIcon, Folder as FolderIcon, Close as CloseIcon } from '@mui/icons-material';
import { SearchSuggestion, FileType } from '../../types';
import { search } from '../../services/api';

interface SearchBarProps {
  onSelectResult?: (suggestion: SearchSuggestion) => void;
  defaultExpanded?: boolean; // 是否默认展开
  disableClose?: boolean; // 是否禁用关闭功能（用于 Search 页面）
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSelectResult, defaultExpanded = false, disableClose = false }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.trim().length > 0) {
      setLoading(true);
      const timer = setTimeout(async () => {
        try {
          const results = await search(query);
          setSuggestions(results);
          setShowSuggestions(true);
        } catch (error) {
          console.error('搜索失败:', error);
          setSuggestions([]);
        } finally {
          setLoading(false);
        }
      }, 300); // 防抖

      return () => clearTimeout(timer);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [query]);

  // 处理 ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        handleClose();
      }
      // Ctrl+K / Cmd+K 打开搜索
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

  // 展开时自动聚焦输入框
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  const handleExpand = () => {
    setIsExpanded(true);
  };

  const handleClose = () => {
    if (disableClose) return; // 如果禁用关闭，则不执行关闭操作
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

  const getTypeIcon = (_type: FileType) => {
    return <FolderIcon />;
  };

  // 如果未展开，只显示搜索图标按钮
  if (!isExpanded) {
    return (
      <IconButton
        onClick={handleExpand}
        sx={{
          color: 'text.secondary',
          '&:hover': {
            color: 'primary.main',
            bgcolor: 'action.hover'
          }
        }}
        aria-label={t('common.search')}
      >
        <SearchIcon />
      </IconButton>
    );
  }

  // 展开状态：显示完整搜索框
  const searchBox = (
    <Box sx={{ position: 'relative', width: '100%', maxWidth: disableClose ? '100%' : 600 }}>
      <TextField
        inputRef={inputRef}
        fullWidth
        placeholder={t('search.placeholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setShowSuggestions(true);
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
          ...(disableClose ? {} : {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleClose}
                  sx={{ mr: -1 }}
                  aria-label={t('common.close')}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            )
          })
        }}
          sx={{
            backgroundColor: 'background.paper',
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              '&:hover fieldset': {
                borderColor: 'primary.main'
              },
              '&.Mui-focused fieldset': {
                borderColor: 'primary.main',
                borderWidth: 2
              }
            }
          }}
        />
      {showSuggestions && suggestions.length > 0 && (
        <Paper
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            mt: 1,
            maxHeight: 400,
            overflow: 'auto',
            zIndex: 1000,
            boxShadow: 3
          }}
        >
          <List dense>
            {suggestions.map((suggestion) => (
              <ListItem key={suggestion.id} disablePadding>
                <ListItemButton onClick={() => handleSelect(suggestion)}>
                  <ListItemIcon>{getTypeIcon(suggestion.type)}</ListItemIcon>
                  <ListItemText
                    primary={suggestion.name}
                    secondary={suggestion.path}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
      {loading && (
        <Paper
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            mt: 1,
            p: 2,
            zIndex: 1000
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {t('search.searching')}
          </Typography>
        </Paper>
      )}
    </Box>
  );

  // 如果禁用关闭，则不使用 ClickAwayListener
  if (disableClose) {
    return searchBox;
  }

  return (
    <ClickAwayListener onClickAway={handleClose}>
      {searchBox}
    </ClickAwayListener>
  );
};
