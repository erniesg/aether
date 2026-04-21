'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { useRuns } from '@/lib/store/runs';
import { cn } from '@/lib/utils/cn';

/**
 * A thin status line under the composer. Reads the top run and tells the
 * creator what state the system is in: generating, landed, errored, or idle.
 * Keeps the demo readable during the ~9s wait while Claude + the provider
 * round-trip.
 */
export function ComposerStatus() {
  const runs = useRuns();
  const top = runs[0];
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!top || top.status !== 'running') return;
    const start = top.startedAt;
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [top?.id, top?.status, top?.startedAt]);

  if (!top) {
    return (
      <div className="flex h-6 items-center gap-2 border-t border-border-soft bg-surface-bg-muted px-4 font-caption text-ink-faint">
        <Sparkles size={10} strokeWidth={2} className="text-ink-faint" />
        idle · type a prompt to begin
      </div>
    );
  }

  if (top.status === 'running') {
    return (
      <div className="flex h-6 items-center gap-2 border-t border-accent/30 bg-accent/5 px-4 font-caption text-accent">
        <Loader2 size={10} strokeWidth={2} className="animate-spin" />
        generating · {elapsed}s
      </div>
    );
  }

  if (top.status === 'ok') {
    return (
      <div className="flex h-6 items-center gap-2 border-t border-signal-ok/30 bg-signal-ok/5 px-4 font-caption text-signal-ok">
        <CheckCircle2 size={10} strokeWidth={2} />
        placed on canvas · {top.provider}
        {top.model ? ` · ${top.model}` : ''}
        {top.latencyMs ? ` · ${(top.latencyMs / 1000).toFixed(1)}s` : ''}
      </div>
    );
  }

  return (
    <div
      className="flex h-6 items-center gap-2 border-t border-signal-error/30 bg-signal-error/5 px-4 font-caption text-signal-error"
      role="alert"
    >
      <AlertCircle size={10} strokeWidth={2} />
      <span className="truncate">error · {top.error}</span>
    </div>
  );
}
