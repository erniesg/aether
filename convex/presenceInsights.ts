import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';
import type { ReferenceAccountPost } from '@/lib/research/account-analysis';

const METRICS = v.object({
  likes: v.optional(v.number()),
  reposts: v.optional(v.number()),
  replies: v.optional(v.number()),
  impressions: v.optional(v.number()),
});

const POST = v.object({
  handle: v.string(),
  postUrl: v.string(),
  text: v.string(),
  postedAt: v.string(),
  capturedAt: v.string(),
  hasMedia: v.optional(v.boolean()),
  metrics: METRICS,
});

type PresenceInsightsDb = {
  query(table: 'referenceAccountPost'): {
    withIndex(name: string, fn: (q: { eq(field: string, value: unknown): unknown }) => unknown): {
      collect(): Promise<Array<Record<string, any>>>;
    };
  };
  insert(table: 'referenceAccountPost', doc: Record<string, unknown>): Promise<unknown>;
};

export async function listReferenceAccountPostsForProfile(
  db: PresenceInsightsDb,
  input: { workspaceId: string; profileId: string }
): Promise<Array<ReferenceAccountPost & { profileId: string; workspaceId: string }>> {
  const rows = await db
    .query('referenceAccountPost')
    .withIndex('by_workspace', (q) => q.eq('workspaceId', input.workspaceId))
    .collect();
  return rows
    .filter((row) => row.profileId === input.profileId)
    .map((row) => ({
      workspaceId: row.workspaceId,
      profileId: row.profileId,
      handle: row.handle,
      postUrl: row.postUrl,
      text: row.text,
      postedAt: row.postedAt,
      capturedAt: row.capturedAt,
      hasMedia: row.hasMedia,
      metrics: row.metrics,
    }));
}

export async function upsertReferenceAccountPostsForProfile(
  db: PresenceInsightsDb,
  input: {
    workspaceId: string;
    profileId: string;
    posts: ReferenceAccountPost[];
  }
): Promise<{ inserted: number; skipped: number }> {
  const existing = await listReferenceAccountPostsForProfile(db, input);
  const seen = new Set(existing.map(referencePostKey));
  let inserted = 0;
  let skipped = 0;
  for (const post of input.posts.slice(0, 50 * 50)) {
    const key = referencePostKey(post);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    await db.insert('referenceAccountPost', {
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      handle: post.handle,
      postUrl: post.postUrl,
      text: post.text,
      postedAt: post.postedAt,
      capturedAt: post.capturedAt,
      hasMedia: post.hasMedia,
      metrics: post.metrics,
    });
    inserted += 1;
  }
  return { inserted, skipped };
}

export const listReferencePosts = queryGeneric({
  args: { workspaceId: v.string(), profileId: v.string() },
  handler: async (ctx, args) =>
    await listReferenceAccountPostsForProfile(
      ctx.db as unknown as PresenceInsightsDb,
      args
    ),
});

export const upsertReferencePosts = mutationGeneric({
  args: {
    workspaceId: v.string(),
    profileId: v.string(),
    posts: v.array(POST),
  },
  handler: async (ctx, args) =>
    await upsertReferenceAccountPostsForProfile(
      ctx.db as unknown as PresenceInsightsDb,
      args
    ),
});

function referencePostKey(post: { handle: string; postUrl: string; capturedAt: string }) {
  return [post.handle.toLowerCase(), post.postUrl, post.capturedAt].join('\u0000');
}
