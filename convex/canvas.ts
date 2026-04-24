import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

interface CanvasSnapshotDoc {
  _id: unknown;
  wsKey?: string;
  tldrawStoreJson: string;
  snapshottedAt: number;
}

async function findLatestByWsKey(ctx: any, wsKey: string) {
  return (await ctx.db
    .query('canvasSnapshot')
    .withIndex('by_ws_key', (q: any) => q.eq('wsKey', wsKey))
    .order('desc')
    .first()) as CanvasSnapshotDoc | null;
}

export const latest = queryGeneric({
  args: { wsKey: v.string() },
  handler: async (ctx, args) => {
    const doc = await findLatestByWsKey(ctx, args.wsKey);
    if (!doc) return null;
    return {
      tldrawStoreJson: doc.tldrawStoreJson,
      snapshottedAt: doc.snapshottedAt,
    };
  },
});

export const save = mutationGeneric({
  args: {
    wsKey: v.string(),
    tldrawStoreJson: v.string(),
    snapshottedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await findLatestByWsKey(ctx, args.wsKey);
    if (existing) {
      await ctx.db.patch(existing._id as any, {
        tldrawStoreJson: args.tldrawStoreJson,
        snapshottedAt: args.snapshottedAt,
      });
      return existing._id;
    }

    return await ctx.db.insert('canvasSnapshot', args);
  },
});
