import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

// Cluster kanban persistence + clustering orchestration (issue #26).
// Mirrors convex/signals.ts pattern: generic builders so convex/_generated is
// not needed at author time — `npx convex dev` regenerates the typed surface
// when the deployment is provisioned.

const COLUMN_VALIDATOR = v.union(
  v.literal('Found'),
  v.literal('Shortlisted'),
  v.literal('Generating'),
  v.literal('Hero')
);

const ATTRIBUTION_VALIDATOR = v.object({
  source: v.string(),
  author: v.optional(v.string()),
  url: v.string(),
});

interface CardDoc {
  _id: unknown;
  wsId?: unknown;
  referenceId: string;
  clusterId: string;
  clusterLabel: string;
  thumbnailUrl: string;
  attribution: { source: string; author?: string; url: string };
  score?: number;
  column: 'Found' | 'Shortlisted' | 'Generating' | 'Hero';
  embedding?: number[];
  movedAt: number;
}

function toCard(doc: CardDoc) {
  return {
    referenceId: doc.referenceId,
    clusterId: doc.clusterId,
    clusterLabel: doc.clusterLabel,
    thumbnailUrl: doc.thumbnailUrl,
    attribution: doc.attribution,
    score: doc.score,
    column: doc.column,
    movedAt: doc.movedAt,
  };
}

export const list = queryGeneric({
  args: { wsId: v.optional(v.id('workspace')) },
  handler: async (ctx, args) => {
    const docs: CardDoc[] = args.wsId
      ? ((await ctx.db
          .query('clusterCard')
          .withIndex('by_ws', (q: any) => q.eq('wsId', args.wsId))
          .order('asc')
          .take(1000)) as CardDoc[])
      : ((await ctx.db.query('clusterCard').order('asc').take(1000)) as CardDoc[]);
    return docs.map(toCard);
  },
});

export const upsertCard = mutationGeneric({
  args: {
    wsId: v.optional(v.id('workspace')),
    referenceId: v.string(),
    clusterId: v.string(),
    clusterLabel: v.optional(v.string()),
    thumbnailUrl: v.string(),
    attribution: ATTRIBUTION_VALIDATOR,
    score: v.optional(v.number()),
    column: v.optional(COLUMN_VALIDATOR),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args) => {
    const existing = (await ctx.db
      .query('clusterCard')
      .withIndex('by_reference', (q: any) => q.eq('referenceId', args.referenceId))
      .first()) as CardDoc | null;

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id as any, {
        clusterId: args.clusterId,
        clusterLabel: args.clusterLabel ?? existing.clusterLabel,
        thumbnailUrl: args.thumbnailUrl,
        attribution: args.attribution,
        score: args.score ?? existing.score,
        embedding: args.embedding ?? existing.embedding,
      });
      return String(existing._id);
    }

    const id = await ctx.db.insert('clusterCard', {
      wsId: args.wsId,
      referenceId: args.referenceId,
      clusterId: args.clusterId,
      clusterLabel: args.clusterLabel ?? `cluster ${args.clusterId}`,
      thumbnailUrl: args.thumbnailUrl,
      attribution: args.attribution,
      score: args.score,
      column: args.column ?? 'Found',
      embedding: args.embedding,
      movedAt: now,
    });
    return String(id);
  },
});

export const moveCard = mutationGeneric({
  args: {
    cardId: v.string(),
    to: COLUMN_VALIDATOR,
  },
  handler: async (ctx, args) => {
    const target = (await ctx.db
      .query('clusterCard')
      .withIndex('by_reference', (q: any) => q.eq('referenceId', args.cardId))
      .first()) as CardDoc | null;
    if (!target) return null;
    if (target.column === args.to) return null;

    const now = Date.now();
    const change = {
      wsId: target.wsId as any,
      cardId: args.cardId,
      fromColumn: target.column,
      toColumn: args.to,
      at: now,
    };

    // Hero is singleton — demote any existing Hero back to Shortlisted.
    if (args.to === 'Hero') {
      const priorHero = (await ctx.db
        .query('clusterCard')
        .withIndex('by_ws', (q: any) => q.eq('wsId', target.wsId))
        .collect()) as CardDoc[];
      for (const doc of priorHero) {
        if (doc._id === target._id) continue;
        if (doc.column === 'Hero') {
          await ctx.db.patch(doc._id as any, {
            column: 'Shortlisted',
            movedAt: now,
          });
        }
      }
    }

    await ctx.db.patch(target._id as any, {
      column: args.to,
      movedAt: now,
    });

    await ctx.db.insert('clusterStateChange', change);
    return change;
  },
});

export const relabel = mutationGeneric({
  args: {
    wsId: v.optional(v.id('workspace')),
    clusterId: v.string(),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const docs = (await ctx.db
      .query('clusterCard')
      .withIndex('by_cluster', (q: any) => q.eq('clusterId', args.clusterId))
      .collect()) as CardDoc[];
    let changed = 0;
    for (const doc of docs) {
      if (args.wsId !== undefined && doc.wsId !== args.wsId) continue;
      await ctx.db.patch(doc._id as any, { clusterLabel: args.label });
      changed += 1;
    }
    return changed;
  },
});

export const removeCard = mutationGeneric({
  args: { cardId: v.string() },
  handler: async (ctx, args) => {
    const target = (await ctx.db
      .query('clusterCard')
      .withIndex('by_reference', (q: any) => q.eq('referenceId', args.cardId))
      .first()) as CardDoc | null;
    if (!target) return;
    await ctx.db.delete(target._id as any);
  },
});

/**
 * `runClustering` takes pre-clustered items from the clip-modal provider and
 * writes them into `clusterCard` in one shot. Exposed as a mutation rather
 * than an action — the HTTP call to Modal stays on the Next.js route so the
 * Convex deployment stays free of outbound HTTP (and the typegen footprint
 * stays small for hackathon provisioning).
 */
export const runClustering = mutationGeneric({
  args: {
    wsId: v.optional(v.id('workspace')),
    items: v.array(
      v.object({
        referenceId: v.string(),
        clusterId: v.string(),
        thumbnailUrl: v.string(),
        attribution: ATTRIBUTION_VALIDATOR,
        score: v.optional(v.number()),
        embedding: v.optional(v.array(v.float64())),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const item of args.items) {
      const existing = (await ctx.db
        .query('clusterCard')
        .withIndex('by_reference', (q: any) => q.eq('referenceId', item.referenceId))
        .first()) as CardDoc | null;
      if (existing) {
        await ctx.db.patch(existing._id as any, {
          clusterId: item.clusterId,
          thumbnailUrl: item.thumbnailUrl,
          attribution: item.attribution,
          score: item.score ?? existing.score,
          embedding: item.embedding ?? existing.embedding,
        });
        continue;
      }
      await ctx.db.insert('clusterCard', {
        wsId: args.wsId,
        referenceId: item.referenceId,
        clusterId: item.clusterId,
        clusterLabel: `cluster ${item.clusterId}`,
        thumbnailUrl: item.thumbnailUrl,
        attribution: item.attribution,
        score: item.score,
        column: 'Found',
        embedding: item.embedding,
        movedAt: now,
      });
    }
    return { ok: true, inserted: args.items.length };
  },
});
