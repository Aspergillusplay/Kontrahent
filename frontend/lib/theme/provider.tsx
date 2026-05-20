'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppTheme, DEFAULT_THEME, THEME_COLORS, THEME_STORAGE_KEY } from './config';

type ThemeContextValue = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  isReady: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function isAppTheme(value: unknown): value is AppTheme {
  return value === 'dark' || value === 'light';
}

function resolveSystemTheme(): AppTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: AppTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  let themeMeta = document.querySelector('meta[name="theme-color"]');
  if (!themeMeta) {
    themeMeta = document.createElement('meta');
    themeMeta.setAttribute('name', 'theme-color');
    document.head.appendChild(themeMeta);
  }
  themeMeta.setAttribute('content', THEME_COLORS[theme]);
}

function persistThemePreference(theme: AppTheme) {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  document.cookie = `${THEME_STORAGE_KEY}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(DEFAULT_THEME);
  const [persistTheme, setPersistTheme] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initialTheme = isAppTheme(savedTheme) ? savedTheme : resolveSystemTheme();
    setThemeState(initialTheme);
    setPersistTheme(isAppTheme(savedTheme));
    applyTheme(initialTheme);
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    applyTheme(theme);
    if (persistTheme) {
      persistThemePreference(theme);
    }
  }, [theme, isReady, persistTheme]);

  useEffect(() => {
    if (!isReady) return;
    if (persistTheme) return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setThemeState(media.matches ? 'dark' : 'light');

    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [isReady, persistTheme]);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    setPersistTheme(true);
    persistThemePreference(nextTheme);
    setThemeState(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setPersistTheme(true);
    setThemeState((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme, isReady }),
    [theme, setTheme, toggleTheme, isReady],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
