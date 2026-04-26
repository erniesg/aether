'use client';

import { Check, Plus, RefreshCw, Save, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  saveCampaignContext,
  useBrandContext,
  useCampaignContext,
  useCreatorContext,
} from '@/lib/context/creator-store';
import { summarizeInputSet, type CampaignContext } from '@/lib/context/model';
import {
  dismissProposedCampaign,
  setProposedCampaigns,
  useProposedCampaigns,
  type ProposedCampaignRow,
} from '@/lib/proposals/store';
import { brandSnapshotFromContext } from '@/lib/brand/snapshot-from-context';
import type { BrandFollowups } from '@/lib/brand/propose';
import type { BrandSnapshot } from '@/lib/brand/types';

type SaveState = 'idle' | 'saved';
type RegenState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

interface CampaignSectionProps {
  workspaceId?: string;
  /** Test seam — overrides the real /api/brand/propose call. */
  regenerate?: (snapshot: BrandSnapshot) => Promise<BrandFollowups>;
}

async function defaultRegenerate(snapshot: BrandSnapshot, workspaceId?: string): Promise<BrandFollowups> {
  const res = await fetch('/api/brand/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot, workspaceId, scope: 'campaigns' }),
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

export function CampaignSection({ workspaceId, regenerate }: CampaignSectionProps) {
  const saved = useCampaignContext(workspaceId);
  const brand = useBrandContext(workspaceId);
  const creatorContext = useCreatorContext(workspaceId);
  const proposedCampaigns = useProposedCampaigns(workspaceId);
  const [draft, setDraft] = useState<CampaignContext>(saved);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [newChannel, setNewChannel] = useState('');
  const [regenState, setRegenState] = useState<RegenState>({ kind: 'idle' });

  // Two-phase hydration — see BrandSection for the rationale.
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
    if (!draft.name.trim()) return 'campaign name required';
    if (!draft.goal.trim()) return 'goal required';
    return null;
  }, [draft]);

  const suggestedChannels = useMemo(() => {
    const base = ['IG post', 'story', 'reel cover', 'pin', 'launch email'];
    const existing = new Set(draft.channels.map((channel) => channel.toLowerCase()));
    return base.filter((channel) => !existing.has(channel.toLowerCase())).slice(0, 3);
  }, [draft.channels]);

  const updateDraft = (fn: (prev: CampaignContext) => CampaignContext) => {
    hasEdited.current = true;
    setDraft(fn);
    setDirty(true);
    setSaveState('idle');
  };

  const addChannel = (value = newChannel) => {
    const channel = value.trim();
    if (!channel) return;
    updateDraft((prev) => ({
      ...prev,
      channels: prev.channels.some((entry) => entry.toLowerCase() === channel.toLowerCase())
        ? prev.channels
        : [...prev.channels, channel],
    }));
    setNewChannel('');
  };

  const onSave = () => {
    if (validationMessage) return;
    const normalized: CampaignContext = {
      ...draft,
      name: draft.name.trim(),
      goal: draft.goal.trim(),
      audience: draft.audience.trim(),
      channels: draft.channels.map((channel) => channel.trim()).filter(Boolean),
      cta: draft.cta.trim(),
    };
    saveCampaignContext(normalized, workspaceId);
    // Don't setDraft(normalized) — would race the live input.
    setDirty(false);
    setSaveState('saved');
  };

  const acceptProposal = (row: ProposedCampaignRow) => {
    const promoted: CampaignContext = {
      id: row.proposalId,
      name: row.name,
      goal: row.goal,
      audience: row.audience,
      channels: row.channels,
      cta: row.cta,
    };
    saveCampaignContext(promoted, workspaceId);
    hasEdited.current = false;
    setDraft(promoted);
    setDirty(false);
    setSaveState('saved');
    dismissProposedCampaign(row.rowId, workspaceId);
  };

  const rejectProposal = (row: ProposedCampaignRow) => {
    dismissProposedCampaign(row.rowId, workspaceId);
  };

  const onRegenerate = async () => {
    setRegenState({ kind: 'loading' });
    try {
      const snapshot = brandSnapshotFromContext(brand);
      const followups = regenerate
        ? await regenerate(snapshot)
        : await defaultRegenerate(snapshot, workspaceId);
      setProposedCampaigns(followups.campaigns, workspaceId);
      setRegenState({ kind: 'idle' });
    } catch (err) {
      setRegenState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="campaign-section">
      <div className="flex items-center justify-between gap-2">
        <span className="font-caption text-ink-dim">campaign</span>
        <button
          type="button"
          aria-label="regenerate campaigns from brand"
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
          data-testid="campaign-regenerate-error"
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
        >
          <span className="font-caption text-xs text-ink-dim">
            regenerate failed · {regenState.message}
          </span>
        </div>
      ) : null}

      {proposedCampaigns.length > 0 ? (
        <div data-testid="proposed-campaigns" className="flex flex-col gap-2">
          {proposedCampaigns.map((row) => (
            <div
              key={row.rowId}
              data-testid={`proposed-campaign-${row.proposalId}`}
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
                    {row.goal}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`accept proposed campaign ${row.name}`}
                    onClick={() => acceptProposal(row)}
                    className="inline-flex items-center gap-0.5 rounded-sm border border-border-soft px-1.5 py-0.5 font-caption text-2xs text-ink-dim transition-colors hover:text-ink"
                  >
                    <Check className="h-2.5 w-2.5" aria-hidden="true" />
                    accept
                  </button>
                  <button
                    type="button"
                    aria-label={`reject proposed campaign ${row.name}`}
                    onClick={() => rejectProposal(row)}
                    className="grid h-5 w-5 place-items-center rounded-sm text-ink-dim transition-colors hover:text-ink"
                  >
                    <X className="h-2.5 w-2.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {row.channels.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {row.channels.slice(0, 3).map((ch) => (
                    <span
                      key={ch}
                      className="rounded-pill border border-border-soft px-1.5 py-0.5 font-caption text-2xs text-ink-dim"
                    >
                      {ch}
                    </span>
                  ))}
                </div>
              ) : null}
              {row.cta ? (
                <span className="font-caption text-2xs italic text-ink-dim">{row.cta}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <input
          aria-label="campaign name"
          value={draft.name}
          onChange={(e) =>
            updateDraft((prev) => ({ ...prev, name: e.target.value }))
          }
          className="rounded-sm border border-transparent bg-transparent px-0 py-0 font-display text-sm text-ink outline-none transition-colors focus:border-accent focus:bg-surface-panel-muted focus:px-1"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">goal</span>
        <textarea
          aria-label="campaign goal"
          value={draft.goal}
          rows={3}
          onChange={(e) =>
            updateDraft((prev) => ({ ...prev, goal: e.target.value }))
          }
          className="resize-none rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">audience</span>
        <textarea
          aria-label="campaign audience"
          value={draft.audience}
          rows={2}
          onChange={(e) =>
            updateDraft((prev) => ({ ...prev, audience: e.target.value }))
          }
          className="resize-none rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 font-caption text-xs text-ink focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">channels</span>
        <div className="flex flex-col gap-1">
          {draft.channels.map((channel, index) => (
            <div key={index} className="flex items-center gap-1">
              <input
                aria-label={`campaign channel ${index + 1}`}
                value={channel}
                onChange={(e) =>
                  updateDraft((prev) => ({
                    ...prev,
                    channels: prev.channels.map((entry, i) =>
                      i === index ? e.target.value : entry
                    ),
                  }))
                }
                className="min-w-0 flex-1 rounded-pill border border-border-soft bg-surface-panel-muted px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-ink-dim outline-none focus:border-accent focus:text-ink"
              />
              <button
                type="button"
                aria-label={`remove campaign channel ${index + 1}`}
                onClick={() =>
                  updateDraft((prev) => ({
                    ...prev,
                    channels: prev.channels.filter((_, i) => i !== index),
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
            aria-label="new campaign channel"
            value={newChannel}
            onChange={(e) => setNewChannel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addChannel();
              }
            }}
            placeholder="format"
            className="min-w-0 flex-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => addChannel()}
            disabled={!newChannel.trim()}
            className="inline-flex items-center gap-1 rounded-sm border border-border-soft px-2 py-1 font-caption text-xs text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            channel
          </button>
        </div>
        {suggestedChannels.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {suggestedChannels.map((channel) => (
              <button
                key={channel}
                type="button"
                onClick={() => addChannel(channel)}
                className="rounded-pill border border-border-soft bg-surface-panel-muted px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:text-ink"
              >
                {channel}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">cta</span>
        <input
          aria-label="campaign cta"
          value={draft.cta}
          onChange={(e) => updateDraft((prev) => ({ ...prev, cta: e.target.value }))}
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 font-caption text-xs text-ink focus:border-accent focus:outline-none"
        />
      </div>

      <div className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-2">
        <span className="font-caption text-ink-dim">active input set</span>
        <p className="mt-1 font-caption text-xs text-ink">
          {summarizeInputSet({ ...creatorContext, campaign: draft })}
        </p>
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

export function campaignSectionSummary(context: CampaignContext): string {
  return `${context.channels.length} channels`;
}
