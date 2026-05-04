import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

const PRODUCT_SOURCE = v.union(
  v.literal('catalog'),
  v.literal('research'),
  v.literal('manual')
);

const PRODUCT = v.object({
  id: v.string(),
  canonicalName: v.string(),
  brand: v.optional(v.string()),
  productName: v.optional(v.string()),
  aliases: v.array(v.string()),
  description: v.optional(v.string()),
  officialUrl: v.optional(v.string()),
  imageSearchQuery: v.optional(v.string()),
  source: PRODUCT_SOURCE,
  confidence: v.number(),
  updatedAt: v.optional(v.number()),
});

function productKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function uniqueAliases(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  ).slice(0, 40);
}

function toCatalogEntry(doc: any) {
  return {
    id: doc.id,
    canonicalName: doc.canonicalName,
    brand: doc.brand,
    productName: doc.productName,
    aliases: doc.aliases ?? [],
    description: doc.description,
    officialUrl: doc.officialUrl,
    imageSearchQuery: doc.imageSearchQuery,
    source: doc.source,
    confidence: doc.confidence,
    updatedAt: doc.updatedAt,
  };
}

export const list = queryGeneric({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query('productCatalog')
      .withIndex('by_workspace', (q: any) => q.eq('workspaceId', args.workspaceId))
      .order('desc')
      .take(200);
    return docs.map(toCatalogEntry);
  },
});

export const upsert = mutationGeneric({
  args: {
    workspaceId: v.string(),
    product: PRODUCT,
    aliases: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const key = productKey(args.product.canonicalName || args.product.id);
    const existing = await ctx.db
      .query('productCatalog')
      .withIndex('by_workspace_key', (q: any) =>
        q.eq('workspaceId', args.workspaceId).eq('productKey', key)
      )
      .first();
    const patch = {
      workspaceId: args.workspaceId,
      productKey: key,
      ...args.product,
      aliases: uniqueAliases([
        ...args.product.aliases,
        ...(args.aliases ?? []),
        args.product.canonicalName,
      ]),
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return String(existing._id);
    }
    return String(await ctx.db.insert('productCatalog', patch));
  },
});

export const remove = mutationGeneric({
  args: { workspaceId: v.string(), productId: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query('productCatalog')
      .withIndex('by_workspace', (q: any) => q.eq('workspaceId', args.workspaceId))
      .collect();
    let removed = 0;
    for (const doc of docs) {
      if (doc.id !== args.productId) continue;
      await ctx.db.delete(doc._id);
      removed += 1;
    }
    return removed;
  },
});
