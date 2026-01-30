import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Box,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { theme, toggleTheme, language, setLanguage } = useApp();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('settings.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
          {/* 语言设置 */}
          <FormControl fullWidth>
            <InputLabel>{t('settings.language')}</InputLabel>
            <Select
              value={language}
              label={t('settings.language')}
              onChange={(e) => setLanguage(e.target.value as 'zh' | 'en')}
            >
              <MenuItem value="zh">{t('settings.chinese')}</MenuItem>
              <MenuItem value="en">{t('settings.english')}</MenuItem>
            </Select>
            <FormHelperText>{t('settings.languageDesc')}</FormHelperText>
          </FormControl>

          {/* 主题设置 */}
          <FormControl>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('settings.theme')}
            </Typography>
            <RadioGroup
              value={theme}
              onChange={toggleTheme}
            >
              <FormControlLabel
                value="light"
                control={<Radio />}
                label={t('settings.light')}
              />
              <FormControlLabel
                value="dark"
                control={<Radio />}
                label={t('settings.dark')}
              />
            </RadioGroup>
            <FormHelperText>{t('settings.themeDesc')}</FormHelperText>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
};
