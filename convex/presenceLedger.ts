import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';
import {
  joinMetricsToPostedDrafts,
  type PresencePostMetric,
} from '@/lib/research/presence-metrics';

const METRIC = v.object({
  profileId: v.string(),
  postUrl: v.string(),
  capturedAt: v.string(),
  likes: v.number(),
  reposts: v.number(),
  replies: v.number(),
  impressions: v.optional(v.number()),
  pillar: v.optional(v.string()),
});

type PresenceLedgerDb = {
  query(table: 'presencePostMetric' | 'publishDraft'): {
    withIndex(name: string, fn: (q: { eq(field: string, value: unknown): unknown }) => unknown): {
      collect(): Promise<Array<Record<string, any>>>;
    };
  };
  insert(table: 'presencePostMetric' | 'publishDraft', doc: Record<string, unknown>): Promise<unknown>;
};

export async function listPresencePostMetricsForProfile(
  db: PresenceLedgerDb,
  input: { workspaceId: string; profileId: string }
): Promise<Array<PresencePostMetric & { workspaceId: string }>> {
  const rows = await db
    .query('presencePostMetric')
    .withIndex('by_workspace', (q) => q.eq('workspaceId', input.workspaceId))
    .collect();
  return rows
    .filter((row) => row.profileId === input.profileId)
    .map((row) => ({
      workspaceId: row.workspaceId,
      profileId: row.profileId,
      postUrl: row.postUrl,
      capturedAt: row.capturedAt,
      likes: row.likes,
      reposts: row.reposts,
      replies: row.replies,
      impressions: row.impressions,
      pillar: row.pillar ?? 'untagged',
    }));
}

export async function recordPresencePostMetricsForProfile(
  db: PresenceLedgerDb,
  input: {
    workspaceId: string;
    profileId: string;
    metrics: PresencePostMetric[];
  }
): Promise<{ inserted: number }> {
  const drafts = await db
    .query('publishDraft')
    .withIndex('by_workspace', (q) => q.eq('workspaceId', input.workspaceId))
    .collect();
  const tagged = joinMetricsToPostedDrafts(
    input.metrics.map((metric) => ({ ...metric, profileId: input.profileId })),
    drafts
      .filter(
        (row) =>
          row.profileId === input.profileId &&
          row.status === 'posted' &&
          typeof row.receiptUrl === 'string'
      )
      .map((row) => ({
        profileId: row.profileId,
        receiptUrl: row.receiptUrl,
        pillar: row.pillar,
      }))
  );
  let inserted = 0;
  for (const metric of tagged) {
    await db.insert('presencePostMetric', {
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      postUrl: metric.postUrl,
      capturedAt: metric.capturedAt,
      likes: metric.likes,
      reposts: metric.reposts,
      replies: metric.replies,
      impressions: metric.impressions,
      pillar: metric.pillar ?? 'untagged',
    });
    inserted += 1;
  }
  return { inserted };
}

export const listMetrics = queryGeneric({
  args: { workspaceId: v.string(), profileId: v.string() },
  handler: async (ctx, args) =>
    await listPresencePostMetricsForProfile(
      ctx.db as unknown as PresenceLedgerDb,
      args
    ),
});

export const recordMetrics = mutationGeneric({
  args: {
    workspaceId: v.string(),
    profileId: v.string(),
    metrics: v.array(METRIC),
  },
  handler: async (ctx, args) =>
    await recordPresencePostMetricsForProfile(
      ctx.db as unknown as PresenceLedgerDb,
      args
    ),
});
