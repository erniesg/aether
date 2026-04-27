import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

const KNOWLEDGE_SOURCE = v.object({
  id: v.string(),
  kind: v.union(v.literal('url'), v.literal('repo'), v.literal('upload'), v.literal('asset')),
  label: v.string(),
  note: v.string(),
});

const BRAND = v.object({
  id: v.string(),
  name: v.string(),
  palette: v.array(v.string()),
  type: v.array(v.string()),
  voice: v.string(),
  knowledgeSources: v.array(KNOWLEDGE_SOURCE),
});

const OFFER = v.object({
  id: v.string(),
  name: v.string(),
  summary: v.string(),
  claims: v.array(v.string()),
  heroAsset: v.string(),
  heroAssetReferenceId: v.optional(v.string()),
});

const CAMPAIGN = v.object({
  id: v.string(),
  name: v.string(),
  goal: v.string(),
  audience: v.string(),
  channels: v.array(v.string()),
  cta: v.string(),
});

const WORKSPACE_CONTEXT = v.object({
  id: v.string(),
  referenceCount: v.number(),
  signalIds: v.array(v.string()),
  referenceIds: v.optional(v.array(v.string())),
  constraints: v.array(v.string()),
});

const ATTRIBUTION = v.object({
  source: v.string(),
  author: v.optional(v.string()),
  url: v.string(),
});

const REFERENCE_KIND = v.union(
  v.literal('image'),
  v.literal('video'),
  v.literal('embed'),
  v.literal('template'),
  v.literal('element')
);

const REFERENCE = v.object({
  id: v.string(),
  kind: REFERENCE_KIND,
  previewUrl: v.string(),
  fullUrl: v.optional(v.string()),
  attribution: ATTRIBUTION,
  capturedAt: v.string(),
  title: v.optional(v.string()),
  usageIntent: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  notes: v.optional(v.string()),
  clusterId: v.optional(v.string()),
});

async function firstByWorkspace(ctx: any, table: string, workspaceId: string) {
  return await ctx.db
    .query(table)
    .withIndex('by_workspace', (q: any) => q.eq('workspaceId', workspaceId))
    .first();
}

function stripDocId<T extends Record<string, unknown>>(doc: T | null) {
  if (!doc) return null;
  const { _id, _creationTime, workspaceId, updatedAt, ...record } = doc;
  void _id;
  void _creationTime;
  void workspaceId;
  void updatedAt;
  return record;
}

export const getBrand = queryGeneric({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => stripDocId(await firstByWorkspace(ctx, 'brandProfile', args.workspaceId)),
});

export const saveBrand = mutationGeneric({
  args: { workspaceId: v.string(), brand: BRAND },
  handler: async (ctx, args) => {
    const existing = await firstByWorkspace(ctx, 'brandProfile', args.workspaceId);
    const patch = { workspaceId: args.workspaceId, ...args.brand, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return String(existing._id);
    }
    return String(await ctx.db.insert('brandProfile', patch));
  },
});

export const getOffer = queryGeneric({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => stripDocId(await firstByWorkspace(ctx, 'offerProfile', args.workspaceId)),
});

export const saveOffer = mutationGeneric({
  args: { workspaceId: v.string(), offer: OFFER },
  handler: async (ctx, args) => {
    const existing = await firstByWorkspace(ctx, 'offerProfile', args.workspaceId);
    const patch = { workspaceId: args.workspaceId, ...args.offer, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return String(existing._id);
    }
    return String(await ctx.db.insert('offerProfile', patch));
  },
});

export const getCampaign = queryGeneric({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => stripDocId(await firstByWorkspace(ctx, 'campaignProfile', args.workspaceId)),
});

export const saveCampaign = mutationGeneric({
  args: { workspaceId: v.string(), campaign: CAMPAIGN },
  handler: async (ctx, args) => {
    const existing = await firstByWorkspace(ctx, 'campaignProfile', args.workspaceId);
    const patch = { workspaceId: args.workspaceId, ...args.campaign, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return String(existing._id);
    }
    return String(await ctx.db.insert('campaignProfile', patch));
  },
});

