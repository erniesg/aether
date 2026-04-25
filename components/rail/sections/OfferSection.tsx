'use client';

import { Check, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  saveOfferContext,
  useOfferContext,
} from '@/lib/context/creator-store';
import type { OfferContext } from '@/lib/context/model';
import { useReferences } from '@/lib/references/store';

type SaveState = 'idle' | 'saved';

export function OfferSection({ workspaceId }: { workspaceId?: string }) {
  const saved = useOfferContext(workspaceId);
  const references = useReferences(workspaceId);
  const [draft, setDraft] = useState<OfferContext>(saved);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [newClaim, setNewClaim] = useState('');

  // Hydrate the draft from Convex *only* when the workspace itself changes.
  // Keying on `saved` instead would let our own write round-trip reset the
  // input mid-typing — the canonical "append-only" / "can't overwrite"
  // symptom on the offer panel. See BrandSection for the matching pattern.
  const hydratedFor = useRef<string | undefined>(workspaceId);
  useEffect(() => {
    if (hydratedFor.current === workspaceId) return;
    hydratedFor.current = workspaceId;
    setDraft(saved);
    setDirty(false);
  }, [workspaceId, saved]);

  const validationMessage = useMemo(() => {
    if (!draft.name.trim()) return 'offer name required';
    if (!draft.summary.trim()) return 'summary required';
    return null;
  }, [draft]);

  const updateDraft = (fn: (prev: OfferContext) => OfferContext) => {
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

  return (
    <div className="flex flex-col gap-3" data-testid="offer-section">
      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">offer</span>
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
