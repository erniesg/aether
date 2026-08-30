import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

const LEVEL = v.union(
  v.literal('debug'),
  v.literal('info'),
  v.literal('warn'),
  v.literal('error')
);
const PLATFORM = v.union(v.literal('x'), v.literal('linkedin'), v.literal('youtube'));

interface RunEventDoc {
  _id: unknown;
  eventId: string;
  runId: string;
  tag: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  platform?: 'x' | 'linkedin' | 'youtube';
  data?: unknown;
  ts: number;
}

function toEvent(doc: RunEventDoc) {
  return {
    id: String(doc._id),
    eventId: doc.eventId,
    runId: doc.runId,
    tag: doc.tag,
    level: doc.level,
    message: doc.message,
    platform: doc.platform,
    data: doc.data,
    ts: doc.ts,
  };
}

/**
 * Append a structured run event to an event recap refresh. Called from the
 * server-side helper (lib/research/event-recap/run-events.ts). Append-only;
 * duplicate calls produce duplicate rows.
 */
export const recordRunEvent = mutationGeneric({
  args: {
    eventId: v.string(),
    runId: v.string(),
    tag: v.string(),
    level: LEVEL,
    message: v.string(),
    platform: v.optional(PLATFORM),
    data: v.optional(v.any()),
    ts: v.number(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('eventRecapRunEvent', {
      eventId: args.eventId,
      runId: args.runId,
      tag: args.tag,
      level: args.level,
      message: args.message,
      platform: args.platform,
      data: args.data,
      ts: args.ts,
    });
    return String(id);
  },
});

/**
 * List run events for an event, oldest first. Takes the newest `limit`
 * events then re-orders ascending so the caller renders a phased timeline.
 */
export const listByEvent = queryGeneric({
  args: {
    eventId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 300, 1000));
    const docs = (await ctx.db
      .query('eventRecapRunEvent')
      .withIndex('by_event_ts', (q: any) => q.eq('eventId', args.eventId))
      .order('desc')
      .take(limit)) as RunEventDoc[];
    return docs.reverse().map(toEvent);
  },
});
