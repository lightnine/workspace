import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UserResponse, LoginInput } from '../types';
import { setAccessToken, setRefreshToken, clearTokens, getAccessToken } from '../services/api';
import { login as loginApi, getCurrentUser } from '../services/auth';

type Language = 'zh' | 'en';
type Theme = 'light' | 'dark';

interface AppContextType {
  user: UserResponse | null;
  setUser: (user: UserResponse | null) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  isAuthenticated: boolean;
  currentAppId: string | null;
  login: (input: LoginInput) => Promise<void>;
  logout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [user, setUserState] = useState<UserResponse | null>(null);
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [language, setLanguageState] = useState<Language>(
    (localStorage.getItem('i18nextLng') as Language) || 'zh'
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState(prev => prev === 'light' ? 'dark' : 'light');
  };

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
  };

  useEffect(() => {
    i18n.changeLanguage(language);
  }, [i18n, language]);

  // 初始化时检查认证状态
  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      // 尝试获取当前用户信息
      getCurrentUser()
        .then(userData => {
          setUserState(userData);
          setIsAuthenticated(true);
        })
        .catch(() => {
          // Token 无效，清除
          clearTokens();
          setIsAuthenticated(false);
        });
    }
  }, []);

  const setUser = (userData: UserResponse | null) => {
    setUserState(userData);
    setIsAuthenticated(userData !== null);
  };

  const login = async (input: LoginInput) => {
    const authData = await loginApi(input);
    setAccessToken(authData.access_token);
    setRefreshToken(authData.refresh_token);
    setUser(authData.user);
  };

  const logout = () => {
    clearTokens();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AppContext.Provider value={{ 
      user, 
      setUser, 
      theme,
      setTheme,
      toggleTheme, 
      language, 
      setLanguage,
      isAuthenticated,
      currentAppId: user?.app_id || null,
      login,
      logout
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
