import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

const GENERATED_ASSET_KIND_VALIDATOR = v.union(
  v.literal('generated-image'),
  v.literal('background-plate'),
  v.literal('export-pack')
);

export const generateUploadUrl = mutationGeneric({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getUrl = queryGeneric({
  args: {
    storageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const recordGenerated = mutationGeneric({
  args: {
    wsId: v.optional(v.id('workspace')),
    storageId: v.id('_storage'),
    kind: GENERATED_ASSET_KIND_VALIDATOR,
    clientRunId: v.optional(v.string()),
    frameId: v.optional(v.string()),
    frameLabel: v.optional(v.string()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    prompt: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    mimeType: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error('storage URL not available');
    const assetId = await ctx.db.insert('generatedAsset', {
      ...args,
      url,
    });
    return {
      assetId,
      storageId: args.storageId,
      url,
    };
  },
});
