'use client';

import { Check, Plus, RefreshCw, Save, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  saveOfferContext,
  useBrandContext,
  useOfferContext,
} from '@/lib/context/creator-store';
import type { OfferContext } from '@/lib/context/model';
import { useReferences } from '@/lib/references/store';
import {
  dismissProposedOffer,
  setProposedOffers,
  useProposedOffers,
  type ProposedOfferRow,
} from '@/lib/proposals/store';
import { brandSnapshotFromContext } from '@/lib/brand/snapshot-from-context';
import type { BrandFollowups } from '@/lib/brand/propose';
import type { BrandSnapshot } from '@/lib/brand/types';

type SaveState = 'idle' | 'saved';
type RegenState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

interface OfferSectionProps {
  workspaceId?: string;
  /** Test seam — overrides the real /api/brand/propose call. */
  regenerate?: (snapshot: BrandSnapshot) => Promise<BrandFollowups>;
}

async function defaultRegenerate(snapshot: BrandSnapshot, workspaceId?: string): Promise<BrandFollowups> {
  const res = await fetch('/api/brand/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot, workspaceId, scope: 'offers' }),
  });
  const json = (await res.json()) as {
    ok: boolean;
    offers?: BrandFollowups['offers'];
    campaigns?: BrandFollowups['campaigns'];
    coverage?: BrandFollowups['coverage'];
    error?: string;
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `regenerate failed: ${res.status}`);
  }
  return {
    offers: json.offers ?? [],
    campaigns: json.campaigns ?? [],
    coverage: json.coverage ?? { ok: true, notes: [] },
  };
}

