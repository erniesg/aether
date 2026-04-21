'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Rail-level state: which section is currently expanded. Exactly one or none.
 * Used by both left and right rails; keyed by rail identity to avoid collisions.
 */

type RailState = {
  openSection: string | null;
  toggle: (key: string) => void;
  close: () => void;
};

const RailContext = createContext<RailState | null>(null);

export function RailProvider({ children }: { children: ReactNode }) {
  const [openSection, setOpenSection] = useState<string | null>(null);

  const toggle = useCallback((key: string) => {
    setOpenSection((current) => (current === key ? null : key));
  }, []);

  const close = useCallback(() => setOpenSection(null), []);

  const value = useMemo<RailState>(() => ({ openSection, toggle, close }), [openSection, toggle, close]);

  return <RailContext.Provider value={value}>{children}</RailContext.Provider>;
}

export function useRail(): RailState {
  const ctx = useContext(RailContext);
  if (!ctx) throw new Error('useRail must be used inside <RailProvider>');
  return ctx;
}