export const getWorkspaceContext = queryGeneric({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) =>
    stripDocId(await firstByWorkspace(ctx, 'workspaceContext', args.workspaceId)),
});

export const saveWorkspaceContext = mutationGeneric({
  args: { workspaceId: v.string(), inputSet: WORKSPACE_CONTEXT },
  handler: async (ctx, args) => {
    const existing = await firstByWorkspace(ctx, 'workspaceContext', args.workspaceId);
    const patch = {
      workspaceId: args.workspaceId,
      activeReferenceIds: args.inputSet.referenceIds ?? [],
      activeSignalIds: args.inputSet.signalIds,
      constraints: args.inputSet.constraints,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return String(existing._id);
    }
    return String(await ctx.db.insert('workspaceContext', patch));
  },
});

function toInputSet(doc: any) {
  if (!doc) return null;
  return {
    id: `input-set-${doc.workspaceId}`,
    referenceCount: doc.activeReferenceIds.length,
    signalIds: doc.activeSignalIds,
    referenceIds: doc.activeReferenceIds,
    constraints: doc.constraints,
  };
}

export const getInputSet = queryGeneric({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => toInputSet(await firstByWorkspace(ctx, 'workspaceContext', args.workspaceId)),
});

function toReference(doc: any) {
  return {
    id: String(doc._id),
    kind: doc.kind,
    previewUrl: doc.previewUrl,
    fullUrl: doc.fullUrl,
    attribution: doc.attribution,
    capturedAt: doc.capturedAt,
    title: doc.title,
    usageIntent: doc.usageIntent,
    tags: doc.tags ?? [],
    notes: doc.notes,
    clusterId: doc.clusterId,
  };
}

export const listReferences = queryGeneric({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query('creatorReference')
      .withIndex('by_workspace', (q: any) => q.eq('workspaceId', args.workspaceId))
      .order('desc')
      .take(500);
    return docs.map(toReference);
  },
});

export const addReference = mutationGeneric({
  args: { workspaceId: v.string(), reference: REFERENCE },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query('creatorReference')
      .withIndex('by_workspace', (q: any) => q.eq('workspaceId', args.workspaceId))
      .collect();
    const key = args.reference.fullUrl ?? args.reference.previewUrl;
    const existing = docs.find((doc: any) => (doc.fullUrl ?? doc.previewUrl) === key);
    if (existing) return String(existing._id);
    // The mutation accepts a client-side `id` for caller convenience
    // (so dedupe + audit on the wire is easier) but the table schema
    // does NOT carry that field — Convex generates the canonical _id
    // on insert. Strip it here so the row matches the validator.
    const { id: _clientRefId, ...refWithoutClientId } = args.reference;
    return String(
      await ctx.db.insert('creatorReference', {
        workspaceId: args.workspaceId,
        ...refWithoutClientId,
        tags: args.reference.tags ?? [],
        updatedAt: Date.now(),
      })
    );
  },
});

export const updateReference = mutationGeneric({
  args: { id: v.id('creatorReference'), patch: v.object({
    title: v.optional(v.string()),
    source: v.optional(v.string()),
    author: v.optional(v.string()),
    usageIntent: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    clusterId: v.optional(v.string()),
  }) },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) return;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.patch.source !== undefined || args.patch.author !== undefined) {
      patch.attribution = {
        ...doc.attribution,
        source: args.patch.source ?? doc.attribution.source,
        author: args.patch.author ?? doc.attribution.author,
      };
    }
    if (args.patch.title !== undefined) patch.title = args.patch.title;
    if (args.patch.usageIntent !== undefined) patch.usageIntent = args.patch.usageIntent;
    if (args.patch.tags !== undefined) patch.tags = args.patch.tags;
    if (args.patch.notes !== undefined) patch.notes = args.patch.notes;
    if (args.patch.clusterId !== undefined) patch.clusterId = args.patch.clusterId;
    await ctx.db.patch(args.id, patch);
  },
});

export const removeReference = mutationGeneric({
  args: { id: v.id('creatorReference') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
