'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme/provider';

export default function ThemeToggle() {
  const { theme, toggleTheme, isReady } = useTheme();
  const isDark = theme === 'dark';

  if (!isReady) {
    return <span className="inline-flex h-9 w-9 rounded-lg border border-slate-700 bg-slate-900" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
