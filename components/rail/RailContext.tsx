'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Rail-level state: which section is currently expanded. Exactly one or none.
 * Used by both left and right rails; keyed by rail identity to avoid collisions.
 *
 * Dismissal rules (restraint — UI should dismiss when the creator's attention
 * leaves it, not stay glued open):
 *   - clicking the section icon again closes it
 *   - pressing Escape closes whatever is open
 *   - clicking anywhere outside the rail or its flyout closes it
 *   - opening a different section within the same rail replaces what was open
 */

type RailState = {
  openSection: string | null;
  toggle: (key: string) => void;
  close: () => void;
  /**
   * Called by each RailSection to register its flyout node so the outside-
   * click detector knows what counts as "inside."
   */
  registerFlyout: (key: string, node: HTMLElement | null) => void;
  railRef: React.RefObject<HTMLElement | null>;
};

const RailContext = createContext<RailState | null>(null);

export function RailProvider({ children }: { children: ReactNode }) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const flyoutsRef = useRef<Map<string, HTMLElement>>(new Map());
  const railRef = useRef<HTMLElement | null>(null);

  const toggle = useCallback((key: string) => {
    setOpenSection((current) => (current === key ? null : key));
  }, []);

  const close = useCallback(() => setOpenSection(null), []);

  const registerFlyout = useCallback((key: string, node: HTMLElement | null) => {
    if (node) flyoutsRef.current.set(key, node);
    else flyoutsRef.current.delete(key);
  }, []);

  useEffect(() => {
    if (!openSection) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const insideRail = railRef.current?.contains(target) ?? false;
      if (insideRail) return;
      for (const node of flyoutsRef.current.values()) {
        if (node.contains(target)) return;
      }
      close();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [openSection, close]);

  const value = useMemo<RailState>(
    () => ({ openSection, toggle, close, registerFlyout, railRef }),
    [openSection, toggle, close, registerFlyout]
  );

  return <RailContext.Provider value={value}>{children}</RailContext.Provider>;
}

export function useRail(): RailState {
  const ctx = useContext(RailContext);
  if (!ctx) throw new Error('useRail must be used inside <RailProvider>');
  return ctx;
}
