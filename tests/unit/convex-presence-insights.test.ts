import { beforeEach, describe, expect, it } from 'vitest';
import {
  listReferenceAccountPostsForProfile,
  upsertReferenceAccountPostsForProfile,
} from '../../convex/presenceInsights';

function makeFakeDb() {
  const referenceAccountPost = new Map<string, Record<string, any>>();
  let seq = 1;
  return {
    referenceAccountPost,
    query(table: 'referenceAccountPost') {
      let predicate: (doc: Record<string, any>) => boolean = () => true;
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
        collect: async () => Array.from(referenceAccountPost.values()).filter(predicate),
      };
      return chain;
    },
    async insert(table: 'referenceAccountPost', doc: Record<string, unknown>) {
      const id = `${table}_${seq++}`;
      referenceAccountPost.set(id, { _id: id, ...doc });
      return id;
    },
  };
}

describe('convex/presenceInsights', () => {
  let db: ReturnType<typeof makeFakeDb>;

  beforeEach(() => {
    db = makeFakeDb();
  });

  it('persists profile-scoped reference account posts without duplicate captured triples', async () => {
    const input = {
      workspaceId: 'demo-ws',
      profileId: 'profile_personal',
      posts: [
        {
          handle: '@openai',
          postUrl: 'https://x.com/openai/status/1',
          text: '42% fewer failures.',
          postedAt: '2026-06-01T00:00:00Z',
          capturedAt: '2026-06-02T00:00:00Z',
          metrics: { likes: 10, reposts: 2, replies: 1 },
        },
        {
          handle: '@modal_labs',
          postUrl: 'https://x.com/modal_labs/status/2',
          text: 'How do you deploy agents?',
          postedAt: '2026-06-01T01:00:00Z',
          capturedAt: '2026-06-02T00:00:00Z',
          metrics: { likes: 8, reposts: 1, replies: 4 },
        },
      ],
    };

    expect(await upsertReferenceAccountPostsForProfile(db, input)).toEqual({
      inserted: 2,
      skipped: 0,
    });
    expect(await upsertReferenceAccountPostsForProfile(db, input)).toEqual({
      inserted: 0,
      skipped: 2,
    });

    const rows = await listReferenceAccountPostsForProfile(db, {
      workspaceId: 'demo-ws',
      profileId: 'profile_personal',
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      profileId: 'profile_personal',
      handle: '@openai',
      metrics: { likes: 10, reposts: 2, replies: 1 },
    });
  });
});
