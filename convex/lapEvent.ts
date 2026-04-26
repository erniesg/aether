import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

const LEVEL = v.union(
  v.literal('debug'),
  v.literal('info'),
  v.literal('warn'),
  v.literal('error')
);

interface LapEventDoc {
  _id: unknown;
  campaignId: unknown;
  variationIndex?: number;
  tag: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: unknown;
  ts: number;
}

function toEvent(doc: LapEventDoc) {
  return {
    id: String(doc._id),
    campaignId: String(doc.campaignId),
    variationIndex: doc.variationIndex,
    tag: doc.tag,
    level: doc.level,
    message: doc.message,
    data: doc.data,
    ts: doc.ts,
  };
}

/**
 * Append a structured event to a lap. Called from server-side helpers
 * (lib/agent/lap-logger.ts → recordLapEvent). Idempotent only at the
 * append level — duplicate calls produce duplicate rows; callers that
 * want dedupe should pre-check.
 */
export const recordLapEvent = mutationGeneric({
  args: {
    campaignId: v.id('campaign'),
    variationIndex: v.optional(v.number()),
    tag: v.string(),
    level: LEVEL,
    message: v.string(),
    data: v.optional(v.any()),
    ts: v.number(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('lapEvent', {
      campaignId: args.campaignId,
      variationIndex: args.variationIndex,
      tag: args.tag,
      level: args.level,
      message: args.message,
      data: args.data,
      ts: args.ts,
    });
    return String(id);
  },
});

/**
 * List events for a campaign, oldest first. Caller paginates / tails as
 * needed. Returns the doc id as a string for stable React keys.
 */
export const listByCampaign = queryGeneric({
  args: {
    campaignId: v.id('campaign'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    const docs = (await ctx.db
      .query('lapEvent')
      .withIndex('by_campaign_ts', (q: any) =>
        q.eq('campaignId', args.campaignId)
      )
      .order('asc')
      .take(limit)) as LapEventDoc[];
    return docs.map(toEvent);
  },
});
