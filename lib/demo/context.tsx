'use client';

/**
 * DemoModeContext — workspace-level flag for ?demo=<key> mode.
 *
 * When active the UI is read-only: the right-rail shows a pre-cached lap
 * from lib/demo/fixtures instead of a live Convex subscription. A small
 * "demo" badge appears in the header.
 *
 * Usage:
 *   1. The workspace page reads the `demo` search-param and wraps the shell
 *      with <DemoModeProvider demoKey="eightsleep">.
 *   2. Components call useDemoMode() to get { active, demoKey, lap }.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DEMO_FIXTURES, type DemoLap } from './fixtures';

export interface DemoModeValue {
  /** True when a valid ?demo=<key> param is active. */
  active: boolean;
  /** The key from the query param (e.g. "eightsleep"). */
  demoKey: string | null;
  /** The pre-cached lap for this demo key, or null if not found. */
  lap: DemoLap | null;
}

const DemoModeContext = createContext<DemoModeValue>({
  active: false,
  demoKey: null,
  lap: null,
});

export interface DemoModeProviderProps {
  demoKey: string | null;
  children: ReactNode;
}

export function DemoModeProvider({ demoKey, children }: DemoModeProviderProps) {
  const value = useMemo<DemoModeValue>(() => {
    if (!demoKey) return { active: false, demoKey: null, lap: null };
    const lap = DEMO_FIXTURES[demoKey] ?? null;
    return { active: lap !== null, demoKey, lap };
  }, [demoKey]);

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode(): DemoModeValue {
  return useContext(DemoModeContext);
}
