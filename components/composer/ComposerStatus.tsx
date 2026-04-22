'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useRuns } from '@/lib/store/runs';
import { useRunDetails } from '@/lib/store/runDetails';
import { cn } from '@/lib/utils/cn';

const STEP_LABELS = {
  prepared: 'prepared',
  sending: 'sending request',
  awaiting: 'awaiting provider',
  received: 'response received',
  parsing: 'parsing result',
  placing: 'placing on canvas',
  done: 'done',
} as const;

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelative(startedAt: number, at: number): string {
  return `${Math.max(0, Math.floor((at - startedAt) / 1000))}s`;
}

function summarizeTarget(provider?: string, model?: string): string | null {
  const bits = [provider && provider !== 'auto' ? provider : null, model || null].filter(Boolean);
  return bits.length > 0 ? bits.join(' · ') : null;
}

/**
 * A thin status line under the composer. Reads the top run and tells the
 * creator what state the system is in: generating, landed, errored, or idle.
 * Keeps the demo readable during the ~9s wait while Claude + the provider
 * round-trip.
 */
export function ComposerStatus() {
  const runs = useRuns();
  const top = runs[0];
  const details = useRunDetails(top?.id);
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!top || top.status !== 'running') return;
    const start = top.startedAt;
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [top?.id, top?.status, top?.startedAt]);

  useEffect(() => {
    setExpanded(false);
  }, [top?.id]);

  const summaryTarget = useMemo(
    () => summarizeTarget(details?.providerHint ?? top?.provider, details?.modelHint ?? top?.model),
    [details?.modelHint, details?.providerHint, top?.model, top?.provider]
  );

  const activityPanel =
    top && expanded && details && details.activities.length > 0 ? (
      <div className="absolute bottom-full left-0 right-0 z-20 border-t border-border-soft bg-surface-panel shadow-xl">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="font-mono text-[10px] uppercase tracking-wide text-ink-dim">
            activity
          </span>
          {summaryTarget ? (
            <span className="truncate font-caption text-ink-dim">{summaryTarget}</span>
          ) : null}
        </div>
        <ol className="flex max-h-44 flex-col gap-1 overflow-y-auto px-4 pb-3">
          {details.activities.map((activity) => (
            <li key={activity.id} className="grid grid-cols-[40px_minmax(0,1fr)] gap-2 text-xs">
              <span className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                {formatRelative(top.startedAt, activity.at)}
              </span>
              <div className="min-w-0">
                <div
                  className={cn(
                    'truncate font-caption',
                    activity.tone === 'ok' && 'text-signal-ok',
                    activity.tone === 'error' && 'text-signal-error',
                    activity.tone === 'neutral' && 'text-ink'
                  )}
                >
                  {activity.title}
                </div>
                {activity.detail ? (
                  <div className="truncate font-caption text-ink-dim">{activity.detail}</div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    ) : null;

  if (!top) {
    return (
      <div className="flex h-6 items-center gap-2 border-t border-border-soft bg-surface-bg-muted px-4 font-caption text-ink-faint">
        <Sparkles size={10} strokeWidth={2} className="text-ink-faint" />
        idle · type a prompt to begin
      </div>
    );
  }

  if (top.status === 'running') {
    const stepLabel = top.step ?? 'starting';
    return (
      <div className="relative">
        {activityPanel}
        <div className="flex h-6 items-center justify-between border-t border-accent/30 bg-accent/5 px-4 font-caption text-accent">
          <div className="flex min-w-0 items-center gap-2 truncate">
            <Loader2 size={10} strokeWidth={2} className="animate-spin shrink-0" />
            <span className="truncate">
              generating
              {summaryTarget ? ` · ${summaryTarget}` : ''}
              {' · '}
              {STEP_LABELS[stepLabel as keyof typeof STEP_LABELS] ?? stepLabel}
              {' · '}
              {elapsed}s
            </span>
          </div>
          <button
            type="button"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-xs text-accent/80 hover:bg-accent/10 hover:text-accent"
            aria-label={expanded ? 'hide activity' : 'show activity'}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        </div>
      </div>
    );
  }

  if (top.status === 'ok') {
    return (
      <div className="relative">
        {activityPanel}
        <div className="flex h-6 items-center justify-between border-t border-signal-ok/30 bg-signal-ok/5 px-4 font-caption text-signal-ok">
          <div className="flex min-w-0 items-center gap-2 truncate">
            <CheckCircle2 size={10} strokeWidth={2} className="shrink-0" />
            <span className="truncate">
              placed on canvas
              {summaryTarget ? ` · ${summaryTarget}` : ''}
              {top.latencyMs ? ` · ${formatElapsed(top.latencyMs)}` : ''}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-xs text-signal-ok/80 hover:bg-signal-ok/10 hover:text-signal-ok"
            aria-label={expanded ? 'hide activity' : 'show activity'}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {activityPanel}
      <div
        className="flex h-6 items-center justify-between border-t border-signal-error/30 bg-signal-error/5 px-4 font-caption text-signal-error"
        role="alert"
      >
        <div className="flex min-w-0 items-center gap-2 truncate">
          <AlertCircle size={10} strokeWidth={2} className="shrink-0" />
          <span className="truncate">
            error
            {summaryTarget ? ` · ${summaryTarget}` : ''}
            {top.error ? ` · ${top.error}` : ''}
          </span>
        </div>
        <button
          type="button"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-xs text-signal-error/80 hover:bg-signal-error/10 hover:text-signal-error"
          aria-label={expanded ? 'hide activity' : 'show activity'}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
      </div>
    </div>
  );
}
