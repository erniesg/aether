import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

/**
 * Asset registry — the bridge between the Next runtime (which generates
 * heroes as data URLs) and the SAM3 / inpaint / scoring services that need
 * a fetchable public URL.
 *
 * Two-step upload pattern (Convex File Storage):
 *   1. Caller calls `generateUploadUrl` → gets a single-use POST URL
 *   2. Caller POSTs the bytes to that URL → receives { storageId }
 *   3. Caller calls `recordUploadedAsset` → returns a row id + public CDN URL
 *
 * The lib/storage/convexAsset.ts helper wraps the dance for Node callers.
 *
 * Uses *Generic builders because convex/_generated is not committed.
 */

const KIND_VALIDATOR = v.union(
  v.literal('hero'),
  v.literal('logo'),
  v.literal('product'),
  v.literal('reference'),
  v.literal('mask'),
  v.literal('cutout'),
  v.literal('other')
);

interface AssetDoc {
  _id: unknown;
  storageId: string;
  publicUrl: string;
  kind: string;
  mime: string;
  wsId?: unknown;
  campaignId?: unknown;
  sourceUrl?: string;
  width?: number;
  height?: number;
  bytes?: number;
  createdAt: number;
}

/** Step 1: caller obtains a signed POST URL. */
export const generateUploadUrl = mutationGeneric({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Step 3: caller links the freshly-uploaded storageId to a row. */
export const recordUploadedAsset = mutationGeneric({
  args: {
    storageId: v.string(),
    kind: KIND_VALIDATOR,
    mime: v.string(),
    wsId: v.optional(v.id('workspace')),
    campaignId: v.optional(v.id('campaign')),
    sourceUrl: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    bytes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new Error(
        `recordUploadedAsset: Convex returned no URL for storageId ${args.storageId}`
      );
    }
    const id = await ctx.db.insert('asset', {
      storageId: args.storageId,
      publicUrl: url,
      kind: args.kind,
      mime: args.mime,
      wsId: args.wsId,
      campaignId: args.campaignId,
      sourceUrl: args.sourceUrl,
      width: args.width,
      height: args.height,
      bytes: args.bytes,
      createdAt: Date.now(),
    });
    return { id: String(id), publicUrl: url };
  },
});

/** Read-back by row id. */
export const getAsset = queryGeneric({
  args: { id: v.id('asset') },
  handler: async (ctx, args) => {
    const doc = (await ctx.db.get(args.id as any)) as AssetDoc | null;
    if (!doc) return null;
    return {
      id: String(doc._id),
      storageId: doc.storageId,
      publicUrl: doc.publicUrl,
      kind: doc.kind,
      mime: doc.mime,
      wsId: doc.wsId ? String(doc.wsId) : undefined,
      campaignId: doc.campaignId ? String(doc.campaignId) : undefined,
      sourceUrl: doc.sourceUrl,
      width: doc.width,
      height: doc.height,
      bytes: doc.bytes,
      createdAt: doc.createdAt,
    };
  },
});

/** All assets for a workspace, newest first. */
export const listByWorkspace = queryGeneric({
  args: { wsId: v.id('workspace') },
  handler: async (ctx, args) => {
    const rows = (await ctx.db
      .query('asset')
      .withIndex('by_workspace', (q: any) => q.eq('wsId', args.wsId))
      .order('desc')
      .take(200)) as AssetDoc[];
    return rows.map((r) => ({
      id: String(r._id),
      storageId: r.storageId,
      publicUrl: r.publicUrl,
      kind: r.kind,
      mime: r.mime,
      sourceUrl: r.sourceUrl,
      width: r.width,
      height: r.height,
      createdAt: r.createdAt,
    }));
  },
});
