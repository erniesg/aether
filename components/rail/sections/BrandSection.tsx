'use client';

import { Check, History, Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEMO_CREATOR_CONTEXT,
  describeWorkspaceMode,
  type BrandContext,
  type CampaignContext,
  type KnowledgeSource,
  type KnowledgeSourceKind,
  type OfferContext,
} from '@/lib/context/model';
import {
  saveBrandContext,
  saveCampaignContext,
  saveOfferContext,
  useBrandContext,
} from '@/lib/context/creator-store';
import { addSignal, displaySignalValue, normalizeSignalValue } from '@/lib/signals/store';
import { normalizeHttpUrlInput } from '@/lib/url/normalize';
import type { BrandFollowups, SignalProposal } from '@/lib/brand/propose';
import type {
  BrandIngestKind,
  BrandIngestRequest,
  BrandSnapshot,
  BrandSnapshotSource,
} from '@/lib/brand/types';

/**
 * Brand section body. Surfaces the current brand snapshot (from DEMO context
 * or a freshly ingested one) and exposes a drop zone so creators can paste a
 * URL, a GitHub repo, or drop files. Stays single-column and restraint-first
 * per `CLAUDE.md` hard rules 5 + 6.
 */

interface BrandSectionProps {
  context?: BrandContext;
  workspaceId?: string;
  workspaceMode?: 'venture' | 'studio';
  /** Deprecated: workspace label is intentionally not rendered in the brand flyout. */
  workspaceLabel?: string;
  /** Override the ingest implementation (tests stub this). */
  ingest?: (req: BrandIngestRequest) => Promise<{
    snapshot: BrandSnapshot;
    review: boolean;
  }>;
  /** Override the propose implementation (tests stub this). */
  propose?: (snapshot: BrandSnapshot) => Promise<BrandFollowups>;
}

type IngestState =
  | { kind: 'idle' }
  | { kind: 'loading'; startedAt: number }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; snapshot: BrandSnapshot; review: boolean };

type ProposeState =
  | { kind: 'idle' }
  | { kind: 'loading'; startedAt: number }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; followups: BrandFollowups; runId?: string };

type SaveState = 'idle' | 'saved' | 'error';
type ProposalRunRecord = {
  id: string;
  createdAt: string;
  sourceLabel: string;
  followups: BrandFollowups;
};

const HEX_RE = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const PROPOSAL_HISTORY_STORAGE_KEY = 'aether.brand.proposalHistory.v1';

function brandContextSignature(context: BrandContext): string {
  return JSON.stringify({
    id: context.id,
    name: context.name,
    palette: context.palette,
    type: context.type,
    voice: context.voice,
    knowledgeSources: context.knowledgeSources.map((source) => ({
      id: source.id,
      kind: source.kind,
      label: source.label,
      note: source.note,
    })),
  });
}

function proposalHistoryKey(workspaceId?: string): string {
  return workspaceId ? `${PROPOSAL_HISTORY_STORAGE_KEY}:${workspaceId}` : PROPOSAL_HISTORY_STORAGE_KEY;
}

function loadProposalHistory(workspaceId?: string): ProposalRunRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(proposalHistoryKey(workspaceId)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is ProposalRunRecord => isProposalRunRecord(entry))
      .slice(0, 10);
  } catch {
    return [];
  }
}

function saveProposalHistory(workspaceId: string | undefined, records: ProposalRunRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      proposalHistoryKey(workspaceId),
      JSON.stringify(records.slice(0, 10))
    );
  } catch {
    // local history is best-effort; proposals still render in the current session
  }
}

function isProposalRunRecord(value: unknown): value is ProposalRunRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.createdAt === 'string' &&
    typeof v.sourceLabel === 'string' &&
    typeof v.followups === 'object' &&
    v.followups !== null
  );
}

async function defaultPropose(snapshot: BrandSnapshot): Promise<BrandFollowups> {
  const res = await fetch('/api/brand/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot }),
  });
  const json = (await res.json()) as {
    ok: boolean;
    offers?: BrandFollowups['offers'];
    campaigns?: BrandFollowups['campaigns'];
    signals?: BrandFollowups['signals'];
    coverage?: BrandFollowups['coverage'];
    error?: string;
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `propose failed: ${res.status}`);
  }
  return {
    offers: json.offers ?? [],
    campaigns: json.campaigns ?? [],
    signals: json.signals ?? [],
    coverage: json.coverage ?? { ok: true, notes: [] },
  };
}

async function defaultIngest(req: BrandIngestRequest) {
  const res = await fetch('/api/brand-ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const json = (await res.json()) as {
    ok: boolean;
    snapshot?: BrandSnapshot;
    review?: boolean;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.snapshot) {
    throw new Error(json.error ?? `ingest failed: ${res.status}`);
  }
  return { snapshot: json.snapshot, review: json.review ?? false };
}

