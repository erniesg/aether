import { beforeEach, describe, expect, it } from 'vitest';
import {
  listPresencePostMetricsForProfile,
  recordPresencePostMetricsForProfile,
} from '../../convex/presenceLedger';

function makeFakeDb() {
  const presencePostMetric = new Map<string, Record<string, any>>();
  const publishDraft = new Map<string, Record<string, any>>();
  let seq = 1;
  return {
    presencePostMetric,
    publishDraft,
    query(table: 'presencePostMetric' | 'publishDraft') {
      let predicate: (doc: Record<string, any>) => boolean = () => true;
      const source = table === 'presencePostMetric' ? presencePostMetric : publishDraft;
      const chain = {
        withIndex: (_name: string, fn: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
          const filters: Array<[string, unknown]> = [];
          fn({
            eq: (field, value) => {
              filters.push([field, value]);
              predicate = (doc) => filters.every(([key, expected]) => doc[key] === expected);
              return chain;
            },
          });
          return chain;
        },
        collect: async () => Array.from(source.values()).filter(predicate),
      };
      return chain;
    },
    async insert(table: 'presencePostMetric' | 'publishDraft', doc: Record<string, unknown>) {
      const id = `${table}_${seq++}`;
      const source = table === 'presencePostMetric' ? presencePostMetric : publishDraft;
      source.set(id, { _id: id, ...doc });
      return id;
    },
  };
}

describe('convex/presenceLedger', () => {
  let db: ReturnType<typeof makeFakeDb>;

  beforeEach(() => {
    db = makeFakeDb();
  });

  it('appends profile-scoped metric snapshots and attributes pillars from posted permalinks', async () => {
    await db.insert('publishDraft', {
      workspaceId: 'demo-ws',
      profileId: 'profile_personal',
      kind: 'post',
      text: 'ship notes',
      pillar: 'agent harnesses',
      receiptUrl: 'https://x.com/aether/status/100',
      status: 'posted',
      createdAt: 1,
      updatedAt: 1,
      postedAt: 1,
    });
    await db.insert('publishDraft', {
      workspaceId: 'demo-ws',
      profileId: 'profile_product',
      kind: 'post',
      text: 'other profile',
      pillar: 'other',
      receiptUrl: 'https://x.com/aether/status/100',
      status: 'posted',
      createdAt: 1,
      updatedAt: 1,
      postedAt: 1,
    });

    expect(
      await recordPresencePostMetricsForProfile(db, {
        workspaceId: 'demo-ws',
        profileId: 'profile_personal',
        metrics: [
          metric('https://twitter.com/aether/status/100?s=20', '2026-06-11T00:00:00.000Z'),
          metric('https://x.com/aether/status/101', '2026-06-11T00:00:00.000Z'),
        ],
      })
    ).toEqual({ inserted: 2 });
    expect(
      await recordPresencePostMetricsForProfile(db, {
        workspaceId: 'demo-ws',
        profileId: 'profile_personal',
        metrics: [
          metric('https://x.com/aether/status/100', '2026-06-11T01:00:00.000Z'),
        ],
      })
    ).toEqual({ inserted: 1 });

    const personal = await listPresencePostMetricsForProfile(db, {
      workspaceId: 'demo-ws',
      profileId: 'profile_personal',
    });
    expect(personal).toHaveLength(3);
    expect(personal.map((row) => row.pillar)).toEqual([
      'agent harnesses',
      'untagged',
      'agent harnesses',
    ]);
    expect(
      await listPresencePostMetricsForProfile(db, {
        workspaceId: 'demo-ws',
        profileId: 'profile_product',
      })
    ).toEqual([]);
  });
});

function metric(postUrl: string, capturedAt: string) {
  return {
    profileId: 'profile_personal',
    postUrl,
    capturedAt,
    likes: 10,
    reposts: 2,
    replies: 1,
    impressions: 1000,
  };
}
