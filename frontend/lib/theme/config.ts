export type AppTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'kontrahent-theme';
export const DEFAULT_THEME: AppTheme = 'dark';

export const THEME_COLORS: Record<AppTheme, string> = {
  dark: '#0d1117',
  light: '#f8fafc',
};
