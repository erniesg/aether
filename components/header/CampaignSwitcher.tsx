'use client';

/**
 * CampaignSwitcher — workspace-header chip that lists every campaign for
 * the current workspace and lets the creator switch which one is "active"
 * (drives the right-rail lap panel + canvas drop).
 *
 * Subscribes to campaigns:listByWorkspace so the list updates live as new
 * laps fire from drag-drop / paste / API. Click a row → set
 * inFlightCampaignId in the parent shell + push ?campaign=<id> into the
 * URL so the state survives a hard refresh and is shareable.
 *
 * Hard rule #6 (restraint over labels): chip stays compact when collapsed
 * — short campaign id + status dot. Body opens on click; body shows one
 * row per campaign with status + relative-time + first 60 chars of the
 * trigger or headline. No paragraphs, no descriptions.
 */

import { useId, useMemo, useRef, useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { isConvexEnabled } from '@/lib/convex/client';
import { Chip } from '@/components/ui/Chip';

interface CampaignRow {
  id: string;
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
  campaigns: { listByWorkspace: unknown };
}).campaigns;

export interface CampaignSwitcherProps {
  workspaceId: string;
  /** The currently-active campaign id (drives the right-rail). */
  activeCampaignId: string | null;
  /** Called when the creator picks a different campaign. */
  onSelect: (campaignId: string | null) => void;
}

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
  return id.length <= 10 ? id : `${id.slice(0, 6)}…${id.slice(-3)}`;
}

export function CampaignSwitcher({
  workspaceId,
  activeCampaignId,
  onSelect,
}: CampaignSwitcherProps) {
  const popoverId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const campaigns = useQuery(
    campaignsAnyApi.listByWorkspace as never,
    isConvexEnabled() && workspaceId ? ({ workspaceId } as never) : 'skip'
  ) as CampaignRow[] | undefined;

  // Close on outside click — minimum-viable popover (matches AutoModeToggle).
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const active = useMemo(
    () => campaigns?.find((c) => c.id === activeCampaignId) ?? null,
    [campaigns, activeCampaignId]
  );

  const list = campaigns ?? [];

  // Hide the chip entirely if Convex isn't enabled OR there are no campaigns
  // — no point in offering a switcher with nothing to switch to.
  if (!isConvexEnabled()) return null;
  if (list.length === 0) return null;

  const chipLabel = active
    ? `lap · ${shortId(active.id)}`
    : `${list.length} lap${list.length === 1 ? '' : 's'}`;
  const chipStatus: CampaignRow['status'] | null = active?.status ?? null;

  const handleSelect = (id: string) => {
    onSelect(id);
    setOpen(false);
    // Push ?campaign=<id> so the deep link survives hard reload.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('campaign', id);
      window.history.replaceState({}, '', url.toString());
    }
  };

  const handleClear = () => {
    onSelect(null);
    setOpen(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('campaign');
      window.history.replaceState({}, '', url.toString());
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={popoverId}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-ink-faint/30 bg-surface-bg px-2 py-1 text-xs font-mono text-ink-dim hover:bg-surface-panel-muted hover:text-ink"
        data-taxonomy="metadata"
      >
        {chipStatus ? (
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusDot(chipStatus)}`} />
        ) : (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink-faint/50" />
        )}
        <span>{chipLabel}</span>
      </button>

      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Campaign switcher"
          className="absolute left-0 top-full z-[1000] mt-2 w-[28rem] rounded-md border border-ink-faint/30 bg-surface-panel p-2 opacity-100 shadow-lg"
          data-taxonomy="metadata"
        >
          <div className="mb-1 flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider text-ink-faint">
            <span>Recent laps · {workspaceId}</span>
            {activeCampaignId ? (
              <button
                type="button"
                onClick={handleClear}
                className="font-mono normal-case tracking-normal text-ink-dim hover:text-ink"
              >
                clear
              </button>
            ) : null}
          </div>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {list.map((c) => {
              const isActive = c.id === activeCampaignId;
              const headline = (c.triggerPayload || '').trim();
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(c.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
                      isActive
                        ? 'bg-surface-panel-muted text-ink'
                        : 'text-ink-dim hover:bg-surface-panel-muted hover:text-ink'
                    }`}
                  >
                    <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(c.status)}`} />
                    <span className="font-mono text-[10px] tabular-nums text-ink-faint">
                      {shortId(c.id)}
                    </span>
                    <span className="flex-1 truncate">{headline || '(no payload)'}</span>
                    <Chip tone={c.status === 'completed' ? 'ok' : c.status === 'failed' ? 'error' : 'neutral'} size="sm">
                      {c.status}
                    </Chip>
                    <span className="shrink-0 font-caption text-[10px] text-ink-faint">
                      {relativeTime(c.startedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
