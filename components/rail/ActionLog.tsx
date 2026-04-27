'use client';

import { useMemo, useState } from 'react';
import { Pin } from 'lucide-react';
import { AssetRecordType, createShapeId } from 'tldraw';
import { useRuns, STALE_ABORT_ERROR, type CapabilityRunRecord } from '@/lib/store/runs';
import { useEditorRef } from '@/lib/store/editor-ref';
import { cn } from '@/lib/utils/cn';

function formatLatency(ms?: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortPrompt(prompt: string): string {
  return prompt.length > 50 ? prompt.slice(0, 47) + '…' : prompt;
}

function relativeTime(ts: number): string {
  const delta = Math.max(0, Date.now() - ts);
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export interface ActionLogProps {
  /** Fires when the creator clicks the pin-as-skill affordance on a completed run. */
  onPin?: (run: CapabilityRunRecord) => void;
}

function canPinRun(run: CapabilityRunRecord): boolean {
  return run.tool !== 'capability-factory';
}

export function ActionLog({ onPin }: ActionLogProps = {}) {
  const allRuns = useRuns();
  const { editor } = useEditorRef();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<Record<string, 'loading' | 'loaded' | 'error'>>({});

  const runs = useMemo(
    () => allRuns.filter((r) => r.error !== STALE_ABORT_ERROR),
    [allRuns]
  );

  if (runs.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <span className="font-caption text-ink-dim">no runs yet · generate to populate</span>
      </div>
    );
  }

  const handleLoadToCanvas = (run: CapabilityRunRecord) => {
    if (!editor || !run.imageUrl) return;
    setLoadStatus((s) => ({ ...s, [run.id]: 'loading' }));
    try {
      // Drop the cached image at the current camera centre so it lands
      // visibly. Width / height best-effort from the run record; default
      // 1024² which tldraw will scale on display.
      const w = 1024;
      const h = 1024;
      const screenCenter = editor.getViewportScreenCenter();
      const center = editor.screenToPage({ x: screenCenter.x, y: screenCenter.y });
      const assetId = AssetRecordType.createId();
      editor.createAssets([
        {
          id: assetId,
          type: 'image',
          typeName: 'asset',
          props: {
            name: `cached run ${run.id}`,
            src: run.imageUrl,
            w,
            h,
            mimeType: 'image/png',
            isAnimated: false,
          },
          meta: {
            aetherSource: 'action-log-load',
            aetherRunId: run.id,
            aetherProvider: run.provider,
            aetherModel: run.model,
          },
        },
      ]);
      const shapeId = createShapeId();
      editor.createShape({
        id: shapeId,
        type: 'image',
        x: center.x - w / 2,
        y: center.y - h / 2,
        props: { assetId, w, h },
        meta: {
          aetherSource: 'action-log-load',
          aetherRunId: run.id,
        },
      } as Parameters<typeof editor.createShape>[0]);
      editor.select(shapeId as never);
      editor.zoomToSelection({ animation: { duration: 300 } });
      setLoadStatus((s) => ({ ...s, [run.id]: 'loaded' }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[action-log] load to canvas failed', err);
      setLoadStatus((s) => ({ ...s, [run.id]: 'error' }));
    }
  };

  return (
    <ol className="flex flex-col gap-2">
      {runs.map((run) => {
        const isExpanded = expandedId === run.id;
        const status = loadStatus[run.id];
        return (
          <li
            key={run.id}
            className={cn(
              'group relative rounded-sm border transition-colors duration-fast',
              run.status === 'running' && 'animate-pulse border-accent/50 bg-accent/5',
              run.status === 'ok' && 'border-border-soft bg-surface-panel',
              run.status === 'error' && 'border-signal-error/30 bg-signal-error/5'
            )}
          >
            <button
              type="button"
              onClick={() =>
                setExpandedId((current) => (current === run.id ? null : run.id))
              }
              className="block w-full p-2 text-left"
              title="click to expand details"
            >
              <div className="flex items-start gap-2">
                {run.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
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
                    <span className="truncate font-caption text-ink">
                      {isExpanded ? '▾ ' : '▸ '}
                      {shortPrompt(run.rewrittenPrompt ?? run.prompt)}
                    </span>
                    <span className="shrink-0 font-caption text-ink-faint">
                      {formatLatency(run.latencyMs)}
                    </span>
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
                    <span className="text-ink-faint">·</span>
                    <span>{relativeTime(run.startedAt)}</span>
                  </div>
                  {run.status === 'error' && run.error ? (
                    <div className="mt-1 line-clamp-2 font-caption text-signal-error">
                      {run.error}
                    </div>
                  ) : null}
                </div>
              </div>
            </button>

            {isExpanded ? (
              <div className="border-t border-border-soft bg-surface-panel-muted px-2 py-2 text-xs">
                <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5">
                  <span className="font-caption text-[10px] uppercase text-ink-faint">
                    tool
                  </span>
                  <span className="font-mono text-ink">{run.tool}</span>

                  <span className="font-caption text-[10px] uppercase text-ink-faint">
                    prompt
                  </span>
                  <span className="font-mono text-[11px] text-ink whitespace-pre-wrap break-words">
                    {run.prompt || '(empty)'}
                  </span>

                  {run.rewrittenPrompt && run.rewrittenPrompt !== run.prompt ? (
                    <>
                      <span className="font-caption text-[10px] uppercase text-ink-faint">
                        rewritten
                      </span>
                      <span className="font-mono text-[11px] text-ink whitespace-pre-wrap break-words">
                        {run.rewrittenPrompt}
                      </span>
                    </>
                  ) : null}

                  {run.rationale ? (
                    <>
                      <span className="font-caption text-[10px] uppercase text-ink-faint">
                        rationale
                      </span>
                      <span className="font-mono text-[11px] text-ink-dim whitespace-pre-wrap break-words">
                        {run.rationale}
                      </span>
                    </>
                  ) : null}

                  {run.imageUrl ? (
                    <>
                      <span className="font-caption text-[10px] uppercase text-ink-faint">
                        output
                      </span>
                      <a
                        href={run.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate font-mono text-[10px] text-ink-dim hover:text-ink"
                      >
                        {run.imageUrl.startsWith('data:')
                          ? `data:${run.imageUrl.slice(5, 30)}…(${Math.round(run.imageUrl.length / 1024)}KB)`
                          : run.imageUrl.slice(0, 80) + (run.imageUrl.length > 80 ? '…' : '')}
                      </a>
                    </>
                  ) : null}

                  {run.entryRef ? (
                    <>
                      <span className="font-caption text-[10px] uppercase text-ink-faint">
                        entry
                      </span>
                      <span className="font-mono text-[10px] text-ink-dim">
                        {run.entryRef.kind}:{run.entryRef.id}@v{run.entryRef.version}
                      </span>
                    </>
                  ) : null}

                  {run.error ? (
                    <>
                      <span className="font-caption text-[10px] uppercase text-ink-faint">
                        error
                      </span>
                      <span className="font-mono text-[11px] text-signal-error whitespace-pre-wrap break-words">
                        {run.error}
                      </span>
                    </>
                  ) : null}
                </div>

                {run.imageUrl && editor ? (
                  <div className="mt-2 flex items-center gap-2 border-t border-border-soft pt-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadToCanvas(run);
                      }}
                      className={cn(
                        'inline-flex h-6 items-center rounded-sm border border-border-soft bg-surface-panel px-2',
                        'font-mono text-[10px] uppercase tracking-wide text-ink',
                        'hover:border-accent hover:text-accent transition-colors'
                      )}
                    >
                      {status === 'loading'
                        ? 'loading…'
                        : status === 'loaded'
                        ? '✓ loaded'
                        : status === 'error'
                        ? 'load failed'
                        : 'load to canvas'}
                    </button>
                    <a
                      href={run.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-caption text-[10px] text-ink-dim hover:text-ink"
                    >
                      open in new tab ↗
                    </a>
                  </div>
                ) : null}
              </div>
            ) : null}

            {run.status === 'ok' && onPin && canPinRun(run) ? (
              <button
                type="button"
                aria-label={`pin as skill · ${shortPrompt(run.rewrittenPrompt ?? run.prompt)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onPin(run);
                }}
                className={cn(
                  'absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-xs',
                  'border border-border-soft bg-surface-panel text-ink-dim',
                  'opacity-0 transition-opacity duration-fast ease-quick group-hover:opacity-100 focus-visible:opacity-100',
                  'hover:border-accent hover:text-accent'
                )}
              >
                <Pin size={12} strokeWidth={1.75} />
              </button>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
