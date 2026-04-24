import type { ReferenceAttribution } from '@/lib/providers/reference/types';

export const COLUMN_ORDER = [
  'Found',
  'Shortlisted',
  'Generating',
  'Hero',
] as const;
export type ClusterColumn = (typeof COLUMN_ORDER)[number];

export function isClusterColumn(value: unknown): value is ClusterColumn {
  return (
    value === 'Found' ||
    value === 'Shortlisted' ||
    value === 'Generating' ||
    value === 'Hero'
  );
}

export interface ClusterCard {
  /** Unique per-card id — matches `referenceId` since each reference only has one card. */
  referenceId: string;
  /** Cluster id — stable string (`"-1"` is the noise bucket). */
  clusterId: string;
  /** Claude-assigned creative direction, 2-3 words. Falls back to an auto label. */
  clusterLabel: string;
  /** Preview image URL. */
  thumbnailUrl: string;
  attribution: ReferenceAttribution;
  /** HDBSCAN / ingest relevance score — optional. */
  score?: number;
  column: ClusterColumn;
  /** Last time the card was moved (or first created). Used to sort within column. */
  movedAt: number;
}

export interface ClusterStateChange {
  cardId: string;
  from: ClusterColumn;
  to: ClusterColumn;
  at: number;
}

export interface ClusterDirection {
  clusterId: string;
  label: string;
  memberCount: number;
}

export function groupFoundByCluster(
  cards: ReadonlyArray<ClusterCard>
): Array<{ direction: ClusterDirection; cards: ClusterCard[] }> {
  const byId = new Map<string, ClusterCard[]>();
  for (const card of cards) {
    if (card.column !== 'Found') continue;
    const list = byId.get(card.clusterId) ?? [];
    list.push(card);
    byId.set(card.clusterId, list);
  }
  const out: Array<{ direction: ClusterDirection; cards: ClusterCard[] }> = [];
  for (const [clusterId, list] of byId) {
    const label = list[0]?.clusterLabel ?? clusterId;
    out.push({
      direction: { clusterId, label, memberCount: list.length },
      cards: list.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    });
  }
  // Noise last; otherwise sort by member count desc, then by label.
  out.sort((a, b) => {
    if (a.direction.clusterId === '-1') return 1;
    if (b.direction.clusterId === '-1') return -1;
    const delta = b.direction.memberCount - a.direction.memberCount;
    if (delta !== 0) return delta;
    return a.direction.label.localeCompare(b.direction.label);
  });
  return out;
}

export function cardsForColumn(
  cards: ReadonlyArray<ClusterCard>,
  column: ClusterColumn
): ClusterCard[] {
  return cards
    .filter((c) => c.column === column)
    .slice()
    .sort((a, b) => b.movedAt - a.movedAt);
}

/**
 * Stable deterministic hue (0-360) for a clusterId. `-1` (noise) gets a
 * neutral grey assignment handled at render time.
 */
export function clusterHue(clusterId: string): number {
  if (clusterId === '-1') return 0;
  let hash = 0;
  for (let i = 0; i < clusterId.length; i++) {
    hash = (hash * 31 + clusterId.charCodeAt(i)) | 0;
  }
  // 6 slots evenly spaced so neighbouring clusters are distinguishable.
  const slot = Math.abs(hash) % 6;
  return slot * 60;
}
