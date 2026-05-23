import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

/**
 * Convex CRUD for per-event recap configs.
 *
 * The `data` field carries a SerializedEventConfig (see
 * lib/research/event-recap/event-config-serialize.ts). Callers
 * deserialize via `deserializeEventConfig` before passing to the
 * recap pipeline.
 */

export const get = queryGeneric({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('eventConfig')
      .withIndex('by_eventId', (q) => q.eq('eventId', args.eventId))
      .unique();
    if (!row) return null;
    return {
      eventId: row.eventId,
      data: row.data,
      updatedBy: row.updatedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
});

export const list = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('eventConfig').collect();
    return rows
      .map((row) => ({
        eventId: row.eventId,
        name: typeof row.data?.name === 'string' ? row.data.name : row.eventId,
        updatedAt: row.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/**
 * Upsert an event config. If a row exists for the eventId it is replaced
 * (last-write-wins; we don't merge). Callers should pass the full
 * SerializedEventConfig blob.
 */
export const put = mutationGeneric({
  args: {
    eventId: v.string(),
    data: v.any(),
    updatedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('eventConfig')
      .withIndex('by_eventId', (q) => q.eq('eventId', args.eventId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        data: args.data,
        updatedBy: args.updatedBy,
        updatedAt: now,
      });
      return existing._id;
    }
    return ctx.db.insert('eventConfig', {
      eventId: args.eventId,
      data: args.data,
      updatedBy: args.updatedBy,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutationGeneric({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('eventConfig')
      .withIndex('by_eventId', (q) => q.eq('eventId', args.eventId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
