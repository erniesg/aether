import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  moveClusterCard,
  resetClustersForTests,
  upsertClusterCard,
  useClusterLog,
  useClusters,
  relabelCluster,
} from '@/lib/clusters/store';
import {
  cardsForColumn,
  clusterHue,
  groupFoundByCluster,
} from '@/lib/clusters/types';

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_CONVEX_URL;
  window.localStorage.clear();
  resetClustersForTests();
});

afterEach(() => {
  window.localStorage.clear();
});

const BASE_ATTR = { source: 'pinterest', url: 'https://pin.it/xyz' };

function card(
  referenceId: string,
  clusterId = '0',
  overrides: Partial<Parameters<typeof upsertClusterCard>[0]> = {}
) {
  return upsertClusterCard({
    referenceId,
    clusterId,
    clusterLabel: `direction ${clusterId}`,
    thumbnailUrl: `https://img.example.com/${referenceId}.png`,
    attribution: BASE_ATTR,
    ...overrides,
  });
}

describe('clusters store — drag state machine', () => {
  it('defaults a newly upserted card to the Found column', () => {
    const c = card('ref-01');
    expect(c.column).toBe('Found');
    const { result } = renderHook(() => useClusters());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].column).toBe('Found');
  });

  it('moveClusterCard transitions Found → Shortlisted and emits a typed state change', () => {
    card('ref-01');
    const { result: logResult } = renderHook(() => useClusterLog());
    let change;
    act(() => {
      change = moveClusterCard('ref-01', 'Shortlisted');
    });
    expect(change).toMatchObject({
      cardId: 'ref-01',
      from: 'Found',
      to: 'Shortlisted',
    });
    expect(typeof change!.at).toBe('number');
    expect(logResult.current).toHaveLength(1);
    expect(logResult.current[0]).toMatchObject({
      cardId: 'ref-01',
      from: 'Found',
      to: 'Shortlisted',
    });
  });

  it('moveClusterCard returns null when the column is already the target (no-op)', () => {
    card('ref-01');
    let result;
    act(() => {
      result = moveClusterCard('ref-01', 'Found');
    });
    expect(result).toBeNull();
  });

  it('returns null for an unknown cardId (noop, no log entry)', () => {
    card('ref-01');
    let result;
    act(() => {
      result = moveClusterCard('not-a-card', 'Shortlisted');
    });
    expect(result).toBeNull();
    const { result: logResult } = renderHook(() => useClusterLog());
    expect(logResult.current).toHaveLength(0);
  });

  it('Hero is singleton — promoting a second card demotes the prior Hero back to Shortlisted', () => {
    card('ref-01');
    card('ref-02');
    act(() => {
      moveClusterCard('ref-01', 'Hero');
    });
    const { result } = renderHook(() => useClusters());
    expect(result.current.find((c) => c.referenceId === 'ref-01')?.column).toBe('Hero');
    act(() => {
      moveClusterCard('ref-02', 'Hero');
    });
    const cards = result.current;
    expect(cards.find((c) => c.referenceId === 'ref-01')?.column).toBe('Shortlisted');
    expect(cards.find((c) => c.referenceId === 'ref-02')?.column).toBe('Hero');
  });

  it('upsertClusterCard preserves the existing column when called twice (idempotent ingest)', () => {
    card('ref-01');
    act(() => {
      moveClusterCard('ref-01', 'Shortlisted');
    });
    card('ref-01'); // second call — e.g. re-running clustering
    const { result } = renderHook(() => useClusters());
    const found = result.current.find((c) => c.referenceId === 'ref-01');
    expect(found?.column).toBe('Shortlisted');
  });

  it('relabelCluster overwrites the label across every matching card and returns the count', () => {
    card('ref-01', '0');
    card('ref-02', '0');
    card('ref-03', '1');
    const changed = relabelCluster('0', 'slow morning light');
    expect(changed).toBe(2);
    const { result } = renderHook(() => useClusters());
    const labels = result.current.map((c) => c.clusterLabel).sort();
    expect(labels).toEqual([
      'direction 1',
      'slow morning light',
      'slow morning light',
    ]);
  });
});

describe('cluster types — helpers', () => {
  it('groupFoundByCluster only buckets Found cards and sorts noise last', () => {
    const cards = [
      { referenceId: 'a', clusterId: '0', clusterLabel: 'soft dawn', thumbnailUrl: '', attribution: BASE_ATTR, column: 'Found' as const, movedAt: 1 },
      { referenceId: 'b', clusterId: '0', clusterLabel: 'soft dawn', thumbnailUrl: '', attribution: BASE_ATTR, column: 'Found' as const, movedAt: 1 },
      { referenceId: 'c', clusterId: '-1', clusterLabel: 'noise', thumbnailUrl: '', attribution: BASE_ATTR, column: 'Found' as const, movedAt: 1 },
      { referenceId: 'd', clusterId: '1', clusterLabel: 'raw city', thumbnailUrl: '', attribution: BASE_ATTR, column: 'Shortlisted' as const, movedAt: 1 },
    ];
    const groups = groupFoundByCluster(cards);
    expect(groups.map((g) => g.direction.clusterId)).toEqual(['0', '-1']);
    expect(groups[0].cards).toHaveLength(2);
    expect(groups[0].direction.memberCount).toBe(2);
  });

  it('cardsForColumn filters and sorts by movedAt descending', () => {
    const cards = [
      { referenceId: 'a', clusterId: '0', clusterLabel: '', thumbnailUrl: '', attribution: BASE_ATTR, column: 'Shortlisted' as const, movedAt: 1 },
      { referenceId: 'b', clusterId: '0', clusterLabel: '', thumbnailUrl: '', attribution: BASE_ATTR, column: 'Shortlisted' as const, movedAt: 3 },
      { referenceId: 'c', clusterId: '0', clusterLabel: '', thumbnailUrl: '', attribution: BASE_ATTR, column: 'Found' as const, movedAt: 2 },
    ];
    const out = cardsForColumn(cards, 'Shortlisted');
    expect(out.map((c) => c.referenceId)).toEqual(['b', 'a']);
  });

  it('clusterHue yields a stable 0-360 value; noise always resolves to 0', () => {
    expect(clusterHue('-1')).toBe(0);
    const a = clusterHue('cluster-77');
    const b = clusterHue('cluster-77');
    expect(a).toBe(b);
    expect(a % 60).toBe(0);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(360);
  });
});
