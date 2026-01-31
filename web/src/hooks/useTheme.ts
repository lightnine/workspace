import { useEffect } from 'react';
import { useApp } from '@/context/AppContext';

export function useTheme() {
  const { theme, setTheme } = useApp();

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  return { theme, setTheme, isDark: theme === 'dark' };
}
