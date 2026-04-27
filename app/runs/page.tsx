'use client';

/**
 * /runs — historical lap browser.
 *
 * List of recent laps; click a row to expand inline (variations + heroes
 * + status), or use the explicit per-row buttons to jump into the full
 * /inspect view or load the lap on the workspace canvas.
 *
 * Two affordances per row, no surprise navigation:
 *   - inspect ↗ → /inspect/<id> (full trace)
 *   - workspace ↗ → /workspace/<wsId>?campaign=<id> (canvas drop)
 * Row click toggles inline expansion only.
 */

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { isConvexEnabled } from '@/lib/convex/client';
import { Surface } from '@/components/ui/Surface';
import { Chip } from '@/components/ui/Chip';
import { VariationActions } from '@/components/rail/VariationActions';

interface CampaignRow {
  id: string;
  workspaceId?: string;
  triggerKind: 'url' | 'file' | 'text';
  triggerPayload: string;
  variationCount: number;
  notifyMode: 'notify' | 'review' | 'auto-post';
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  finishedAt?: number;
  error?: string;
  referenceImages?: Array<{ url?: string; hint?: string }>;
  urlIngestion?: {
    url?: string;
    title?: string;
    description?: string;
    primaryImage?: { url?: string };
    images?: Array<{ url?: string; alt?: string }>;
    products?: Array<{ name?: string; price?: string }>;
    rawHtmlBytes?: number;
  };
  clusterBundle?: {
    clusters: Array<{
      label: string;
      rationale?: string;
      tags?: string[];
      memberIndexes: number[];
    }>;
    unclustered: number[];
    refs?: Array<{ url?: string }>;
    usedManagedAgentsApi?: boolean;
  };
}

interface VariationRow {
  id: string;
  index: number;
  status: 'pending' | 'running' | 'ready' | 'failed';
  heroImageUrl?: string;
  caption?: string;
  hashtags?: string[];
  moodNote?: string;
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
  error?: string;
}

interface CampaignDetail {
  campaign: CampaignRow;
  variations: VariationRow[];
}

const campaignsAnyApi = (anyApi as unknown as {
  campaigns: { listRecent: unknown; get: unknown };
}).campaigns;

function statusDot(status: CampaignRow['status'] | VariationRow['status']): string {
  switch (status) {
    case 'running':
      return 'bg-amber-500 animate-pulse';
    case 'completed':
    case 'ready':
      return 'bg-emerald-500';
    case 'failed':
      return 'bg-rose-500';
    case 'pending':
      return 'bg-ink-faint';
    default:
      return 'bg-ink-faint';
  }
}

function statusTone(
  status: CampaignRow['status'] | VariationRow['status']
): 'ok' | 'error' | 'neutral' | 'warn' {
  if (status === 'completed' || status === 'ready') return 'ok';
  if (status === 'failed') return 'error';
  if (status === 'running') return 'warn';
  return 'neutral';
}

