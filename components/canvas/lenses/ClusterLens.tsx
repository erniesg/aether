'use client';

import { useCallback, useMemo, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import { Loader2, Sparkles, WandSparkles } from 'lucide-react';
import {
  moveClusterCard,
  useClusters,
  type ClusterCard,
  type ClusterColumn,
} from '@/lib/clusters/store';
import { runAndLabelClusters } from '@/lib/clusters/client';
import { setFocusedClusterCard } from '@/lib/clusters/focus';
import {
  COLUMN_ORDER,
  cardsForColumn,
  clusterHue,
  groupFoundByCluster,
} from '@/lib/clusters/types';
import {
  buildMoodboardPrompt,
  buildMoodboardSpec,
  MOODBOARD_TWEAKS,
  type MoodboardSpec,
  type MoodboardTweak,
} from '@/lib/moodboard/model';
import { useReferences } from '@/lib/references/store';
import { cn } from '@/lib/utils/cn';

export interface ClusterLensProps {
  className?: string;
  workspaceId?: string;
  /**
   * Fires when the creator clicks a card. The workspace shell uses this to
   * open the right-rail focus panel for that card (hard rule #3 — output +
   * metadata lives on the right).
   */
  onCardFocus?: (card: ClusterCard) => void;
  /** Fires when the creator drops any card into the Hero column. */
  onHeroCommit?: (card: ClusterCard) => void;
  /** Sends a selected moodboard direction back to the bottom composer. */
  onMoodboardPrompt?: (prompt: string) => void;
  /** Runs generation from the selected moodboard direction. */
  onMoodboardGenerate?: (prompt: string) => void | Promise<void>;
}

type DragState = { cardId: string; from: ClusterColumn } | null;

const EMPTY_HINTS: Record<ClusterColumn, string> = {
  Found: 'Add references in the left rail',
  Shortlisted: 'Drag a card from Found to shortlist',
  Generating: 'Shortlisted cards seed variants',
  Hero: 'Promote one to commit the hero',
};

/**
 * The kanban cluster lens. Four hard-taxonomied columns:
 *
 *   Found · Shortlisted · Generating · Hero
 *
 * Cards in the Found column are further grouped by Claude-assigned cluster
 * label (restraint rule #6 — the group header is the only label). Drag
 * between columns persists through `moveClusterCard`, which emits typed
 * `ClusterStateChange` provenance records (hard rule #8).
 */
export function ClusterLens({
  className,
  workspaceId,
  onCardFocus,
  onHeroCommit,
  onMoodboardPrompt,
  onMoodboardGenerate,
}: ClusterLensProps) {
  const cards = useClusters();
  const references = useReferences(workspaceId);
  const handleCardFocus = useCallback(
    (card: ClusterCard) => {
      setFocusedClusterCard(card);
      onCardFocus?.(card);
    },
    [onCardFocus]
  );
  const [drag, setDrag] = useState<DragState>(null);
  const [runState, setRunState] = useState<
    | { kind: 'idle' }
    | { kind: 'running' }
    | { kind: 'error'; message: string }
    | { kind: 'fallback'; reason: string }
  >({ kind: 'idle' });
  const [dropTarget, setDropTarget] = useState<ClusterColumn | null>(null);
  const [moodboard, setMoodboard] = useState<{
    clusterId: string;
    tweaks: MoodboardTweak[];
  } | null>(null);

  const groupsByColumn = useMemo(() => {
    const out: Record<ClusterColumn, ClusterCard[]> = {
      Found: cardsForColumn(cards, 'Found'),
      Shortlisted: cardsForColumn(cards, 'Shortlisted'),
      Generating: cardsForColumn(cards, 'Generating'),
      Hero: cardsForColumn(cards, 'Hero'),
    };
    return out;
  }, [cards]);

  const foundGroups = useMemo(() => groupFoundByCluster(cards), [cards]);
  const moodboardSpec = useMemo<MoodboardSpec | null>(() => {
    if (!moodboard) return null;
    const clusterCards = cards.filter((card) => card.clusterId === moodboard.clusterId);
    if (clusterCards.length === 0) return null;
    return buildMoodboardSpec({
      clusterId: moodboard.clusterId,
      label: clusterCards[0]?.clusterLabel ?? `cluster ${moodboard.clusterId}`,
      cards: clusterCards,
      references,
      tweaks: moodboard.tweaks,
    });
  }, [cards, moodboard, references]);

  const setMoodboardCluster = useCallback((clusterId: string) => {
    setMoodboard((current) => ({
      clusterId,
      tweaks: current?.clusterId === clusterId ? current.tweaks : [],
    }));
  }, []);

  const toggleMoodboardTweak = useCallback((tweak: MoodboardTweak) => {
    setMoodboard((current) => {
      if (!current) return current;
      return {
        ...current,
        tweaks: current.tweaks.includes(tweak)
          ? current.tweaks.filter((entry) => entry !== tweak)
          : [...current.tweaks, tweak],
      };
    });
  }, []);

  const onRunClustering = useCallback(async () => {
    if (references.length === 0) return;
    setRunState({ kind: 'running' });
    try {
      const { run } = await runAndLabelClusters(references);
      if (run.ok === false) {
        setRunState({
          kind: 'error',
          message: run.error ?? 'clustering failed',
        });
        return;
      }
      const fallback = (run as { provider?: string }).provider === 'fallback';
      const fallbackReason =
        (run as { fallbackReason?: string }).fallbackReason ?? 'CLIP not configured';
      setRunState(
        fallback
          ? { kind: 'fallback', reason: fallbackReason }
          : { kind: 'idle' }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRunState({ kind: 'error', message });
    }
  }, [references]);

  const onDragStart = useCallback(
    (event: ReactDragEvent<HTMLElement>, card: ClusterCard) => {
      setDrag({ cardId: card.referenceId, from: card.column });
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.referenceId);
    },
    []
  );

  const onDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>, column: ClusterColumn) => {
      if (!drag) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget(column);
    },
    [drag]
  );

  const onDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    // Only clear when leaving the column entirely (relatedTarget outside).
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) return;
    setDropTarget(null);
  }, []);

  const onDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>, column: ClusterColumn) => {
      event.preventDefault();
      setDropTarget(null);
      const cardId = drag?.cardId ?? event.dataTransfer.getData('text/plain');
      if (!cardId) return;
      const change = moveClusterCard(cardId, column);
      setDrag(null);
      if (change && column === 'Hero') {
        const card = cards.find((c) => c.referenceId === cardId);
        if (card) onHeroCommit?.(card);
      }
    },
    [cards, drag, onHeroCommit]
  );

  const runDisabled = references.length === 0 || runState.kind === 'running';

  return (
    <div
      data-testid="cluster-lens"
      data-taxonomy="tool"
      className={cn(
        'pointer-events-auto absolute inset-0 z-[5] flex flex-col bg-surface-bg/95 backdrop-blur-sm',
        className
      )}
      aria-label="cluster lens"
    >
      <header
        className="flex items-center justify-between border-b border-border-soft bg-surface-panel/95 px-4 py-2"
      >
        <div className="flex items-baseline gap-3">
          <span className="font-display text-sm text-ink">clusters</span>
          <span className="font-caption text-ink-dim">
            {cards.length} card{cards.length === 1 ? '' : 's'} · {references.length} reference
            {references.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {runState.kind === 'error' ? (
            <span
              role="alert"
              data-testid="cluster-lens-error"
              className="font-caption text-[11px] text-ink-dim"
            >
              {runState.message}
            </span>
          ) : runState.kind === 'fallback' ? (
            <span className="font-caption text-[11px] text-ink-dim">
              fallback · {runState.reason}
            </span>
          ) : null}
          <button
            type="button"
            data-testid="cluster-lens-run"
            onClick={() => void onRunClustering()}
            disabled={runDisabled}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-sm border px-2 font-mono text-2xs uppercase tracking-wide',
              'border-border-soft bg-surface-panel text-ink transition-colors',
              'hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
            )}
          >
            {runState.kind === 'running' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} strokeWidth={1.75} />
            )}
            {runState.kind === 'running' ? 'clustering' : 'cluster refs'}
          </button>
        </div>
      </header>

      <div
        className="flex min-h-0 flex-1 overflow-hidden"
      >
        <div
          role="list"
          aria-label="cluster kanban"
          className="flex h-full flex-1 gap-3 overflow-x-auto px-3 py-3"
        >
          {COLUMN_ORDER.map((column) => (
            <section
              key={column}
              role="listitem"
              data-cluster-column={column}
              data-drop-target={dropTarget === column ? 'true' : undefined}
              onDragOver={(e) => onDragOver(e, column)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, column)}
              aria-label={`${column} column`}
              className={cn(
                'flex min-w-[248px] shrink-0 flex-col gap-2 rounded-md border border-border-soft bg-surface-panel-muted/80 p-2',
                dropTarget === column && 'border-accent bg-accent/5'
              )}
            >
              <header className="flex items-center justify-between px-1">
                <span className="font-mono text-2xs uppercase tracking-wide text-ink">
                  {column}
                </span>
                <span className="font-caption text-2xs text-ink-dim">
                  {groupsByColumn[column].length}
                </span>
              </header>

              {column === 'Found' ? (
                <FoundBody
                  groups={foundGroups}
                  activeMoodboardClusterId={moodboard?.clusterId}
                  onMoodboardOpen={setMoodboardCluster}
                  onDragStart={onDragStart}
                  onCardFocus={handleCardFocus}
                />
              ) : groupsByColumn[column].length === 0 ? (
                <EmptyHint hint={EMPTY_HINTS[column]} />
              ) : (
                <ul className="flex flex-col gap-1.5" data-testid={`cluster-column-${column}`}>
                  {groupsByColumn[column].map((card) => (
                    <CardTile
                      key={card.referenceId}
                      card={card}
                      onDragStart={onDragStart}
                      onCardFocus={handleCardFocus}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {moodboardSpec ? (
          <MoodboardPanel
            spec={moodboardSpec}
            onTweakToggle={toggleMoodboardTweak}
            onUsePrompt={() => onMoodboardPrompt?.(buildMoodboardPrompt(moodboardSpec))}
            onGenerate={() =>
              void onMoodboardGenerate?.(buildMoodboardPrompt(moodboardSpec))
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function FoundBody({
  groups,
  activeMoodboardClusterId,
  onMoodboardOpen,
  onDragStart,
  onCardFocus,
}: {
  groups: ReturnType<typeof groupFoundByCluster>;
  activeMoodboardClusterId?: string;
  onMoodboardOpen: (clusterId: string) => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>, card: ClusterCard) => void;
  onCardFocus?: (card: ClusterCard) => void;
}) {
  if (groups.length === 0) {
    return <EmptyHint hint={EMPTY_HINTS.Found} />;
  }
  return (
    <div className="flex flex-col gap-3">
      {groups.map(({ direction, cards }) => {
        const hue = clusterHue(direction.clusterId);
        const tagStyle =
          direction.clusterId === '-1'
            ? { borderColor: 'var(--color-border-soft)', color: 'var(--color-ink-dim)' }
            : { borderColor: `hsl(${hue} 40% 60%)`, color: `hsl(${hue} 40% 40%)` };
        return (
          <div
            key={direction.clusterId}
            data-cluster-group={direction.clusterId}
            className="flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide"
                style={tagStyle}
              >
                {direction.label}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="cluster-moodboard-open"
                  aria-label={`make moodboard ${direction.label}`}
                  aria-pressed={activeMoodboardClusterId === direction.clusterId}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    onMoodboardOpen(direction.clusterId);
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onFocus={() => onMoodboardOpen(direction.clusterId)}
                  onClick={() => onMoodboardOpen(direction.clusterId)}
                  className={cn(
                    'inline-flex h-5 w-5 items-center justify-center rounded-xs border border-transparent text-ink-dim transition-colors hover:border-border-soft hover:text-accent',
                    activeMoodboardClusterId === direction.clusterId && 'text-accent'
                  )}
                >
                  <WandSparkles size={12} strokeWidth={1.75} />
                </button>
                <span className="font-caption text-2xs text-ink-dim">
                  {direction.memberCount}
                </span>
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {cards.map((card) => (
                <CardTile
                  key={card.referenceId}
                  card={card}
                  onDragStart={onDragStart}
                  onCardFocus={onCardFocus}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function MoodboardPanel({
  spec,
  onTweakToggle,
  onUsePrompt,
  onGenerate,
}: {
  spec: MoodboardSpec;
  onTweakToggle: (tweak: MoodboardTweak) => void;
  onUsePrompt: () => void;
  onGenerate: () => void;
}) {
  const prompt = buildMoodboardPrompt(spec);
  return (
    <aside
      data-testid="moodboard-panel"
      aria-label="moodboard"
      className="flex w-[320px] shrink-0 flex-col gap-3 border-l border-border-soft bg-surface-panel/92 px-3 py-3"
    >
      <header className="flex items-center justify-between gap-2">
        <span className="truncate font-display text-sm text-ink">{spec.label}</span>
        <span className="font-caption text-2xs text-ink-dim">
          {spec.sources.length} refs
        </span>
      </header>

      <div className="grid grid-cols-3 gap-1" aria-label="moodboard sources">
        {spec.sources.slice(0, 6).map((source) => (
          <figure
            key={source.id}
            className="aspect-[4/5] overflow-hidden rounded-xs border border-border-soft bg-surface-panel-muted"
            title={source.title}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={source.thumbnailUrl}
              alt={source.title}
              className="h-full w-full object-cover"
            />
          </figure>
        ))}
      </div>

      <div className="flex flex-wrap gap-1" aria-label="moodboard tweaks">
        {MOODBOARD_TWEAKS.map((tweak) => {
          const active = spec.tweaks.includes(tweak);
          return (
            <button
              key={tweak}
              type="button"
              aria-pressed={active}
              onClick={() => onTweakToggle(tweak)}
              className={cn(
                'rounded-pill border px-2 py-0.5 font-caption text-xs transition-colors',
                active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border-soft bg-surface-panel-muted text-ink-dim hover:text-ink'
              )}
            >
              {tweak}
            </button>
          );
        })}
      </div>

      <p
        data-testid="moodboard-prompt"
        className="line-clamp-5 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-2 font-caption text-xs text-ink-dim"
      >
        {prompt}
      </p>

      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          data-testid="moodboard-use-prompt"
          onClick={onUsePrompt}
          className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-mono text-2xs uppercase tracking-wide text-ink transition-colors hover:border-accent hover:text-accent"
        >
          use prompt
        </button>
        <button
          type="button"
          data-testid="moodboard-generate"
          onClick={onGenerate}
          className="rounded-sm border border-accent bg-accent/10 px-2 py-1 font-mono text-2xs uppercase tracking-wide text-accent transition-colors hover:bg-accent/15"
        >
          generate
        </button>
      </div>
    </aside>
  );
}

function CardTile({
  card,
  onDragStart,
  onCardFocus,
}: {
  card: ClusterCard;
  onDragStart: (event: ReactDragEvent<HTMLElement>, card: ClusterCard) => void;
  onCardFocus?: (card: ClusterCard) => void;
}) {
  const author = card.attribution.author;
  const label = author
    ? `${card.attribution.source} · ${author}`
    : card.attribution.source;
  return (
    <li
      draggable
      onDragStart={(e) => onDragStart(e, card)}
      role="button"
      tabIndex={0}
      onClick={() => onCardFocus?.(card)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCardFocus?.(card);
        }
      }}
      data-testid="cluster-card"
      data-reference-id={card.referenceId}
      data-card-column={card.column}
      className={cn(
        'group flex cursor-grab items-center gap-2 rounded-xs border border-border-soft bg-surface-panel p-1.5',
        'transition-colors hover:border-accent/50 active:cursor-grabbing',
        'focus:border-accent focus:outline-none'
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.thumbnailUrl}
        alt={label}
        className="h-10 w-10 shrink-0 rounded-xs object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-caption text-xs text-ink" title={label}>
          {card.clusterLabel}
        </span>
        <span className="truncate font-mono text-[10px] uppercase tracking-wide text-ink-dim">
          {card.attribution.source}
        </span>
      </div>
    </li>
  );
}

function EmptyHint({ hint }: { hint: string }) {
  return (
    <div className="flex h-20 items-center justify-center rounded-xs border border-dashed border-border-soft px-2">
      <span className="text-center font-caption text-xs text-ink-faint">{hint}</span>
    </div>
  );
}
