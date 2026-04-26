import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

// Auto-Mode campaign ledger — handoff §9.
//
// One `campaign` row per Auto-Mode lap. N `campaignVariation` children per
// `variationCount`. The agent loop that drives each variation logs every
// tool step into `capabilityRun` already (lib/agent/multi.ts → recordRun*),
// so the cross-link is the variation's `agentRunIds[]` array of clientRunIds.
//
// Uses *Generic builders because `convex/_generated` is not committed.

const TRIGGER_KIND = v.union(v.literal('url'), v.literal('file'), v.literal('text'));
const NOTIFY_MODE = v.union(
  v.literal('notify'),
  v.literal('review'),
  v.literal('auto-post')
);
const CAMPAIGN_STATUS = v.union(
  v.literal('running'),
  v.literal('completed'),
  v.literal('failed')
);
const VARIATION_STATUS = v.union(
  v.literal('pending'),
  v.literal('running'),
  v.literal('ready'),
  v.literal('failed')
);

interface CampaignDoc {
  _id: unknown;
  workspaceId?: string;
  triggerKind: 'url' | 'file' | 'text';
  triggerPayload: string;
  variationCount: number;
  notifyMode: 'notify' | 'review' | 'auto-post';
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

interface CampaignVariationDoc {
  _id: unknown;
  campaignId: unknown;
  workspaceId?: string;
  index: number;
  status: 'pending' | 'running' | 'ready' | 'failed' | 'rejected';
  heroImageUrl?: string;
  heroAssetId?: unknown;
  caption?: string;
  captionsByLocale?: unknown;
  hashtags?: string[];
  moodNote?: string;
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
  formatCrops?: unknown;
  agentRunIds: string[];
  atlasUrl?: string;
  textOverlays?: unknown;
  nativePerFormatRendered?: string[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

function toCampaign(doc: CampaignDoc) {
  return {
    id: String(doc._id),
    workspaceId: doc.workspaceId,
    triggerKind: doc.triggerKind,
    triggerPayload: doc.triggerPayload,
    variationCount: doc.variationCount,
    notifyMode: doc.notifyMode,
    status: doc.status,
    startedAt: doc.startedAt,
    finishedAt: doc.finishedAt,
    error: doc.error,
  };
}

function toVariation(doc: CampaignVariationDoc) {
  return {
    id: String(doc._id),
    campaignId: String(doc.campaignId),
    workspaceId: doc.workspaceId,
    index: doc.index,
    status: doc.status,
    heroImageUrl: doc.heroImageUrl,
    heroAssetId: doc.heroAssetId ? String(doc.heroAssetId) : undefined,
    caption: doc.caption,
    captionsByLocale: doc.captionsByLocale,
    hashtags: doc.hashtags,
    moodNote: doc.moodNote,
    schedulePlatform: doc.schedulePlatform,
    scheduleWhenLocal: doc.scheduleWhenLocal,
    formatCrops: doc.formatCrops,
    atlasUrl: doc.atlasUrl,
    textOverlays: doc.textOverlays,
    nativePerFormatRendered: doc.nativePerFormatRendered,
    agentRunIds: doc.agentRunIds,
    error: doc.error,
    startedAt: doc.startedAt,
    finishedAt: doc.finishedAt,
  };
}

export const startCampaign = mutationGeneric({
  args: {
    workspaceId: v.optional(v.string()),
    triggerKind: TRIGGER_KIND,
    triggerPayload: v.string(),
    variationCount: v.number(),
    notifyMode: NOTIFY_MODE,
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('campaign', {
      workspaceId: args.workspaceId,
      triggerKind: args.triggerKind,
      triggerPayload: args.triggerPayload,
      variationCount: args.variationCount,
      notifyMode: args.notifyMode,
      status: 'running',
      startedAt: Date.now(),
    });
    return String(id);
  },
});

export const setCampaignStatus = mutationGeneric({
  args: {
    campaignId: v.id('campaign'),
    status: CAMPAIGN_STATUS,
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { status: args.status };
    if (args.status !== 'running') patch.finishedAt = Date.now();
    if (args.error) patch.error = args.error;
    await ctx.db.patch(args.campaignId as any, patch);
    return null;
  },
});

export const insertVariation = mutationGeneric({
  args: {
    campaignId: v.id('campaign'),
    workspaceId: v.optional(v.string()),
    index: v.number(),
    status: VARIATION_STATUS,
    heroImageUrl: v.optional(v.string()),
    heroAssetId: v.optional(v.id('asset')),
    caption: v.optional(v.string()),
    captionsByLocale: v.optional(v.any()),
    hashtags: v.optional(v.array(v.string())),
    moodNote: v.optional(v.string()),
    schedulePlatform: v.optional(v.string()),
    scheduleWhenLocal: v.optional(v.string()),
    formatCrops: v.optional(v.any()),
    masksOneShot: v.optional(v.any()),
    masksVisionGuided: v.optional(v.any()),
    agentRunIds: v.array(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert('campaignVariation', {
      campaignId: args.campaignId,
      workspaceId: args.workspaceId,
      index: args.index,
      status: args.status,
      heroImageUrl: args.heroImageUrl,
      heroAssetId: args.heroAssetId,
      caption: args.caption,
      captionsByLocale: args.captionsByLocale,
      hashtags: args.hashtags,
      moodNote: args.moodNote,
      schedulePlatform: args.schedulePlatform,
      scheduleWhenLocal: args.scheduleWhenLocal,
      formatCrops: args.formatCrops,
      masksOneShot: args.masksOneShot,
      masksVisionGuided: args.masksVisionGuided,
      agentRunIds: args.agentRunIds,
      error: args.error,
      startedAt: now,
      finishedAt: args.status === 'ready' || args.status === 'failed' ? now : undefined,
    });
    return String(id);
  },
});

export const get = queryGeneric({
  args: { campaignId: v.id('campaign') },
  handler: async (ctx, args) => {
    const campaign = (await ctx.db.get(args.campaignId as any)) as CampaignDoc | null;
    if (!campaign) return null;
    const variations = (await ctx.db
      .query('campaignVariation')
      .withIndex('by_campaign', (q: any) => q.eq('campaignId', args.campaignId))
      .collect()) as CampaignVariationDoc[];
    return {
      campaign: toCampaign(campaign),
      variations: variations.sort((a, b) => a.index - b.index).map(toVariation),
    };
  },
});

export const listByWorkspace = queryGeneric({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const campaigns = (await ctx.db
      .query('campaign')
      .withIndex('by_workspace', (q: any) => q.eq('workspaceId', args.workspaceId))
      .order('desc')
      .take(20)) as CampaignDoc[];
    return campaigns.map(toCampaign);
  },
});

/** List all variations for a campaign — used by the right-rail live panel. */
export const listVariations = queryGeneric({
  args: { campaignId: v.id('campaign') },
  handler: async (ctx, args) => {
    const variations = (await ctx.db
      .query('campaignVariation')
      .withIndex('by_campaign', (q: any) => q.eq('campaignId', args.campaignId))
      .collect()) as CampaignVariationDoc[];
    return variations.sort((a, b) => a.index - b.index).map(toVariation);
  },
});

/** Mark a variation as rejected so the right-rail card updates immediately. */
export const rejectVariation = mutationGeneric({
  args: { variationId: v.id('campaignVariation') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.variationId as any, {
      status: 'rejected',
      finishedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Persist a text overlay edit from the canvas (Lane A).
 *
 * Called by `buildGlobalTextPropagator` when a global-scoped text shape is
 * edited on the canvas. The mutation records the new copy so that:
 *   1. The change survives page refreshes (canvas hydrates from Convex).
 *   2. Collaborative cursors see the update immediately.
 *   3. The right-rail provenance log can show "user edited headline on 2026-04-28".
 *
 * We store the overlay on the campaignVariation's `textOverlays` field as an
 * updated entry. The variation is identified by its string id so this works
 * even when the Convex document id is a branded type at runtime.
 */
export const updateVariationOverlay = mutationGeneric({
  args: {
    /** The variation's Convex document id (string representation). */
    variationId: v.string(),
    /** BCP-47 locale code of the cell that was edited (e.g. 'en-SG'). */
    locale: v.string(),
    /** Format id of the frame that was edited (e.g. '1x1'). */
    format: v.string(),
    /** Scope of the change: 'global' fans out, 'local' stays per-cell. */
    scope: v.union(v.literal('global'), v.literal('local')),
    /** Role/zone of the overlay (e.g. 'headline', 'cta', 'body'). */
    role: v.string(),
    /** New text content after the edit. */
    text: v.string(),
  },
  handler: async (ctx, args) => {
    // Best-effort patch: locate the variation row and update its textOverlays.
    // We use a raw query since we hold a string id, not the typed v.id().
    const variation = (await ctx.db.get(args.variationId as any)) as CampaignVariationDoc | null;
    if (!variation) return null;

    // Merge the new text into the existing textOverlays structure (any[]).
    const existingOverlays = (variation.textOverlays ?? []) as Array<{
      zone: { purpose: string; bbox?: unknown };
      content: Record<string, string>;
      textAlign?: string;
      scope?: string;
    }>;

    const updated = existingOverlays.map((ov) => {
      if (ov.zone.purpose !== args.role) return ov;
      return {
        ...ov,
        content: {
          ...(ov.content ?? {}),
          // When global: update all locale entries to the new text.
          // When local: update only the specific locale.
          ...(args.scope === 'global'
            ? Object.fromEntries(
                Object.keys(ov.content ?? { [args.locale]: '' }).map((loc) => [loc, args.text])
              )
            : { [args.locale]: args.text }),
        },
      };
    });

    // If no matching overlay was found (e.g. first edit), append a new entry.
    const hasMatch = existingOverlays.some((ov) => ov.zone.purpose === args.role);
    if (!hasMatch) {
      updated.push({
        zone: { purpose: args.role },
        content: { [args.locale]: args.text },
        scope: args.scope,
      });
    }

    await ctx.db.patch(args.variationId as any, {
      textOverlays: updated,
    });

    return null;
  },
});
