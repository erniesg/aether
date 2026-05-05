'use client';

import { Images, Languages, Mic2, Send, Sparkles, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ReferenceRecord } from '@/lib/providers/reference/types';
import type { ScheduledPost } from '@/lib/providers/publisher/types';
import type { CapabilityRunRecord } from '@/lib/store/runs';
import { useRunDetails } from '@/lib/store/runDetails';
import { cn } from '@/lib/utils/cn';

type StoryboardFormat = {
  id: string;
  label?: string;
  aspectRatio: string;
};

export interface StoryboardLensProps {
  open: boolean;
  onClose: () => void;
  runs: CapabilityRunRecord[];
  references: ReferenceRecord[];
  formats: StoryboardFormat[];
  scheduledPosts: ScheduledPost[];
  canvasCopyByLocaleFormat: Record<string, Record<string, string>>;
  enabledLocales: string[];
  className?: string;
}

export function StoryboardLens({
  open,
  onClose,
  runs,
  references,
  formats,
  scheduledPosts,
  canvasCopyByLocaleFormat,
  enabledLocales,
  className,
}: StoryboardLensProps) {
  if (!open) return null;

  const latestRuns = runs.slice(0, 4);
  const selectedReferences = references
    .filter((reference) => reference.referenceStatus === 'selected')
    .slice(0, 6);
  const referenceItems =
    selectedReferences.length > 0 ? selectedReferences : references.slice(0, 6);
  const locales = Object.keys(canvasCopyByLocaleFormat);
  const visibleLocales = locales.length > 0 ? locales : enabledLocales;
  const activeLocaleCount =
    visibleLocales.length > 0
      ? visibleLocales.length
      : new Set(scheduledPosts.map((post) => post.locale).filter(Boolean)).size;
  const visiblePosts = scheduledPosts.slice(0, 6);

  return (
    <section
      data-testid="storyboard-lens"
      data-taxonomy="tool"
      aria-label="storyboard lens"
      className={cn(
        'absolute inset-3 z-[900] overflow-hidden rounded-md border border-border bg-surface-panel shadow-lg',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(var(--ink)/0.08)_1px,transparent_0)] [background-size:18px_18px]" />
      <div className="relative z-10 flex h-full flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-soft bg-surface-panel/95 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border-soft bg-surface-panel-muted text-ink">
              <Sparkles size={15} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className="font-caption text-[10px] uppercase text-ink-faint">
                canvas lens
              </div>
              <h2 className="truncate font-display text-lg tracking-tight text-ink">
                Storyboard
              </h2>
            </div>
          </div>
          <button
            type="button"
            data-testid="storyboard-close"
            aria-label="return to canvas"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-sm border border-border-soft bg-surface-panel text-ink-dim transition-colors hover:border-border hover:text-ink"
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] gap-4 overflow-hidden p-4">
          <section className="flex min-w-0 flex-col gap-3 overflow-hidden">
            <div className="grid grid-cols-3 gap-2">
              <StoryboardStat
                icon={<Mic2 size={14} strokeWidth={1.75} />}
                label="voice"
                value={runs.some((run) => run.status === 'running') ? 'generating' : 'ready'}
              />
              <StoryboardStat
                icon={<Images size={14} strokeWidth={1.75} />}
                label="formats"
                value={`${formats.length || 1}`}
              />
              <StoryboardStat
                icon={<Languages size={14} strokeWidth={1.75} />}
                label="locales"
                value={`${activeLocaleCount || 1}`}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-sm border border-border-soft bg-surface-bg/70 p-3">
              {latestRuns.length > 0 ? (
                <div className="grid gap-3">
                  {latestRuns.map((run) => (
                    <RunStoryboardStrip key={run.id} run={run} />
                  ))}
                </div>
              ) : (
                <EmptyStoryboardState />
              )}
            </div>
          </section>

          <aside className="flex min-h-0 flex-col gap-3 overflow-auto">
            <StoryboardPanel title="references" empty="No references selected yet.">
              {referenceItems.length > 0 ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {referenceItems.map((reference) => (
                    <div
                      key={reference.id}
                      data-testid="storyboard-reference"
                      className="overflow-hidden rounded-sm border border-border-soft bg-surface-panel-muted"
                      title={reference.title ?? reference.previewUrl}
                    >
                      <div className="aspect-[4/3] bg-black/5">
                        <img
                          src={reference.previewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </StoryboardPanel>

            <StoryboardPanel title="copy" empty="Editable overlays appear after generation.">
              {visibleLocales.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {visibleLocales.map((locale) => (
                    <span
                      key={locale}
                      data-testid="storyboard-locale-chip"
                      className="rounded-pill border border-border-soft bg-surface-panel-muted px-2 py-1 font-mono text-[10px] uppercase text-ink-dim"
                    >
                      {locale}
                    </span>
                  ))}
                </div>
              ) : null}
            </StoryboardPanel>

            <StoryboardPanel title="publish" empty="Publish previews will stay here.">
              {visiblePosts.length > 0 ? (
                <div className="grid gap-1.5">
                  {visiblePosts.map((post) => (
                    <div
                      key={post.id}
                      data-testid="storyboard-publish-post"
                      data-platform={post.platform}
                      className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-caption text-xs text-ink">
                          {post.platform}
                        </span>
                        <span className="font-mono text-[10px] uppercase text-ink-faint">
                          {post.locale ?? 'default'}
                        </span>
                      </div>
                      <div className="mt-0.5 line-clamp-2 font-caption text-[11px] text-ink-dim">
                        {post.caption || post.hashtags.join(' ')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </StoryboardPanel>
          </aside>
        </main>
      </div>
    </section>
  );
}

function RunStoryboardStrip({ run }: { run: CapabilityRunRecord }) {
  const details = useRunDetails(run.id);
  const frames =
    details?.frames.filter((frame) => frame.status !== 'error' || frame.imageUrl) ?? [];
  const visibleFrames = frames.length > 0 ? frames : run.imageUrl ? [{
    id: 'canvas',
    label: 'Canvas',
    aspectRatio: run.aspectRatio,
    status: run.status === 'ok' ? 'placed' : 'running',
    imageUrl: run.imageUrl,
  }] : [];
  const completed = visibleFrames.filter((frame) => frame.imageUrl).length;
  const total = Math.max(visibleFrames.length, details?.frames.length ?? 0, 1);

  return (
    <article
      data-testid="storyboard-run"
      data-run-status={run.status}
      className="rounded-sm border border-border-soft bg-surface-panel p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-caption text-sm text-ink">
              {run.rewrittenPrompt ?? run.prompt}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 font-mono text-[10px] uppercase text-ink-faint">
            <span>{run.provider || 'auto'}</span>
            {run.model ? <span>{run.model}</span> : null}
            <span>{run.status}</span>
          </div>
        </div>
        <span className="shrink-0 rounded-pill border border-border-soft bg-surface-panel-muted px-2 py-1 font-mono text-[10px] uppercase text-ink-dim">
          {completed}/{total}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {visibleFrames.slice(0, 8).map((frame) => (
          <div
            key={frame.id}
            data-testid="storyboard-run-frame"
            data-frame-status={frame.status}
            className="overflow-hidden rounded-sm border border-border-soft bg-surface-panel-muted"
          >
            <div className="aspect-video bg-black/5">
              {frame.imageUrl ? (
                <img
                  src={frame.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Send size={13} strokeWidth={1.75} className="text-ink-faint" />
                </div>
              )}
            </div>
            <div className="truncate px-1.5 py-1 font-caption text-[10px] text-ink-dim">
              {frame.label ?? frame.aspectRatio ?? frame.id}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function StoryboardStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
      <div className="flex items-center gap-1.5 text-ink-dim">
        {icon}
        <span className="font-caption text-[10px] uppercase">{label}</span>
      </div>
      <div className="mt-1 font-display text-lg leading-none text-ink">{value}</div>
    </div>
  );
}

function StoryboardPanel({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children?: ReactNode;
}) {
  const hasChildren = Boolean(children);
  return (
    <section className="rounded-sm border border-border-soft bg-surface-panel p-3">
      <h3 className="font-caption text-xs text-ink">{title}</h3>
      <div className="mt-2">
        {hasChildren ? (
          children
        ) : (
          <div className="rounded-sm border border-dashed border-border-soft bg-surface-panel-muted px-2 py-3 font-caption text-[11px] text-ink-faint">
            {empty}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyStoryboardState() {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-sm border border-dashed border-border-soft bg-surface-panel-muted">
      <div className="max-w-sm px-4 text-center">
        <div className="font-display text-xl text-ink">No frames yet</div>
        <p className="mt-2 font-caption text-xs leading-relaxed text-ink-dim">
          Start from the composer; generated frames, copy, and publish previews will
          collect here without leaving the canvas shell.
        </p>
      </div>
    </div>
  );
}