function relativeTime(ts: number): string {
  const delta = Math.max(0, Date.now() - ts);
  const m = Math.floor(delta / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function shortId(id: string): string {
  return id.length <= 14 ? id : `${id.slice(0, 6)}…${id.slice(-3)}`;
}

function ExpandedRow({ campaignId, wsId }: { campaignId: string; wsId: string }) {
  const detail = useQuery(
    campaignsAnyApi.get as never,
    isConvexEnabled() ? ({ campaignId } as never) : 'skip'
  ) as CampaignDetail | null | undefined;

  if (detail === undefined) {
    return <div className="font-caption text-ink-dim p-3">loading…</div>;
  }
  if (detail === null) {
    return (
      <div className="font-caption text-ink-dim p-3">
        campaign not found in convex
      </div>
    );
  }

  const { campaign, variations } = detail;
  const refs = campaign.referenceImages ?? [];
  const ingestion = campaign.urlIngestion;
  const cluster = campaign.clusterBundle;
  const ingestedImages = ingestion?.images ?? [];
  // Cluster ref index → URL lookup. Cluster bundle stores either the refs
  // it was given OR just memberIndexes — fall back to ingestion images
  // when refs aren't on the bundle.
  const clusterRefUrls: string[] =
    cluster?.refs?.map((r) => r.url ?? '').filter(Boolean) as string[]
    ?? (ingestedImages.map((i) => i.url ?? '').filter(Boolean) as string[]);

  return (
    <div className="bg-surface-panel-muted px-4 py-3 text-xs">
      <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 mb-3">
        <span className="font-caption uppercase text-[10px] text-ink-faint">
          payload
        </span>
        <span className="text-ink whitespace-pre-wrap break-words">
          {campaign.triggerPayload || '(no payload)'}
        </span>

        <span className="font-caption uppercase text-[10px] text-ink-faint">
          input refs
        </span>
        <span className="font-mono text-[11px] text-ink-dim">
          {refs.length === 0
            ? '(none)'
            : refs
                .map((r, i) => `[${i}] ${r.url ? r.url.slice(0, 80) : '(no url)'}`)
                .join('  ·  ')}
        </span>

        {campaign.error ? (
          <>
            <span className="font-caption uppercase text-[10px] text-ink-faint">
              error
            </span>
            <span className="font-mono text-[11px] text-rose-600 whitespace-pre-wrap break-words">
              {campaign.error}
            </span>
          </>
        ) : null}
      </div>

      {ingestion ? (
        <div className="mb-3 rounded border border-ink-faint/20 bg-surface-panel p-2">
          <div className="font-caption uppercase text-[10px] text-ink-faint mb-1.5">
            url ingestion · {ingestedImages.length} image{ingestedImages.length === 1 ? '' : 's'}
            {ingestion.products && ingestion.products.length > 0
              ? ` · ${ingestion.products.length} product${ingestion.products.length === 1 ? '' : 's'}`
              : ''}
            {typeof ingestion.rawHtmlBytes === 'number'
              ? ` · ${Math.round(ingestion.rawHtmlBytes / 1024)}KB html`
              : ''}
          </div>
          {ingestion.title ? (
            <div className="font-caption text-ink mb-0.5 break-words">
              {ingestion.title}
            </div>
          ) : null}
          {ingestion.description ? (
            <div className="font-caption text-[11px] text-ink-dim mb-1.5 line-clamp-2">
              {ingestion.description}
            </div>
          ) : null}
          {ingestedImages.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {ingestedImages.slice(0, 12).map((img, i) =>
                img.url ? (
                  <a
                    key={i}
                    href={img.url}
                    target="_blank"
                    rel="noreferrer"
                    title={img.alt ?? img.url}
                    className="block h-12 w-12 overflow-hidden rounded-xs border border-border-soft bg-surface-panel-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.alt ?? ''} className="h-full w-full object-cover" />
                  </a>
                ) : null
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {cluster && cluster.clusters.length > 0 ? (
        <div className="mb-3 rounded border border-ink-faint/20 bg-surface-panel p-2">
          <div className="font-caption uppercase text-[10px] text-ink-faint mb-1.5">
            visual clusters · {cluster.clusters.length} group{cluster.clusters.length === 1 ? '' : 's'}
            {cluster.unclustered.length > 0
              ? ` · ${cluster.unclustered.length} unclustered`
              : ''}
            {cluster.usedManagedAgentsApi ? ' · managed-agents' : ''}
          </div>
          <div className="flex flex-col gap-2">
            {cluster.clusters.map((c, ci) => (
              <div key={ci} className="flex items-start gap-2">
                <div className="min-w-[6rem] shrink-0">
                  <Chip tone="info" size="sm" variant="solid">
                    {c.label}
                  </Chip>
                  <div className="mt-0.5 font-mono text-[10px] text-ink-faint">
                    {c.memberIndexes.length} ref{c.memberIndexes.length === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  {c.rationale ? (
                    <div className="font-caption text-[11px] text-ink-dim line-clamp-2 mb-1">
                      {c.rationale}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-1">
                    {c.memberIndexes.slice(0, 8).map((idx) => {
                      const url = clusterRefUrls[idx];
                      if (!url) {
                        return (
                          <span
                            key={idx}
                            className="font-mono text-[10px] text-ink-faint"
                          >
                            #{idx}
                          </span>
                        );
                      }
                      return (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          title={`ref[${idx}] ${url}`}
                          className="block h-10 w-10 overflow-hidden rounded-xs border border-border-soft"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`ref ${idx}`} className="h-full w-full object-cover" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="border-t border-ink-faint/20 pt-3">
        <div className="font-caption uppercase text-[10px] text-ink-faint mb-2">
          {variations.length} variation{variations.length === 1 ? '' : 's'}
        </div>
        <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
          {variations.map((v) => (
            <div
              key={v.id}
              className="rounded border border-ink-faint/15 bg-surface-panel p-2 flex items-start gap-3"
            >
              {v.heroImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.heroImageUrl}
                  alt={`v${v.index} hero`}
                  className="h-16 w-16 rounded-xs object-cover bg-surface-panel-muted shrink-0"
                />
              ) : (
                <div className="h-16 w-16 rounded-xs bg-surface-panel-muted shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="font-mono text-[10px] text-ink-muted">
                    v{v.index}
                  </span>
                  <Chip tone={statusTone(v.status)} size="sm" variant="solid">
                    {v.status}
                  </Chip>
                  {v.schedulePlatform ? (
                    <Chip tone="neutral" size="sm" variant="ghost">
                      {v.schedulePlatform}
                    </Chip>
                  ) : null}
                </div>
                {v.caption ? (
                  <div className="text-[11px] text-ink leading-snug line-clamp-3">
                    {v.caption}
                  </div>
                ) : null}
                {v.moodNote ? (
                  <div className="font-mono text-[10px] text-ink-muted mt-1">
                    {v.moodNote}
                  </div>
                ) : null}
                {v.error ? (
                  <div className="font-mono text-[10px] text-rose-600 mt-1 break-words">
                    {v.error}
                  </div>
                ) : null}
                {/* Self-fetch mode — VariationActions calls /api/auto-mode/post-now
                    or /approve directly. Reject is hidden in this mode (Convex
                    mutation needs the variation doc id; we have it but don't
                    yet plumb it through useQuery here — left for the workspace
                    rail which already does the right thing). */}
                <VariationActions
                  campaignId={campaign.id}
                  variationIndex={v.index}
                  workspaceId={campaign.workspaceId}
                  status={v.status}
                  density="compact"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-ink-faint/20 flex items-center justify-end gap-3">
        <Link
          href={`/inspect/${campaign.id}`}
          className="font-caption text-[10px] text-ink-dim hover:text-ink"
        >
          full inspect ↗
        </Link>
        {wsId !== '—' ? (
          <Link
            href={`/workspace/${encodeURIComponent(wsId)}?campaign=${campaign.id}`}
            className="font-caption text-[10px] text-ink-dim hover:text-ink"
          >
            view in workspace ↗
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function RunsPage() {
  const campaigns = useQuery(
    campaignsAnyApi.listRecent as never,
    isConvexEnabled() ? ({ limit: 50 } as never) : 'skip'
  ) as CampaignRow[] | undefined;

  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex min-h-screen flex-col bg-surface-bg">
      <Surface
        as="header"
        tone="panel"
        taxonomy="navigation"
        border="soft"
        className="flex h-header items-center px-4"
      >
        <div className="flex items-center gap-3">
          <Link href="/" className="font-display text-base tracking-tight">
            aether
          </Link>
          <span className="text-ink-faint" aria-hidden>/</span>
          <span className="font-caption text-ink-dim">runs</span>
          {campaigns ? (
            <span className="font-caption text-[10px] text-ink-faint">
              {campaigns.length} recent
            </span>
          ) : null}
        </div>
      </Surface>

      <main className="flex-1 overflow-auto px-6 py-6">
        {!isConvexEnabled() ? (
          <p className="font-caption text-ink-dim">
            Convex isn’t configured — set NEXT_PUBLIC_CONVEX_URL to browse historical runs.
          </p>
        ) : campaigns === undefined ? (
          <p className="font-caption text-ink-dim">loading…</p>
        ) : campaigns.length === 0 ? (
          <p className="font-caption text-ink-dim">no laps yet — fire one from a workspace.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="font-caption text-[10px] uppercase tracking-wider text-ink-faint">
              <tr className="border-b border-ink-faint/20">
                <th className="px-2 py-2 text-left w-6"></th>
                <th className="px-2 py-2 text-left">when</th>
                <th className="px-2 py-2 text-left">workspace</th>
                <th className="px-2 py-2 text-left">campaign</th>
                <th className="px-2 py-2 text-left">status</th>
                <th className="px-2 py-2 text-left">trigger</th>
                <th className="px-2 py-2 text-right">actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const wsId = c.workspaceId ?? '—';
                const inspectHref = `/inspect/${c.id}`;
                const workspaceHref = `/workspace/${encodeURIComponent(wsId)}?campaign=${c.id}`;
                const isExpanded = expandedId === c.id;
                return (
                  <Row
                    key={c.id}
                    campaign={c}
                    wsId={wsId}
                    inspectHref={inspectHref}
                    workspaceHref={workspaceHref}
                    isExpanded={isExpanded}
                    onToggle={() =>
                      setExpandedId((current) => (current === c.id ? null : c.id))
                    }
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}

function Row({
  campaign: c,
  wsId,
  inspectHref,
  workspaceHref,
  isExpanded,
  onToggle,
}: {
  campaign: CampaignRow;
  wsId: string;
  inspectHref: string;
  workspaceHref: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={(e) => {
          // Don't hijack the inner anchor clicks (inspect / workspace links).
          const t = e.target as HTMLElement;
          if (t.closest('a')) return;
          onToggle();
        }}
        className="border-b border-ink-faint/10 align-middle hover:bg-surface-panel-muted cursor-pointer"
        title="click to expand inline · use links for full inspect / workspace"
      >
        <td className="px-2 py-2 font-mono text-ink-dim text-[10px] select-none">
          {isExpanded ? '▾' : '▸'}
        </td>
        <td className="px-2 py-2 font-caption text-ink-dim tabular-nums">
          {relativeTime(c.startedAt)}
        </td>
        <td className="px-2 py-2 font-mono text-ink-dim">{wsId}</td>
        <td className="px-2 py-2 font-mono text-[10px] text-ink-faint tabular-nums">
          {shortId(c.id)}
        </td>
        <td className="px-2 py-2">
          <span className="inline-flex items-center gap-2">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${statusDot(
                c.status
              )}`}
            />
            <Chip tone={statusTone(c.status)} size="sm">
              {c.status}
            </Chip>
          </span>
        </td>
        <td className="px-2 py-2 max-w-md truncate text-ink-dim">
          {(c.triggerPayload || '').trim() || '(no payload)'}
        </td>
        <td className="px-2 py-2 text-right">
          <span className="inline-flex gap-3">
            <Link
              href={inspectHref}
              className="font-caption text-[10px] text-ink-dim hover:text-ink"
              onClick={(e) => e.stopPropagation()}
            >
              inspect ↗
            </Link>
            {wsId !== '—' ? (
              <Link
                href={workspaceHref}
                className="font-caption text-[10px] text-ink-dim hover:text-ink"
                onClick={(e) => e.stopPropagation()}
              >
                workspace ↗
              </Link>
            ) : null}
          </span>
        </td>
      </tr>
      {isExpanded ? (
        <tr>
          <td colSpan={7} className="p-0">
            <ExpandedRow campaignId={c.id} wsId={wsId} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
