'use client';

import { useMemo, useState } from 'react';
import { Loader2, Search, Sparkles } from 'lucide-react';
import { runAndLabelClusters } from '@/lib/clusters/client';
import { useCreatorContext } from '@/lib/context/creator-store';
import { addReference, useReferences } from '@/lib/references/store';
import {
  defaultResearchSeedText,
  mergeResearchRecords,
  planResearch,
  RESEARCH_PLATFORMS,
  type ResearchPlatform,
} from '@/lib/research/research';
import { runResearchViaApi } from '@/lib/research/client';
import { cn } from '@/lib/utils/cn';

const DEFAULT_PLATFORMS: ResearchPlatform[] = ['pinterest', 'instagram', 'tiktok'];
const PLATFORM_LABEL: Record<ResearchPlatform, string> = {
  pinterest: 'pinterest',
  instagram: 'instagram',
  tiktok: 'tiktok',
  xhs: 'xhs',
  web: 'web',
};

type ResearchStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; refs: number; clusters: number; materialized: number }
  | { kind: 'error'; message: string };

export function researchSectionSummary(referenceCount: number): string {
  return referenceCount > 0 ? `${referenceCount} refs` : 'scout';
}

export function ResearchSection({ workspaceId }: { workspaceId?: string }) {
  const context = useCreatorContext(workspaceId);
  const references = useReferences(workspaceId);
  const [seedText, setSeedText] = useState('');
  const [platforms, setPlatforms] = useState<ResearchPlatform[]>(DEFAULT_PLATFORMS);
  const [status, setStatus] = useState<ResearchStatus>({ kind: 'idle' });

  const suggestedSeed = useMemo(
    () => defaultResearchSeedText(context, references),
    [context, references]
  );
  const resolvedSeed = seedText.trim() || suggestedSeed;
  const plan = useMemo(
    () =>
      planResearch({
        context,
        seedText: resolvedSeed,
        platforms,
        limit: 8,
      }),
    [context, platforms, resolvedSeed]
  );

  const togglePlatform = (platform: ResearchPlatform) => {
    setPlatforms((current) => {
      if (current.includes(platform)) {
        if (current.length === 1) return current;
        return current.filter((entry) => entry !== platform);
      }
      return [...current, platform];
    });
  };

  const runResearch = async () => {
    if (status.kind === 'running' || plan.targets.length === 0) return;
    setStatus({ kind: 'running' });
    try {
      const result = await runResearchViaApi({
        context,
        seedText: resolvedSeed,
        platforms,
        limit: 8,
      });
      for (const record of result.records) addReference(record, workspaceId);
      const clusterRefs = mergeResearchRecords(references, result.records);
      const clusterResult = await runAndLabelClusters(clusterRefs);
      const clusterCount =
        clusterResult.labels.labels?.length ??
        clusterResult.run.nClusters ??
        0;
      setStatus({
        kind: 'done',
        refs: result.records.length,
        clusters: clusterCount,
        materialized: result.materializedCount,
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aether:cluster-lens', { detail: { open: true } })
        );
      }
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="research-section">
      <section className="flex flex-col gap-1.5">
        <span className="font-caption text-ink-dim">research seeds</span>
        <textarea
          aria-label="research seeds"
          value={seedText}
          onChange={(event) => setSeedText(event.target.value)}
          placeholder={suggestedSeed || 'keywords, #hashtags, @accounts, source URLs'}
          rows={3}
          className="min-h-20 resize-none rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 font-caption text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent"
        />
      </section>

      <section className="flex flex-col gap-1.5">
        <span className="font-caption text-ink-dim">sources</span>
        <div
          role="group"
          aria-label="research sources"
          className="flex flex-wrap gap-1"
        >
          {RESEARCH_PLATFORMS.map((platform) => {
            const active = platforms.includes(platform);
            return (
              <button
                key={platform}
                type="button"
                aria-pressed={active}
                data-research-platform={platform}
                onClick={() => togglePlatform(platform)}
                className={cn(
                  'rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors',
                  active
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border-soft bg-surface-panel-muted text-ink-dim hover:text-ink'
                )}
              >
                {PLATFORM_LABEL[platform]}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-caption text-ink-dim">targets</span>
          <span className="font-caption text-2xs text-ink-faint">
            {plan.targets.length}
          </span>
        </div>
        {plan.targets.length === 0 ? (
          <span className="font-caption text-xs text-ink-faint">
            add a keyword, tag, handle, or URL
          </span>
        ) : (
          <div className="flex flex-wrap gap-1" aria-label="research targets">
            {plan.targets.slice(0, 8).map((target) => (
              <a
                key={target.id}
                href={target.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                title={target.reason}
                className="rounded-pill border border-border-soft bg-surface-panel-muted px-2 py-0.5 font-caption text-xs text-ink transition-colors hover:border-accent hover:text-accent"
              >
                {target.label}
              </a>
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        data-testid="research-run"
        onClick={() => void runResearch()}
        disabled={status.kind === 'running' || plan.targets.length === 0}
        className={cn(
          'inline-flex h-8 items-center justify-center gap-1 rounded-sm border px-2 font-mono text-2xs uppercase tracking-wide',
          'border-border-soft bg-surface-panel text-ink transition-colors',
          'hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
        )}
      >
        {status.kind === 'running' ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : (
          <Search className="h-3 w-3" aria-hidden="true" />
        )}
        {status.kind === 'running' ? 'scouting' : 'scout refs'}
      </button>

      {status.kind === 'done' ? (
        <div
          role="status"
          data-testid="research-status"
          className="flex items-center gap-1 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1 font-caption text-xs text-ink-dim"
        >
          <Sparkles className="h-3 w-3 text-accent" aria-hidden="true" />
          {status.refs} refs · {status.clusters} clusters
          {status.materialized > 0 ? ` · ${status.materialized} source targets` : ''}
        </div>
      ) : status.kind === 'error' ? (
        <div
          role="alert"
          data-testid="research-status"
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1 font-caption text-xs text-ink-dim"
        >
          {status.message}
        </div>
      ) : null}
    </div>
  );
}