export function OfferSection({ workspaceId, regenerate }: OfferSectionProps) {
  const saved = useOfferContext(workspaceId);
  const brand = useBrandContext(workspaceId);
  const references = useReferences(workspaceId);
  const proposedOffers = useProposedOffers(workspaceId);
  const [draft, setDraft] = useState<OfferContext>(saved);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [newClaim, setNewClaim] = useState('');
  const [regenState, setRegenState] = useState<RegenState>({ kind: 'idle' });

  // Two-phase hydration — see BrandSection for the rationale + symptoms
  // this fixes. Phase A (no edits) follows Convex; Phase B (after first
  // user input this session) is sticky to the local draft.
  const hasEdited = useRef(false);
  const lastWorkspaceId = useRef<string | undefined>(workspaceId);
  useEffect(() => {
    if (lastWorkspaceId.current !== workspaceId) {
      lastWorkspaceId.current = workspaceId;
      hasEdited.current = false;
      setDraft(saved);
      setDirty(false);
      return;
    }
    if (hasEdited.current) return;
    setDraft(saved);
  }, [workspaceId, saved]);

  const validationMessage = useMemo(() => {
    if (!draft.name.trim()) return 'offer name required';
    if (!draft.summary.trim()) return 'summary required';
    return null;
  }, [draft]);

  const updateDraft = (fn: (prev: OfferContext) => OfferContext) => {
    hasEdited.current = true;
    setDraft(fn);
    setDirty(true);
    setSaveState('idle');
  };

  const addClaim = () => {
    const claim = newClaim.trim();
    if (!claim) return;
    updateDraft((prev) => ({ ...prev, claims: [...prev.claims, claim] }));
    setNewClaim('');
  };

  const onSave = () => {
    if (validationMessage) return;
    const normalized: OfferContext = {
      ...draft,
      name: draft.name.trim(),
      summary: draft.summary.trim(),
      claims: draft.claims.map((claim) => claim.trim()).filter(Boolean),
      heroAsset: draft.heroAsset.trim(),
      heroAssetReferenceId: draft.heroAssetReferenceId || undefined,
    };
    saveOfferContext(normalized, workspaceId);
    // Note: do not setDraft(normalized) here — would reset focus/cursor on
    // the live input if the user is still editing. The save is a side
    // effect; the draft already mirrors what the user typed.
    setDirty(false);
    setSaveState('saved');
  };

  const acceptProposal = (row: ProposedOfferRow) => {
    const promoted: OfferContext = {
      id: row.proposalId,
      name: row.name,
      summary: row.summary,
      claims: row.claims,
      heroAsset: row.heroAsset,
    };
    saveOfferContext(promoted, workspaceId);
    hasEdited.current = false;
    setDraft(promoted);
    setDirty(false);
    setSaveState('saved');
    dismissProposedOffer(row.rowId, workspaceId);
  };

  const rejectProposal = (row: ProposedOfferRow) => {
    dismissProposedOffer(row.rowId, workspaceId);
  };

  const onRegenerate = async () => {
    setRegenState({ kind: 'loading' });
    try {
      const snapshot = brandSnapshotFromContext(brand);
      const followups = regenerate
        ? await regenerate(snapshot)
        : await defaultRegenerate(snapshot, workspaceId);
      // Mirror the server-side write into the in-memory store so memory-mode
      // clients (no Convex) still see the new cards. Convex-backed clients
      // get the rows reactively from the table the route just wrote to.
      setProposedOffers(followups.offers, workspaceId);
      setRegenState({ kind: 'idle' });
    } catch (err) {
      setRegenState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="offer-section">
      <div className="flex items-center justify-between gap-2">
        <span className="font-caption text-ink-dim">offer</span>
        <button
          type="button"
          aria-label="regenerate offers from brand"
          onClick={onRegenerate}
          disabled={regenState.kind === 'loading'}
          className="inline-flex items-center gap-1 rounded-sm border border-border-soft px-2 py-0.5 font-caption text-2xs text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3 w-3 ${regenState.kind === 'loading' ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {regenState.kind === 'loading' ? 'regenerating…' : 'regenerate from brand'}
        </button>
      </div>

      {regenState.kind === 'error' ? (
        <div
          role="alert"
          data-testid="offer-regenerate-error"
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
        >
          <span className="font-caption text-xs text-ink-dim">
            regenerate failed · {regenState.message}
          </span>
        </div>
      ) : null}

      {proposedOffers.length > 0 ? (
        <div data-testid="proposed-offers" className="flex flex-col gap-2">
          {proposedOffers.map((row) => (
            <div
              key={row.rowId}
              data-testid={`proposed-offer-${row.proposalId}`}
              className="flex flex-col gap-1 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
            >
              <div className="flex items-start justify-between gap-1">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-1">
                    <span
                      data-testid="ai-suggested-badge"
                      className="inline-flex items-center gap-0.5 rounded-pill border border-border-soft bg-surface-panel px-1.5 py-0.5 font-caption text-2xs text-ink-dim"
                    >
                      <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                      AI-suggested
                    </span>
                  </div>
                  <span className="truncate font-caption text-xs text-ink">{row.name}</span>
                  <span className="font-caption text-2xs leading-snug text-ink-dim">
                    {row.summary}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`accept proposed offer ${row.name}`}
                    onClick={() => acceptProposal(row)}
                    className="inline-flex items-center gap-0.5 rounded-sm border border-border-soft px-1.5 py-0.5 font-caption text-2xs text-ink-dim transition-colors hover:text-ink"
                  >
                    <Check className="h-2.5 w-2.5" aria-hidden="true" />
                    accept
                  </button>
                  <button
                    type="button"
                    aria-label={`reject proposed offer ${row.name}`}
                    onClick={() => rejectProposal(row)}
                    className="grid h-5 w-5 place-items-center rounded-sm text-ink-dim transition-colors hover:text-ink"
                  >
                    <X className="h-2.5 w-2.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {row.claims.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {row.claims.slice(0, 3).map((claim) => (
                    <span
                      key={claim}
                      className="rounded-pill border border-border-soft px-1.5 py-0.5 font-caption text-2xs text-ink-dim"
                    >
                      {claim}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <input
          aria-label="offer name"
          value={draft.name}
          onChange={(e) => updateDraft((prev) => ({ ...prev, name: e.target.value }))}
          className="rounded-sm border border-transparent bg-transparent px-0 py-0 font-display text-sm text-ink outline-none transition-colors focus:border-accent focus:bg-surface-panel-muted focus:px-1"
        />
        <textarea
          aria-label="offer summary"
          rows={2}
          value={draft.summary}
          onChange={(e) =>
            updateDraft((prev) => ({ ...prev, summary: e.target.value }))
          }
          className="resize-none rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 font-caption text-xs text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">claims</span>
        <div className="flex flex-col gap-1">
          {draft.claims.map((claim, index) => (
            <div key={index} className="flex items-center gap-1">
              <input
                aria-label={`offer claim ${index + 1}`}
                value={claim}
                onChange={(e) =>
                  updateDraft((prev) => ({
                    ...prev,
                    claims: prev.claims.map((entry, i) =>
                      i === index ? e.target.value : entry
                    ),
                  }))
                }
                className="min-w-0 flex-1 rounded-pill border border-border-soft bg-surface-panel-muted px-2 py-0.5 font-caption text-xs text-ink outline-none focus:border-accent"
              />
              <button
                type="button"
                aria-label={`remove offer claim ${index + 1}`}
                onClick={() =>
                  updateDraft((prev) => ({
                    ...prev,
                    claims: prev.claims.filter((_, i) => i !== index),
                  }))
                }
                className="grid h-7 w-7 place-items-center rounded-sm border border-border-soft text-ink-dim transition-colors hover:text-ink"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            aria-label="new offer claim"
            value={newClaim}
            onChange={(e) => setNewClaim(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addClaim();
              }
            }}
            placeholder="claim"
            className="min-w-0 flex-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={addClaim}
            disabled={!newClaim.trim()}
            className="inline-flex items-center gap-1 rounded-sm border border-border-soft px-2 py-1 font-caption text-xs text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            claim
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">hero asset</span>
        {references.length > 0 ? (
          <select
            aria-label="offer hero reference"
            value={draft.heroAssetReferenceId ?? ''}
            onChange={(e) => {
              const ref = references.find((entry) => entry.id === e.target.value);
              updateDraft((prev) => ({
                ...prev,
                heroAssetReferenceId: ref?.id,
                heroAsset:
                  ref?.title ??
                  ref?.attribution.author ??
                  ref?.attribution.source ??
                  prev.heroAsset,
              }));
            }}
            className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink outline-none focus:border-accent"
          >
            <option value="">manual asset</option>
            {references.map((ref) => (
              <option key={ref.id} value={ref.id}>
                {ref.title ?? ref.attribution.author ?? ref.attribution.source}
              </option>
            ))}
          </select>
        ) : null}
        <input
          aria-label="offer hero asset"
          value={draft.heroAsset}
          onChange={(e) =>
            updateDraft((prev) => ({
              ...prev,
              heroAsset: e.target.value,
              heroAssetReferenceId: undefined,
            }))
          }
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 font-caption text-xs text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-soft pt-2">
        <span
          role={validationMessage ? 'alert' : 'status'}
          className="font-caption text-xs text-ink-dim"
        >
          {validationMessage ?? (saveState === 'saved' ? 'saved' : dirty ? 'unsaved edits' : 'saved')}
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

export function offerSectionSummary(context: OfferContext): string {
  return `${context.claims.length} claims`;
}
