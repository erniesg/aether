'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export const AETHER_THEMES = ['light', 'dark', 'synth'] as const;
export type Theme = (typeof AETHER_THEMES)[number];

export type ThemeMode = Theme | 'system';

const STORAGE_KEY = 'aether.theme';

type ThemeContextValue = {
  theme: Theme;
  mode: ThemeMode;
  setMode: (next: ThemeMode) => void;
  cycle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(mode: ThemeMode): Theme {
  if (mode === 'system') {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'synth' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage can throw in private mode; fall through
  }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [theme, setTheme] = useState<Theme>('light');

  // Hydrate on mount (SSR renders default; client applies persisted pref)
  useEffect(() => {
    const storedMode = readStoredMode();
    setModeState(storedMode);
    const resolved = resolveTheme(storedMode);
    setTheme(resolved);
    document.documentElement.setAttribute('data-theme', resolved);
  }, []);

  // React to system preference changes when mode === 'system'
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const resolved: Theme = mql.matches ? 'dark' : 'light';
      setTheme(resolved);
      document.documentElement.setAttribute('data-theme', resolved);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    const resolved = resolveTheme(next);
    setTheme(resolved);
    document.documentElement.setAttribute('data-theme', resolved);
  }, []);

  const cycle = useCallback(() => {
    const order: ThemeMode[] = ['light', 'dark', 'synth', 'system'];
    const idx = order.indexOf(mode);
    const next = order[(idx + 1) % order.length];
    setMode(next);
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, setMode, cycle }),
    [theme, mode, setMode, cycle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}
