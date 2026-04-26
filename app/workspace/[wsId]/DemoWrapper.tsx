'use client';

/**
 * DemoWrapper — thin client component that reads ?demo= from the browser URL
 * and injects a DemoModeProvider around the workspace shell.
 *
 * This cannot be done in the Server Component page because useSearchParams()
 * requires a client context. We use window.location on first render (safe
 * because this component is always client-side) via a synchronous read, which
 * avoids a Suspense boundary for such a simple param.
 */

import { type ReactNode } from 'react';
import { DemoModeProvider } from '@/lib/demo/context';

function readDemoKey(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('demo');
}

export function DemoWrapper({ children }: { children: ReactNode }) {
  // Intentionally NOT using useState/useEffect here — readDemoKey() is stable
  // within a page session (the user doesn't change ?demo= without a navigation).
  // This gives us a synchronous read with zero flicker.
  const demoKey = readDemoKey();
  return <DemoModeProvider demoKey={demoKey}>{children}</DemoModeProvider>;
}