function classifyInput(raw: string): BrandIngestKind | null {
  const trimmed = normalizeHttpUrlInput(raw);
  if (!trimmed) return null;
  if (/^https?:\/\/github\.com\//i.test(trimmed)) return 'repo';
  if (/^https?:\/\//i.test(trimmed)) return 'url';
  return null;
}

function BrandDropZone({
  onSubmit,
  state,
}: {
  onSubmit: (req: BrandIngestRequest) => void;
  state: IngestState;
}) {
  const [value, setValue] = useState('');
  const loading = state.kind === 'loading';

  const submit = () => {
    const kind = classifyInput(value);
    if (!kind) return;
    onSubmit({ kind, source: normalizeHttpUrlInput(value) });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const texts: string[] = [];
    const images: Array<{ url: string; alt?: string }> = [];
    await Promise.all(
      Array.from(files).map(async (file) => {
        if (file.type.startsWith('image/')) {
          const dataUrl = await fileToDataUrl(file);
          images.push({ url: dataUrl, alt: file.name });
        } else {
          const text = await file.text();
          texts.push(text);
        }
      })
    );
    onSubmit({ kind: 'files', source: { texts, images } });
  };

  return (
    <div
      data-testid="brand-drop-zone"
      className="flex flex-col gap-2 rounded-sm border border-dashed border-border-soft bg-surface-panel-muted px-2 py-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void onFiles(e.dataTransfer.files);
      }}
    >
      <span className="font-caption text-ink-dim">paste a URL or drop files</span>
      <div className="flex gap-1">
        <input
          type="text"
          aria-label="brand source"
          placeholder="https://brand.example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          disabled={loading}
          className="flex-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={loading || !classifyInput(value)}
          className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted disabled:opacity-50"
        >
          {loading ? 'reading…' : 'ingest'}
        </button>
      </div>
      <label className="cursor-pointer font-caption text-xs text-ink-dim hover:text-ink">
        <span>or pick files</span>
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void onFiles(e.target.files);
            e.currentTarget.value = '';
          }}
        />
      </label>
    </div>
  );
}

