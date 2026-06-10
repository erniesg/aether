'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Check, Plus, Sparkles, Target, X } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { useCreatorContext } from '@/lib/context/creator-store';
import { addGeneratedDraftsToLocalQueue } from '@/lib/publish/draft-store';
import {
  presenceSectionSummary,
  usePresenceWorkspace,
} from '@/lib/presence/store';
import type {
  PresenceProfile,
  PresenceCreatorContext,
  GeneratedPresenceDraft,
  PresenceStrategyRecord,
  PresenceStrategyShape,
} from '@/lib/presence/types';
import { cn } from '@/lib/utils/cn';

export function PresenceSection({ workspaceId }: { workspaceId?: string }) {
  const { profiles, strategies, activeProfileId, actions } =
    usePresenceWorkspace(workspaceId);
  const creatorContext = useCreatorContext(workspaceId);
  const plannerContext = useMemo(
    () =>
      compactCreatorContext({
        brand: {
          name: creatorContext.brand.name,
          voice: creatorContext.brand.voice,
        },
        offer: {
          name: creatorContext.offer.name,
          summary: creatorContext.offer.summary,
          claims: creatorContext.offer.claims,
        },
        campaign: {
          name: creatorContext.campaign.name,
          goal: creatorContext.campaign.goal,
          audience: creatorContext.campaign.audience,
        },
      }),
    [creatorContext]
  );
  const strategiesByProfile = useMemo(() => {
    const map = new Map<string, PresenceStrategyRecord>();
    for (const strategy of strategies) map.set(strategy.profileId, strategy);
    return map;
  }, [strategies]);

  return (
    <div className="flex flex-col gap-3" data-testid="presence-section">
      <PresenceComposer
        onAdd={(input) => {
          actions.addProfile(input);
        }}
      />
      <section className="flex flex-col gap-1.5" aria-label="presence profiles">
        <span className="font-caption text-ink-dim">profiles</span>
        {profiles.length === 0 ? (
          <span className="font-caption text-xs text-ink-faint">
            add a handle and goal
          </span>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {profiles.map((profile) => (
              <PresenceRow
                key={profile.id}
                profile={profile}
                workspaceId={workspaceId ?? 'demo-ws'}
                creatorContext={plannerContext}
                active={profile.id === activeProfileId}
                strategy={strategiesByProfile.get(profile.id)}
                onActive={() => actions.setActiveProfile(profile.id)}
                onProposal={(strategy) =>
                  actions.saveStrategyProposal(profile.id, strategy)
                }
                onAccept={(strategyId) => actions.acceptStrategy(strategyId)}
                onReject={(strategyId) => actions.rejectStrategy(strategyId)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PresenceComposer({
  onAdd,
}: {
  onAdd(input: {
    label: string;
    xHandle: string;
    goal: string;
    targetMetric?: string;
  }): void;
}) {
  const [label, setLabel] = useState('');
  const [xHandle, setXHandle] = useState('');
  const [goal, setGoal] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onAdd({ label, xHandle, goal });
    setLabel('');
    setXHandle('');
    setGoal('');
  };

  const canSubmit = label.trim() && xHandle.trim() && goal.trim();

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-sm border border-border-soft bg-surface-panel-muted p-2"
      data-testid="presence-profile-form"
    >
      <div className="flex gap-1">
        <input
          aria-label="profile label"
          data-testid="presence-profile-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="label"
          className="min-w-0 flex-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        <input
          aria-label="x handle"
          data-testid="presence-profile-handle"
          value={xHandle}
          onChange={(event) => setXHandle(event.target.value)}
          placeholder="@handle"
          className="min-w-0 flex-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </div>
      <textarea
        aria-label="presence goal"
        data-testid="presence-profile-goal"
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        placeholder="goal"
        rows={2}
        className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        data-testid="presence-profile-add"
        disabled={!canSubmit}
        className="inline-flex items-center gap-1 self-end rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted disabled:opacity-50"
      >
        <Plus size={12} />
        add
      </button>
    </form>
  );
}

function PresenceRow({
  profile,
  workspaceId,
  creatorContext,
  active,
  strategy,
  onActive,
  onProposal,
  onAccept,
  onReject,
}: {
  profile: PresenceProfile;
  workspaceId: string;
  creatorContext?: PresenceCreatorContext;
  active: boolean;
  strategy?: PresenceStrategyRecord;
  onActive(): void;
  onProposal(strategy: PresenceStrategyShape): void;
  onAccept(strategyId: string): void;
  onReject(strategyId: string): void;
}) {
  const [busy, setBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftResult, setDraftResult] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const propose = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/presence/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, profile, creatorContext }),
      });
      const json = (await response.json()) as {
        ok?: boolean;
        strategy?: PresenceStrategyShape;
        fallback?: string;
        error?: string;
      };
      if (!response.ok || !json.ok || !json.strategy) {
        throw new Error(json.error || 'strategy failed');
      }
      onProposal(json.strategy);
      if (json.fallback) setNotice(`fallback · ${json.fallback}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const generateDrafts = async () => {
    if (strategy?.status !== 'accepted') return;
    setDraftBusy(true);
    setError('');
    try {
      const lapId = `presence_${profile.id}_${strategy.id}`;
      const response = await fetch('/api/presence/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, profile, strategy, lapId }),
      });
      const json = (await response.json()) as {
        ok?: boolean;
        drafts?: Array<{ kind?: string }>;
        error?: string;
      };
      if (!response.ok || !json.ok || !Array.isArray(json.drafts)) {
        throw new Error(json.error || 'draft generation failed');
      }
      addGeneratedDraftsToLocalQueue({
        workspaceId,
        profileId: profile.id,
        lapId,
        drafts: json.drafts.filter(isGeneratedPresenceDraft),
      });
      const posts = json.drafts.filter((draft) => draft.kind === 'post').length;
      const replies = json.drafts.filter((draft) => draft.kind === 'reply').length;
      setDraftResult(`${posts} posts · ${replies} replies`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDraftBusy(false);
    }
  };

  const canGenerate = strategy?.status === 'accepted';

  return (
    <li
      data-testid={`presence-profile-${slug(profile.label)}`}
      data-active={active ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-1.5 rounded-sm border px-2 py-1.5',
        active
          ? 'border-accent/60 bg-accent/5'
          : 'border-border-soft bg-surface-panel-muted'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Chip tone={active ? 'info' : 'neutral'} size="sm">
            {profile.label}
          </Chip>
          <span className="truncate font-caption text-xs text-ink-dim">
            {profile.xHandle}
          </span>
        </div>
        <button
          type="button"
          onClick={onActive}
          className="rounded-xs border border-transparent px-1 py-0.5 text-ink-dim transition-colors hover:border-border-soft hover:text-ink"
        >
          make active
        </button>
      </div>
      <div className="line-clamp-2 font-caption text-xs text-ink">
        {profile.goal}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1">
        <StrategyStatus strategy={strategy} />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={propose}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted disabled:opacity-50"
          >
            <Target size={12} />
            {busy ? 'proposing' : 'propose strategy'}
          </button>
          {strategy?.status === 'proposed' ? (
            <>
              <button
                type="button"
                aria-label="accept strategy"
                onClick={() => onAccept(strategy.id)}
                className="rounded-sm border border-border-soft bg-surface-panel px-1.5 py-1 text-ink transition-colors hover:bg-surface-panel-muted"
              >
                <Check size={12} />
              </button>
              <button
                type="button"
                aria-label="reject strategy"
                onClick={() => onReject(strategy.id)}
                className="rounded-sm border border-border-soft bg-surface-panel px-1.5 py-1 text-ink transition-colors hover:bg-surface-panel-muted"
              >
                <X size={12} />
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="font-caption text-xs text-ink-faint">
          {canGenerate ? draftResult || 'draft lap ready' : 'accept a strategy first'}
        </span>
        <button
          type="button"
          onClick={generateDrafts}
          disabled={!canGenerate || draftBusy}
          className="inline-flex items-center gap-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted disabled:opacity-50"
        >
          <Sparkles size={12} />
          {draftBusy ? 'generating' : 'generate drafts'}
        </button>
      </div>
      {strategy && strategy.pillars.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {strategy.pillars.slice(0, 5).map((pillar) => (
            <Chip key={pillar.name} tone="neutral" size="sm">
              {pillar.name}
            </Chip>
          ))}
        </div>
      ) : null}
      {error ? (
        <span className="font-caption text-xs text-danger">{error}</span>
      ) : null}
      {notice ? (
        <span className="font-caption text-xs text-ink-faint">{notice}</span>
      ) : null}
    </li>
  );
}

function StrategyStatus({ strategy }: { strategy?: PresenceStrategyRecord }) {
  if (!strategy) {
    return <span className="font-caption text-xs text-ink-faint">no strategy</span>;
  }
  if (strategy.status === 'accepted') {
    return (
      <span className="font-caption text-xs text-ink-dim">
        accepted · {strategy.pillars.length} pillars
      </span>
    );
  }
  return <span className="font-caption text-xs text-ink-dim">{strategy.status}</span>;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function compactCreatorContext(context: PresenceCreatorContext): PresenceCreatorContext | undefined {
  const out: PresenceCreatorContext = {};
  if (context.brand?.name.trim()) {
    out.brand = {
      name: context.brand.name.trim(),
      voice: context.brand.voice?.trim() || undefined,
    };
  }
  if (context.offer?.name.trim()) {
    out.offer = {
      name: context.offer.name.trim(),
      summary: context.offer.summary?.trim() || undefined,
      claims: (context.offer.claims ?? []).map((claim) => claim.trim()).filter(Boolean),
    };
  }
  if (context.campaign?.name.trim()) {
    out.campaign = {
      name: context.campaign.name.trim(),
      goal: context.campaign.goal?.trim() || undefined,
      audience: context.campaign.audience?.trim() || undefined,
    };
  }
  return out.brand || out.offer || out.campaign ? out : undefined;
}

function isGeneratedPresenceDraft(input: unknown): input is GeneratedPresenceDraft {
  if (!input || typeof input !== 'object') return false;
  const draft = input as Record<string, unknown>;
  const receipt = draft.receipt as Record<string, unknown> | undefined;
  return (
    (draft.kind === 'post' || draft.kind === 'reply') &&
    typeof draft.text === 'string' &&
    draft.text.trim().length > 0 &&
    typeof draft.pillar === 'string' &&
    draft.pillar.trim().length > 0 &&
    Boolean(receipt) &&
    (receipt?.kind === 'evidence-fact' || receipt?.kind === 'signal-post') &&
    typeof receipt.ref === 'string' &&
    receipt.ref.trim().length > 0 &&
    (draft.targetUrl === undefined || typeof draft.targetUrl === 'string')
  );
}

export { presenceSectionSummary };
