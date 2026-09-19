'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { applyTheme, resolveTheme, themeStorageKey, type Theme } from '@/lib/theme';

type ThemeContextValue = { theme: Theme; resolvedTheme: 'dark' | 'light'; setTheme: (theme: Theme) => void };
type ThemeSnapshot = Theme | 'system-dark' | 'system-light';
const ThemeContext = createContext<ThemeContextValue | null>(null);
const themeChangeEvent = 'tahaddi-theme-change';

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem(themeStorageKey) as Theme | null;
  return saved && ['dark', 'light', 'system'].includes(saved) ? saved : 'dark';
}

function getThemeSnapshot(): ThemeSnapshot {
  const theme = getStoredTheme();
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'system-dark' : 'system-light';
}

function subscribeToTheme(onChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const sync = () => {
    if (getStoredTheme() === 'system') applyTheme('system');
    onChange();
  };
  window.addEventListener('storage', sync);
  window.addEventListener(themeChangeEvent, sync);
  media.addEventListener('change', sync);
  return () => {
    window.removeEventListener('storage', sync);
    window.removeEventListener(themeChangeEvent, sync);
    media.removeEventListener('change', sync);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => 'dark');
  const theme: Theme = snapshot.startsWith('system-') ? 'system' : snapshot as Theme;
  const resolvedTheme = snapshot === 'system-dark' ? 'dark' : snapshot === 'system-light' ? 'light' : resolveTheme(theme);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(themeStorageKey, next);
    applyTheme(next);
    window.dispatchEvent(new Event(themeChangeEvent));
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, resolvedTheme]);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}