function useElapsedSeconds(active: boolean, startedAt?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [active, startedAt]);
  return active && startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function RunProgress({
  label,
  startedAt,
  detail,
}: {
  label: string;
  startedAt: number;
  detail?: string;
}) {
  const elapsed = useElapsedSeconds(true, startedAt);
  const progress = Math.min(94, 12 + elapsed * 5);
  return (
    <div
      role="status"
      data-testid="brand-run-progress"
      className="flex flex-col gap-1 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-caption text-xs text-ink-dim">{label}</span>
        <span className="font-caption text-2xs text-ink-faint">{formatElapsed(elapsed)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-pill bg-surface-panel">
        <div
          className="h-full rounded-pill bg-accent transition-[width] duration-700 ease-quick"
          style={{ width: `${progress}%` }}
        />
      </div>
      {detail ? (
        <span className="font-caption text-2xs text-ink-faint">{detail}</span>
      ) : null}
    </div>
  );
}

function ProposalHistory({
  records,
  onReuse,
}: {
  records: ProposalRunRecord[];
  onReuse: (record: ProposalRunRecord) => void;
}) {
  return (
    <div
      data-testid="proposal-history"
      className="flex flex-col gap-1 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
    >
      <span className="font-caption text-xs text-ink">history</span>
      {records.length === 0 ? (
        <span className="font-caption text-2xs text-ink-faint">no previous runs</span>
      ) : (
        records.slice(0, 5).map((record) => (
          <div
            key={record.id}
            className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-sm border border-border-soft bg-surface-panel px-2 py-1"
          >
            <div className="min-w-0">
              <span className="block truncate font-caption text-xs text-ink">
                {record.sourceLabel}
              </span>
              <span className="block font-caption text-2xs text-ink-faint">
                {new Date(record.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {record.followups.offers.length} offers · {record.followups.campaigns.length} campaigns ·{' '}
                {record.followups.signals.length} signals
              </span>
            </div>
            <button
              type="button"
              onClick={() => onReuse(record)}
              className="rounded-sm border border-border-soft px-1.5 py-0.5 font-caption text-2xs text-ink-dim transition-colors hover:text-ink"
            >
              reuse
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Compact draft cards for proposed offers, campaigns, and signals.
 * Proposals stay editable until the creator explicitly applies / tracks them.
 */
function ProposeDraftCards({
  followups,
  workspaceId,
  onDismiss,
}: {
  followups: BrandFollowups;
  workspaceId?: string;
  onDismiss: () => void;
}) {
  const [offers, setOffers] = useState<OfferContext[]>(followups.offers);
  const [campaigns, setCampaigns] = useState<CampaignContext[]>(followups.campaigns);
  const [signals, setSignals] = useState<SignalProposal[]>(followups.signals ?? []);
  const [dismissedOffers, setDismissedOffers] = useState<Set<string>>(new Set());
  const [dismissedCampaigns, setDismissedCampaigns] = useState<Set<string>>(new Set());
  const [dismissedSignals, setDismissedSignals] = useState<Set<string>>(new Set());
  const [acceptedOffers, setAcceptedOffers] = useState<Set<string>>(new Set());
  const [acceptedCampaigns, setAcceptedCampaigns] = useState<Set<string>>(new Set());
  const [acceptedSignals, setAcceptedSignals] = useState<Set<string>>(new Set());

  useEffect(() => {
    setOffers(followups.offers);
    setCampaigns(followups.campaigns);
    setSignals(followups.signals ?? []);
    setDismissedOffers(new Set());
    setDismissedCampaigns(new Set());
    setDismissedSignals(new Set());
    setAcceptedOffers(new Set());
    setAcceptedCampaigns(new Set());
    setAcceptedSignals(new Set());
  }, [followups]);

  const visibleOffers = offers.filter((o) => !dismissedOffers.has(o.id));
  const visibleCampaigns = campaigns.filter((c) => !dismissedCampaigns.has(c.id));
  const visibleSignals = signals.filter(
    (signal) => !dismissedSignals.has(signal.id) && !acceptedSignals.has(signal.id)
  );

  if (visibleOffers.length === 0 && visibleCampaigns.length === 0 && visibleSignals.length === 0) return null;

  const acceptOffer = (offer: OfferContext) => {
    saveOfferContext(normalizeOfferDraft(offer), workspaceId);
    setAcceptedOffers((prev) => new Set([...prev, offer.id]));
  };

  const acceptCampaign = (campaign: CampaignContext) => {
    saveCampaignContext(normalizeCampaignDraft(campaign), workspaceId);
    setAcceptedCampaigns((prev) => new Set([...prev, campaign.id]));
  };
  const acceptSignal = (signal: SignalProposal) => {
    addSignal(signal.kind, normalizeSignalValue(signal.kind, signal.value), workspaceId);
    setAcceptedSignals((prev) => new Set([...prev, signal.id]));
  };
  const acceptAllSignals = () => {
    for (const signal of visibleSignals) acceptSignal(signal);
  };

  return (
    <div data-testid="propose-draft-cards" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-caption text-ink-dim">proposed</span>
        <button
          type="button"
          aria-label="dismiss proposals"
          onClick={onDismiss}
          className="grid h-5 w-5 place-items-center rounded-sm text-ink-dim transition-colors hover:text-ink"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {visibleOffers.length > 0 ? (
        <section
          aria-label="proposed offers"
          data-testid="propose-offers-section"
          data-proposal-section="offers"
          className="flex flex-col gap-1.5 border-t border-border-soft pt-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-caption text-xs text-ink">offers</span>
            <span className="font-caption text-2xs text-ink-faint">
              {visibleOffers.length} draft{visibleOffers.length === 1 ? '' : 's'} · apply to sync
            </span>
          </div>
          {visibleOffers.map((offer) => (
            <div
              key={offer.id}
              data-testid={`propose-offer-${offer.id}`}
              className="flex flex-col gap-1 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
            >
              <div className="flex items-start justify-between gap-1">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-caption text-2xs uppercase tracking-wide text-ink-faint">
                    offer
                  </span>
                  <input
                    aria-label={`offer draft ${offer.id} name`}
                    value={offer.name}
                    onChange={(event) =>
                      setOffers((current) =>
                        current.map((entry) =>
                          entry.id === offer.id ? { ...entry, name: event.target.value } : entry
                        )
                      )
                    }
                    className="rounded-xs border border-transparent bg-transparent font-caption text-xs text-ink outline-none focus:border-accent focus:bg-surface-panel focus:px-1"
                  />
                  <textarea
                    aria-label={`offer draft ${offer.id} summary`}
                    rows={2}
                    value={offer.summary}
                    onChange={(event) =>
                      setOffers((current) =>
                        current.map((entry) =>
                          entry.id === offer.id
                            ? { ...entry, summary: event.target.value }
                            : entry
                        )
                      )
                    }
                    className="resize-none rounded-xs border border-transparent bg-transparent font-caption text-2xs leading-snug text-ink-dim outline-none focus:border-accent focus:bg-surface-panel focus:px-1"
                  />
                </div>
                <div className="flex shrink-0 gap-1">
                  {acceptedOffers.has(offer.id) ? (
                    <span className="font-caption text-2xs text-ink-dim">applied</span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`apply offer ${offer.name}`}
                      onClick={() => acceptOffer(offer)}
                      className="inline-flex items-center gap-0.5 rounded-sm border border-border-soft px-1.5 py-0.5 font-caption text-2xs text-ink-dim transition-colors hover:text-ink"
                    >
                      <Check className="h-2.5 w-2.5" aria-hidden="true" />
                      apply
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`dismiss offer ${offer.name}`}
                    onClick={() => setDismissedOffers((prev) => new Set([...prev, offer.id]))}
                    className="grid h-5 w-5 place-items-center rounded-sm text-ink-dim transition-colors hover:text-ink"
                  >
                    <X className="h-2.5 w-2.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <input
                aria-label={`offer draft ${offer.id} claims`}
                value={offer.claims.join(', ')}
                onChange={(event) =>
                  setOffers((current) =>
                    current.map((entry) =>
                      entry.id === offer.id
                        ? { ...entry, claims: parseCommaList(event.target.value) }
                        : entry
                    )
                  )
                }
                className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-2xs text-ink-dim outline-none focus:border-accent"
              />
              <input
                aria-label={`offer draft ${offer.id} hero asset`}
                value={offer.heroAsset}
                onChange={(event) =>
                  setOffers((current) =>
                    current.map((entry) =>
                      entry.id === offer.id ? { ...entry, heroAsset: event.target.value } : entry
                    )
                  )
                }
                className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-2xs text-ink-dim outline-none focus:border-accent"
              />
            </div>
          ))}
        </section>
      ) : null}

      {visibleCampaigns.length > 0 ? (
        <section
          aria-label="proposed campaigns"
          data-testid="propose-campaigns-section"
          data-proposal-section="campaigns"
          className="flex flex-col gap-1.5 border-t border-border-soft pt-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-caption text-xs text-ink">campaigns</span>
            <span className="font-caption text-2xs text-ink-faint">
              {visibleCampaigns.length} draft{visibleCampaigns.length === 1 ? '' : 's'} · apply to sync
            </span>
          </div>
          {visibleCampaigns.map((campaign) => (
            <div
              key={campaign.id}
              data-testid={`propose-campaign-${campaign.id}`}
              className="flex flex-col gap-1 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
            >
              <div className="flex items-start justify-between gap-1">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-caption text-2xs uppercase tracking-wide text-ink-faint">
                    campaign
                  </span>
                  <input
                    aria-label={`campaign draft ${campaign.id} name`}
                    value={campaign.name}
                    onChange={(event) =>
                      setCampaigns((current) =>
                        current.map((entry) =>
                          entry.id === campaign.id
                            ? { ...entry, name: event.target.value }
                            : entry
                        )
                      )
                    }
                    className="rounded-xs border border-transparent bg-transparent font-caption text-xs text-ink outline-none focus:border-accent focus:bg-surface-panel focus:px-1"
                  />
                  <textarea
                    aria-label={`campaign draft ${campaign.id} goal`}
                    rows={2}
                    value={campaign.goal}
                    onChange={(event) =>
                      setCampaigns((current) =>
                        current.map((entry) =>
                          entry.id === campaign.id
                            ? { ...entry, goal: event.target.value }
                            : entry
                        )
                      )
                    }
                    className="resize-none rounded-xs border border-transparent bg-transparent font-caption text-2xs leading-snug text-ink-dim outline-none focus:border-accent focus:bg-surface-panel focus:px-1"
                  />
                </div>
                <div className="flex shrink-0 gap-1">
                  {acceptedCampaigns.has(campaign.id) ? (
                    <span className="font-caption text-2xs text-ink-dim">applied</span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`apply campaign ${campaign.name}`}
                      onClick={() => acceptCampaign(campaign)}
                      className="inline-flex items-center gap-0.5 rounded-sm border border-border-soft px-1.5 py-0.5 font-caption text-2xs text-ink-dim transition-colors hover:text-ink"
                    >
                      <Check className="h-2.5 w-2.5" aria-hidden="true" />
                      apply
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`dismiss campaign ${campaign.name}`}
                    onClick={() => setDismissedCampaigns((prev) => new Set([...prev, campaign.id]))}
                    className="grid h-5 w-5 place-items-center rounded-sm text-ink-dim transition-colors hover:text-ink"
                  >
                    <X className="h-2.5 w-2.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <textarea
                aria-label={`campaign draft ${campaign.id} audience`}
                rows={2}
                value={campaign.audience}
                onChange={(event) =>
                  setCampaigns((current) =>
                    current.map((entry) =>
                      entry.id === campaign.id
                        ? { ...entry, audience: event.target.value }
                        : entry
                    )
                  )
                }
                className="resize-none rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-2xs text-ink-dim outline-none focus:border-accent"
              />
              <input
                aria-label={`campaign draft ${campaign.id} channels`}
                value={campaign.channels.join(', ')}
                onChange={(event) =>
                  setCampaigns((current) =>
                    current.map((entry) =>
                      entry.id === campaign.id
                        ? { ...entry, channels: parseCommaList(event.target.value) }
                        : entry
                    )
                  )
                }
                className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-2xs text-ink-dim outline-none focus:border-accent"
              />
              <input
                aria-label={`campaign draft ${campaign.id} cta`}
                value={campaign.cta}
                onChange={(event) =>
                  setCampaigns((current) =>
                    current.map((entry) =>
                      entry.id === campaign.id ? { ...entry, cta: event.target.value } : entry
                    )
                  )
                }
                className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-2xs text-ink-dim outline-none focus:border-accent"
              />
            </div>
          ))}
        </section>
      ) : null}

      {visibleSignals.length > 0 ? (
        <section
          aria-label="proposed signals"
          data-testid="propose-signals-section"
          data-proposal-section="signals"
          className="flex flex-col gap-1.5 border-t border-border-soft pt-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="font-caption text-xs text-ink">signals</span>
              <span className="font-caption text-2xs text-ink-faint">
                {visibleSignals.length} draft{visibleSignals.length === 1 ? '' : 's'}
              </span>
            </div>
            <button
              type="button"
              onClick={acceptAllSignals}
              className="rounded-sm border border-border-soft px-1.5 py-0.5 font-caption text-2xs text-ink-dim transition-colors hover:text-ink"
            >
              track all
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {visibleSignals.map((signal) => (
              <div
                key={signal.id}
                title={signal.reason}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-1 rounded-sm border border-border-soft bg-surface-panel px-1.5 py-1"
              >
                <input
                  aria-label={`signal draft ${signal.id}`}
                  value={displaySignalValue(signal)}
                  onChange={(event) =>
                    setSignals((current) =>
                      current.map((entry) =>
                        entry.id === signal.id
                          ? {
                              ...entry,
                              value: normalizeSignalValue(entry.kind, event.target.value),
                            }
                          : entry
                      )
                    )
                  }
                  className="min-w-0 rounded-xs border border-transparent bg-transparent font-caption text-2xs text-ink-dim outline-none focus:border-accent focus:bg-surface-panel-muted focus:px-1"
                />
                <button
                  type="button"
                  aria-label={`track signal ${displaySignalValue(signal)}`}
                  onClick={() => acceptSignal(signal)}
                  className="rounded-xs border border-border-soft px-1 py-0.5 font-caption text-2xs text-ink-dim transition-colors hover:text-ink"
                >
                  track
                </button>
                <button
                  type="button"
                  aria-label={`dismiss signal ${displaySignalValue(signal)}`}
                  onClick={() => setDismissedSignals((prev) => new Set([...prev, signal.id]))}
                  className="text-ink-dim transition-colors hover:text-ink"
                >
                  <X className="h-2.5 w-2.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {followups.coverage && !followups.coverage.ok && followups.coverage.notes.length > 0 ? (
        <div
          role="status"
          data-testid="propose-coverage-notes"
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
        >
          {followups.coverage.notes.map((note) => (
            <span key={note} className="block font-caption text-2xs text-ink-dim leading-snug">
              {note}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

export function BrandSection({
  context = DEMO_CREATOR_CONTEXT.brand,
  workspaceId,
  workspaceMode = DEMO_CREATOR_CONTEXT.workspaceMode,
  ingest = defaultIngest,
  propose = defaultPropose,
}: BrandSectionProps) {
  const savedContext = useBrandContext(workspaceId);
  const [draft, setDraft] = useState<BrandContext>(savedContext);
  const [state, setState] = useState<IngestState>({ kind: 'idle' });
  const [proposeState, setProposeState] = useState<ProposeState>({ kind: 'idle' });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [proposalHistory, setProposalHistory] = useState<ProposalRunRecord[]>(
    () => loadProposalHistory(workspaceId)
  );
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Two-phase hydration:
  //   Phase A (no user edits yet): keep the draft in lock-step with Convex.
  //     This handles initial-mount-before-Convex-resolves, cross-tab edits,
  //     and the autonomous brand-propose flow updating the rail underneath
  //     the user.
  //   Phase B (user has typed at least once this session): Convex updates
  //     stop overriding the draft. This is the fix for "typing reverts
  //     mid-keystroke / behaves append-only" — the user's input wins over
  //     reactive echoes from their own auto-save round-trips.
  // Workspace switch is treated as a fresh session (resets `hasEdited`).
  const hasEdited = useRef(false);
  const lastWorkspaceId = useRef<string | undefined>(workspaceId);
  const savedContextSignature = useMemo(
    () => brandContextSignature(savedContext),
    [savedContext]
  );
  const lastAppliedSavedSignature = useRef(savedContextSignature);
  useEffect(() => {
    if (lastWorkspaceId.current !== workspaceId) {
      lastWorkspaceId.current = workspaceId;
      hasEdited.current = false;
      lastAppliedSavedSignature.current = savedContextSignature;
      setDraft(savedContext);
      setDirty(false);
      setSaveState('idle');
      setProposalHistory(loadProposalHistory(workspaceId));
      return;
    }
    if (hasEdited.current) return;
    if (lastAppliedSavedSignature.current === savedContextSignature) return;
    lastAppliedSavedSignature.current = savedContextSignature;
    setDraft(savedContext);
  }, [workspaceId, savedContext, savedContextSignature]);

  const validationMessage = useMemo(() => validateDraft(draft), [draft]);

  const rememberProposalRun = (snapshot: BrandSnapshot, followups: BrandFollowups) => {
    const record: ProposalRunRecord = {
      id: `proposal-${Date.now()}`,
      createdAt: new Date().toISOString(),
      sourceLabel: proposalSourceLabel(snapshot),
      followups,
    };
    setProposalHistory((current) => {
      const next = [record, ...current].slice(0, 10);
      saveProposalHistory(workspaceId, next);
      return next;
    });
    return record;
  };

  const runPropose = (snapshot: BrandSnapshot) => {
    setProposeState({ kind: 'loading', startedAt: Date.now() });
    propose(snapshot)
      .then((followups) => {
        const record = rememberProposalRun(snapshot, followups);
        setProposeState({ kind: 'ok', followups, runId: record.id });
      })
      .catch((err: unknown) => {
        setProposeState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      });
  };

  const updateDraft = (fn: (prev: BrandContext) => BrandContext) => {
    hasEdited.current = true;
    setDraft((prev) => fn(prev));
    setDirty(true);
    setSaveState('idle');
  };

  const onSubmit = async (req: BrandIngestRequest) => {
    setState({ kind: 'loading', startedAt: Date.now() });
    setProposeState({ kind: 'idle' });
    try {
      const { snapshot, review } = await ingest(req);
      setDraft((prev) => brandContextFromSnapshot(prev, snapshot));
      setDirty(true);
      setSaveState('idle');
      setState({ kind: 'ok', snapshot, review });
      // Kick off the autonomous proposer in the background — do not await.
      // Errors are caught in the propose chain; the brand section stays usable.
      runPropose(snapshot);
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const onSave = () => {
    const normalized = normalizeDraftForSave(draft);
    if (!normalized) return;
    saveBrandContext(normalized, workspaceId, () => setSaveState('error'));
    setDraft(normalized);
    setDirty(false);
    setSaveState('saved');
    setState({ kind: 'idle' });
  };

  // Debounced auto-save: persist the draft 800ms after the last edit, so
  // creators don't have to hunt for a save button. Manual save still works.
  // Important: do NOT call `setDraft(normalized)` after persisting — that
  // resets the controlled input mid-typing if the user is still editing
  // (which is the canonical cause of the "append-only" feel). The draft is
  // already what the user typed; persisting is a side effect, not a state
  // reset.
  useEffect(() => {
    if (!dirty) return;
    if (validationMessage) return;
    const handle = setTimeout(() => {
      const normalized = normalizeDraftForSave(draft);
      if (!normalized) return;
      saveBrandContext(normalized, workspaceId, () => setSaveState('error'));
      setDirty(false);
      setSaveState('saved');
    }, 800);
    return () => clearTimeout(handle);
  }, [draft, dirty, validationMessage, workspaceId]);

  const modeLabel = workspaceMode === 'venture' ? 'venture' : 'studio';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">{modeLabel}</span>
        <input
          aria-label="brand name"
          value={draft.name}
          onChange={(e) => updateDraft((prev) => ({ ...prev, name: e.target.value }))}
          className="rounded-sm border border-transparent bg-transparent px-0 py-0 font-display text-sm text-ink outline-none transition-colors focus:border-accent focus:bg-surface-panel-muted focus:px-1"
        />
        <span className="font-caption text-xs text-ink-dim">
          {describeWorkspaceMode(workspaceMode)}
        </span>
      </div>

      <BrandDropZone onSubmit={onSubmit} state={state} />

      <div className="grid grid-cols-[1fr_auto] gap-1">
        <button
          type="button"
          data-testid="brand-rerun-proposals"
          onClick={() => runPropose(snapshotFromBrandContext(draft))}
          disabled={Boolean(validationMessage) || proposeState.kind === 'loading'}
          className="inline-flex h-7 items-center justify-center rounded-sm border border-border-soft bg-surface-panel px-2 font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
        >
          {proposeState.kind === 'loading' ? 'running…' : 'rerun context + signals'}
        </button>
        <button
          type="button"
          aria-label="proposal history"
          onClick={() => setHistoryOpen((open) => !open)}
          className="grid h-7 w-8 place-items-center rounded-sm border border-border-soft bg-surface-panel text-ink-dim transition-colors hover:text-ink"
        >
          <History className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {historyOpen ? (
        <ProposalHistory
          records={proposalHistory}
          onReuse={(record) => {
            setProposeState({ kind: 'ok', followups: record.followups, runId: record.id });
            setHistoryOpen(false);
          }}
        />
      ) : null}

      {state.kind === 'error' ? (
        <div
          role="alert"
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
        >
          <span className="font-caption text-xs text-ink-dim">
            could not read source · {state.message}
          </span>
        </div>
      ) : null}

      {state.kind === 'ok' && state.review ? (
        <div
          role="status"
          data-testid="brand-review-banner"
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
        >
          <span className="font-caption text-xs text-ink-dim">
            low-confidence read ({Math.round(state.snapshot.confidence * 100)}%) · review before saving
          </span>
        </div>
      ) : null}

      {state.kind === 'loading' ? (
        <RunProgress
          label="reading brand source"
          startedAt={state.startedAt}
          detail="palette, type, voice, imagery"
        />
      ) : null}

      {proposeState.kind === 'loading' ? (
        <RunProgress
          label="proposing offers + campaigns + signals"
          startedAt={proposeState.startedAt}
          detail="drafts stay editable before apply"
        />
      ) : null}

      {proposeState.kind === 'error' ? (
        <div
          role="alert"
          data-testid="propose-error"
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
        >
          <span className="font-caption text-xs text-ink-dim">
            propose failed · {proposeState.message}
          </span>
        </div>
      ) : null}

      {proposeState.kind === 'ok' ? (
        <ProposeDraftCards
          followups={proposeState.followups}
          workspaceId={workspaceId}
          onDismiss={() => setProposeState({ kind: 'idle' })}
        />
      ) : null}

      <BrandProfileEditor
        draft={draft}
        dirty={dirty}
        saveState={saveState}
        validationMessage={validationMessage}
        onChange={updateDraft}
        onSave={onSave}
        fallback={context}
      />
    </div>
  );
}

function BrandProfileEditor({
  draft,
  dirty,
  saveState,
  validationMessage,
  onChange,
  onSave,
  fallback,
}: {
  draft: BrandContext;
  dirty: boolean;
  saveState: SaveState;
  validationMessage: string | null;
  onChange: (fn: (prev: BrandContext) => BrandContext) => void;
  onSave: () => void;
  fallback: BrandContext;
}) {
  const palette = draft.palette.length > 0 ? draft.palette : fallback.palette;
  const typeLines = draft.type.length > 0 ? draft.type : [''];

  return (
    <div data-testid="brand-profile-editor" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">knowledge</span>
        <ul className="flex flex-col gap-1.5">
          {draft.knowledgeSources.map((source, index) => (
            <li
              key={source.id}
              className="grid grid-cols-[1fr_auto] gap-1 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
            >
              <div className="grid gap-1">
                <input
                  aria-label={`knowledge source ${index + 1} note`}
                  value={source.note}
                  onChange={(e) =>
                    onChange((prev) => updateKnowledge(prev, index, { note: e.target.value }))
                  }
                  className="rounded-xs border border-transparent bg-transparent font-caption text-xs text-ink outline-none focus:border-accent focus:bg-surface-panel focus:px-1"
                />
                <input
                  aria-label={`knowledge source ${index + 1} label`}
                  value={source.label}
                  onChange={(e) =>
                    onChange((prev) => updateKnowledge(prev, index, { label: e.target.value }))
                  }
                  className="rounded-xs border border-transparent bg-transparent font-caption text-xs text-ink-dim outline-none focus:border-accent focus:bg-surface-panel focus:px-1"
                />
              </div>
              <button
                type="button"
                aria-label={`remove knowledge source ${index + 1}`}
                onClick={() =>
                  onChange((prev) => ({
                    ...prev,
                    knowledgeSources: prev.knowledgeSources.filter((_, i) => i !== index),
                  }))
                }
                className="grid h-6 w-6 place-items-center rounded-sm border border-border-soft text-ink-dim transition-colors hover:text-ink"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            onChange((prev) => ({
              ...prev,
              knowledgeSources: [
                ...prev.knowledgeSources,
                {
                  id: `source-${Date.now()}`,
                  kind: 'url',
                  note: 'brand source',
                  label: 'https://',
                },
              ],
            }))
          }
          className="inline-flex w-fit items-center gap-1 rounded-sm border border-border-soft px-2 py-1 font-caption text-xs text-ink-dim transition-colors hover:text-ink"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          source
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">palette</span>
        <div data-testid="brand-palette" className="flex flex-col gap-1">
          {palette.map((color, index) => (
            <div key={index} className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-1">
              <label className="relative h-7 w-7 overflow-hidden rounded-sm border border-border-soft">
                <span className="sr-only">{`pick colour ${index + 1}`}</span>
                <span
                  data-testid="brand-palette-chip"
                  className="block h-full w-full"
                  style={{ background: normalizeHexForInput(color) ?? '#000000' }}
                />
                <input
                  type="color"
                  aria-label={`pick colour ${index + 1}`}
                  value={normalizeHexForInput(color) ?? '#000000'}
                  onChange={(e) =>
                    onChange((prev) => updatePalette(prev, index, e.target.value))
                  }
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <input
                aria-label={`hex colour ${index + 1}`}
                value={color}
                onChange={(e) => onChange((prev) => updatePalette(prev, index, e.target.value))}
                className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink outline-none focus:border-accent"
              />
              <button
                type="button"
                aria-label={`remove colour ${index + 1}`}
                onClick={() =>
                  onChange((prev) => ({
                    ...prev,
                    palette: prev.palette.filter((_, i) => i !== index),
                  }))
                }
                className="grid h-7 w-7 place-items-center rounded-sm border border-border-soft text-ink-dim transition-colors hover:text-ink"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            onChange((prev) => ({ ...prev, palette: [...prev.palette, '#FFFFFF'] }))
          }
          className="inline-flex w-fit items-center gap-1 rounded-sm border border-border-soft px-2 py-1 font-caption text-xs text-ink-dim transition-colors hover:text-ink"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          colour
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">type</span>
        <ul className="flex flex-col gap-1">
          {typeLines.map((line, index) => (
            <li
              key={`type-${index}`}
              className="grid grid-cols-[1fr_auto] items-center gap-1 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
            >
              <input
                aria-label={`brand type ${index + 1}`}
                value={line}
                placeholder="e.g. Fraunces, editorial serif"
                onChange={(e) =>
                  onChange((prev) => {
                    const next = [...(prev.type.length > 0 ? prev.type : [''])];
                    next[index] = e.target.value;
                    return { ...prev, type: next };
                  })
                }
                style={{ fontFamily: cssFontFamilyForBrandType(line) }}
                className="rounded-xs border border-transparent bg-transparent text-sm text-ink outline-none focus:border-accent focus:bg-surface-panel focus:px-1"
              />
              {typeLines.length > 1 ? (
                <button
                  type="button"
                  aria-label={`remove brand type ${index + 1}`}
                  onClick={() =>
                    onChange((prev) => ({
                      ...prev,
                      type: prev.type.filter((_, i) => i !== index),
                    }))
                  }
                  className="text-ink-dim hover:text-ink"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            onChange((prev) => ({ ...prev, type: [...prev.type, ''] }))
          }
          className="self-start font-caption text-2xs text-ink-dim hover:text-ink"
        >
          + type
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">voice</span>
        <textarea
          aria-label="brand voice"
          rows={4}
          value={draft.voice}
          onChange={(e) => onChange((prev) => ({ ...prev, voice: e.target.value }))}
          className="resize-none rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 font-caption text-xs text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-soft pt-2">
        <span
          role={validationMessage || saveState === 'error' ? 'alert' : 'status'}
          className={`font-caption text-xs ${saveState === 'error' ? 'text-red-400' : 'text-ink-dim'}`}
        >
          {validationMessage ?? (saveState === 'error' ? 'save failed' : saveState === 'saved' ? 'saved' : dirty ? 'unsaved edits' : 'saved')}
        </span>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || Boolean(validationMessage)}
          className="inline-flex items-center gap-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted disabled:opacity-50"
        >
          {saveState === 'saved' && !dirty ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Save className="h-3 w-3" aria-hidden="true" />
          )}
          save
        </button>
      </div>
    </div>
  );
}

export function brandSectionSummary(context: BrandContext): string {
  return `${context.knowledgeSources.length} sources`;
}

function updatePalette(context: BrandContext, index: number, value: string): BrandContext {
  return {
    ...context,
    palette: context.palette.map((color, i) => (i === index ? value : color)),
  };
}

function updateKnowledge(
  context: BrandContext,
  index: number,
  patch: Partial<KnowledgeSource>
): BrandContext {
  return {
    ...context,
    knowledgeSources: context.knowledgeSources.map((source, i) =>
      i === index ? { ...source, ...patch } : source
    ),
  };
}

function normalizeHexForInput(value: string): string | null {
  const raw = value.trim();
  if (!HEX_RE.test(raw)) return null;
  const body = raw.replace(/^#/, '');
  if (body.length === 3) {
    return `#${body
      .split('')
      .map((ch) => `${ch}${ch}`)
      .join('')}`.toUpperCase();
  }
  return `#${body.toUpperCase()}`;
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Map a brand-type descriptor (e.g. "Fraunces · display", "editorial serif",
 * "mono caption") to a CSS font-family stack so the input renders in something
 * resembling the family it names. Best-effort — falls back to a generic family
 * when no concrete face is named. Renders the brand-type input *as itself* so
 * the field doubles as a live preview.
 */
function cssFontFamilyForBrandType(line: string): string {
  const lower = line.toLowerCase();
  const concrete = line.split(/[·,/-]/)[0]?.trim();
  const stack: string[] = [];
  if (concrete && /[A-Za-z]/.test(concrete) && !/^(editorial|mono|caption|display|serif|sans|sans-serif|grotesk|grotesque)$/i.test(concrete)) {
    stack.push(`'${concrete}'`);
  }
  if (/(mono|monospace|caption|code)/.test(lower)) {
    stack.push("'JetBrains Mono'", "'IBM Plex Mono'", 'ui-monospace', 'monospace');
  } else if (/(serif|editorial|display|fraunces|garamond|playfair)/.test(lower)) {
    stack.push("'Fraunces'", 'Georgia', 'serif');
  } else if (/(grotesk|grotesque|inter|sans|sans-serif|geist|helvetica)/.test(lower)) {
    stack.push("'Inter'", "'Geist'", 'system-ui', 'sans-serif');
  } else {
    stack.push('inherit');
  }
  return stack.join(', ');
}

function normalizeDraftForSave(context: BrandContext): BrandContext | null {
  const name = context.name.trim();
  if (!name) return null;
  const palette = context.palette
    .map(normalizeHexForInput)
    .filter((color): color is string => color !== null);
  if (palette.length !== context.palette.length) return null;

  return {
    ...context,
    name,
    palette,
    type: context.type.map((entry) => entry.trim()).filter(Boolean),
    voice: context.voice.trim(),
    knowledgeSources: context.knowledgeSources
      .map((source) => ({
        ...source,
        label: source.label.trim(),
        note: source.note.trim(),
      }))
      .filter((source) => source.label || source.note),
  };
}

function validateDraft(context: BrandContext): string | null {
  if (!context.name.trim()) return 'brand name required';
  const invalid = context.palette.find((color) => !normalizeHexForInput(color));
  if (invalid) return `invalid colour ${invalid}`;
  return null;
}

function parseCommaList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeOfferDraft(offer: OfferContext): OfferContext {
  return {
    ...offer,
    name: offer.name.trim(),
    summary: offer.summary.trim(),
    claims: offer.claims.map((claim) => claim.trim()).filter(Boolean),
    heroAsset: offer.heroAsset.trim(),
  };
}

function normalizeCampaignDraft(campaign: CampaignContext): CampaignContext {
  return {
    ...campaign,
    name: campaign.name.trim(),
    goal: campaign.goal.trim(),
    audience: campaign.audience.trim(),
    channels: campaign.channels.map((channel) => channel.trim()).filter(Boolean),
    cta: campaign.cta.trim(),
  };
}

function brandContextFromSnapshot(base: BrandContext, snapshot: BrandSnapshot): BrandContext {
  const palette = snapshot.palette
    .map((entry) => normalizeHexForInput(entry.hex))
    .filter((color): color is string => color !== null);
  const type = snapshot.typography
    .map((entry) => `${entry.family}${entry.role ? ` · ${entry.role}` : ''}`.trim())
    .filter(Boolean);
  const voice = snapshot.voice.samples.join('\n');
  const source = knowledgeSourceFromSnapshot(snapshot.source);

  return {
    ...base,
    name: brandNameFromSnapshotSource(snapshot.source) ?? base.name,
    palette: palette.length > 0 ? palette : base.palette,
    type: type.length > 0 ? type : base.type,
    voice: voice || base.voice,
    knowledgeSources: source
      ? [source, ...base.knowledgeSources.filter((entry) => entry.id !== source.id)]
      : base.knowledgeSources,
  };
}

function snapshotFromBrandContext(context: BrandContext): BrandSnapshot {
  const source = context.knowledgeSources[0];
  const sourceUrl = source?.label.startsWith('http')
    ? normalizeHttpUrlInput(source.label)
    : undefined;
  return {
    palette: context.palette
      .map((hex, index) => {
        const normalized = normalizeHexForInput(hex);
        if (!normalized) return null;
        return {
          hex: normalized,
          role: index === 0 ? 'primary' : index === 1 ? 'bg' : index === 2 ? 'accent' : 'neutral',
        } as const;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    typography: context.type.map((entry, index) => ({
      family: entry.split('·')[0]?.trim() || entry.trim(),
      role: index === 0 ? 'display' : entry.toLowerCase().includes('mono') ? 'mono' : 'body',
    })),
    voice: {
      samples: splitLines(context.voice).slice(0, 4),
      tone: context.voice
        .split(/[,.;\n]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 4),
    },
    logos: [],
    productImages: [],
    confidence: 0.72,
    source: {
      kind: source?.kind ?? 'manual',
      ...(sourceUrl ? { url: sourceUrl } : {}),
    },
  };
}

function proposalSourceLabel(snapshot: BrandSnapshot): string {
  if (snapshot.source.url) {
    try {
      const url = new URL(snapshot.source.url);
      return url.hostname.replace(/^www\./, '');
    } catch {
      return snapshot.source.url;
    }
  }
  return snapshot.source.kind || 'manual source';
}

function brandNameFromSnapshotSource(source: BrandSnapshotSource): string | undefined {
  if (!source.url) return undefined;
  try {
    const url = new URL(source.url);
    if (/github\.com$/i.test(url.hostname)) {
      const repo = url.pathname.split('/').filter(Boolean)[1];
      if (repo) return titleizeHostLabel(repo.replace(/\.git$/i, ''));
    }
    const ignored = new Set([
      'www',
      'app',
      'api',
      'assets',
      'cdn',
      'dev',
      'shop',
      'stage',
      'staging',
      'store',
      'sg',
      'uk',
      'us',
    ]);
    const labels = url.hostname
      .split('.')
      .slice(0, -1)
      .filter((label) => label && !ignored.has(label.toLowerCase()));
    const label = labels[0] ?? url.hostname.split('.').at(-2);
    return label ? titleizeHostLabel(label) : undefined;
  } catch {
    return undefined;
  }
}

function titleizeHostLabel(label: string): string {
  return label
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function knowledgeSourceFromSnapshot(source: BrandSnapshotSource): KnowledgeSource | null {
  if (!source.url) return null;
  const kind = source.kind === 'repo' ? 'repo' : 'url';
  const label = labelFromSourceUrl(source.url, kind);
  return {
    id: `${kind}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    kind: kind satisfies KnowledgeSourceKind,
    note: kind === 'repo' ? 'repo' : 'brand site',
    label,
  };
}

function labelFromSourceUrl(raw: string, kind: KnowledgeSourceKind): string {
  try {
    const url = new URL(raw);
    if (kind === 'repo') {
      const parts = url.pathname.split('/').filter(Boolean);
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : url.hostname;
    }
    return url.hostname.replace(/^www\./, '');
  } catch {
    return raw;
  }
}
