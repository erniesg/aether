'use client';

import { useRuns } from '@/lib/store/runs';
import { cn } from '@/lib/utils/cn';

function formatLatency(ms?: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortPrompt(prompt: string): string {
  return prompt.length > 50 ? prompt.slice(0, 47) + '…' : prompt;
}

export function ActionLog() {
  const runs = useRuns();

  if (runs.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <span className="font-caption text-ink-dim">no runs yet · generate to populate</span>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {runs.map((run) => (
        <li
          key={run.id}
          className={cn(
            'rounded-sm border p-2 transition-colors duration-fast',
            run.status === 'running' && 'animate-pulse border-accent/50 bg-accent/5',
            run.status === 'ok' && 'border-border-soft bg-surface-panel',
            run.status === 'error' && 'border-signal-error/30 bg-signal-error/5'
          )}
        >
          <div className="flex items-start gap-2">
            {run.imageUrl ? (
              <img
                src={run.imageUrl}
                alt={shortPrompt(run.prompt)}
                className="h-12 w-12 shrink-0 rounded-xs border border-border-soft object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xs border border-border-soft bg-surface-panel-muted font-caption text-ink-faint">
                {run.status === 'running' ? '…' : run.status === 'error' ? '!' : '—'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-1">
                <span className="truncate font-caption text-ink">{shortPrompt(run.rewrittenPrompt ?? run.prompt)}</span>
                <span className="shrink-0 font-caption text-ink-faint">{formatLatency(run.latencyMs)}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1 font-caption text-ink-dim">
                <span>{run.provider}</span>
                {run.model ? (
                  <>
                    <span className="text-ink-faint">·</span>
                    <span className="truncate">{run.model}</span>
                  </>
                ) : null}
                {run.aspectRatio ? (
                  <>
                    <span className="text-ink-faint">·</span>
                    <span>{run.aspectRatio}</span>
                  </>
                ) : null}
              </div>
              {run.status === 'error' && run.error ? (
                <div className="mt-1 line-clamp-2 font-caption text-signal-error">{run.error}</div>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
