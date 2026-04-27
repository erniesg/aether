'use client';

/**
 * /runs — historical lap browser.
 *
 * Subscribes to campaigns:listRecent (top 50 across ALL workspaces) so a
 * creator can browse every lap they've ever fired without knowing the
 * workspaceId. Replaces the manual `/tmp/aether-demo-runs/all-runs.md`
 * index with an in-UI history view backed by live Convex data.
 *
 * Status dot + relative time + trigger preview per row, with deep links
 * to /inspect/<id> (read-only trace) and /workspace/<wsId>?campaign=<id>
 * (canvas drop). Hard rule #6 compliance: no per-row description copy —
 * the columns carry the meaning.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { isConvexEnabled } from '@/lib/convex/client';
import { Surface } from '@/components/ui/Surface';
import { Chip } from '@/components/ui/Chip';

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
}

const campaignsAnyApi = (anyApi as unknown as {
  campaigns: { listRecent: unknown };
}).campaigns;

function statusDot(status: CampaignRow['status']): string {
  switch (status) {
    case 'running':
      return 'bg-amber-500 animate-pulse';
    case 'completed':
      return 'bg-emerald-500';
    case 'failed':
      return 'bg-rose-500';
  }
}

function statusTone(status: CampaignRow['status']): 'ok' | 'error' | 'neutral' {
  if (status === 'completed') return 'ok';
  if (status === 'failed') return 'error';
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

export default function RunsPage() {
  const router = useRouter();
  const campaigns = useQuery(
    campaignsAnyApi.listRecent as never,
    isConvexEnabled() ? ({ limit: 50 } as never) : 'skip'
  ) as CampaignRow[] | undefined;

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
                <th className="px-2 py-2 text-left">when</th>
                <th className="px-2 py-2 text-left">workspace</th>
                <th className="px-2 py-2 text-left">campaign</th>
                <th className="px-2 py-2 text-left">status</th>
                <th className="px-2 py-2 text-left">trigger</th>
                <th className="px-2 py-2 text-right">links</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const wsId = c.workspaceId ?? '—';
                const inspectHref = `/inspect/${c.id}`;
                const workspaceHref = `/workspace/${encodeURIComponent(wsId)}?campaign=${c.id}`;
                const canDropOnCanvas = wsId !== '—';
                return (
                  <tr
                    key={c.id}
                    onClick={
                      canDropOnCanvas
                        ? (e) => {
                            // Don't hijack the inner anchor clicks (inspect / workspace links).
                            const t = e.target as HTMLElement;
                            if (t.closest('a')) return;
                            router.push(workspaceHref);
                          }
                        : undefined
                    }
                    className={
                      'border-b border-ink-faint/10 align-middle hover:bg-surface-2' +
                      (canDropOnCanvas ? ' cursor-pointer' : '')
                    }
                    title={
                      canDropOnCanvas
                        ? 'click to load this lap on the workspace canvas'
                        : undefined
                    }
                  >
                    <td className="px-2 py-2 font-caption text-ink-dim tabular-nums">
                      {relativeTime(c.startedAt)}
                    </td>
                    <td className="px-2 py-2 font-mono text-ink-dim">{wsId}</td>
                    <td className="px-2 py-2 font-mono text-[10px] text-ink-faint tabular-nums">
                      {shortId(c.id)}
                    </td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusDot(c.status)}`} />
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
                        >
                          inspect ↗
                        </Link>
                        {wsId !== '—' ? (
                          <Link
                            href={workspaceHref}
                            className="font-caption text-[10px] text-ink-dim hover:text-ink"
                          >
                            workspace ↗
                          </Link>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
