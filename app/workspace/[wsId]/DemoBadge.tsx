'use client';

/**
 * DemoBadge — small read-only indicator shown when ?demo=<key> is active.
 *
 * Renders as a fixed chip in the top-right of the viewport, above tldraw chrome
 * (z-[1001]) so it's never obscured. Intentionally minimal per restraint-over-
 * labels (CLAUDE.md hard rule #6).
 */

import { useDemoMode } from '@/lib/demo/context';

export function DemoBadge() {
  const { active, demoKey } = useDemoMode();
  if (!active) return null;

  return (
    <div
      aria-label={`demo mode · ${demoKey} · read-only`}
      data-testid="demo-mode-badge"
      className="pointer-events-none fixed bottom-4 right-4 z-[1001] flex items-center gap-1.5 rounded-pill border border-accent/40 bg-surface-overlay px-2.5 py-1 shadow-sm"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-accent opacity-80" />
      <span className="font-mono text-2xs uppercase tracking-wide text-ink-muted">
        demo · {demoKey}
      </span>
    </div>
  );
}
