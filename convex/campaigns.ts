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
  researchBundle?: unknown;
  schedulePlan?: unknown;
  clusterBundle?: unknown;
  /**
   * Reference images the lap was fired with. Persisted at lap kickoff so
   * /inspect can confirm what visual identity anchors flowed into the
   * agent. We strip dataUrl payloads (they're huge — multi-MB base64) and
   * keep only the URL + hint. Surfaced on /inspect/[campaignId].
   */
  referenceImages?: Array<{ url?: string; hint?: string }>;
  /** URL ingestion bundle (title, description, og:image, body images,
   *  brand parse). Persisted so /inspect + /runs can show what was
   *  scraped from the trigger URL. */
  urlIngestion?: unknown;
}

interface CampaignVariationDoc {
  _id: unknown;
  campaignId: unknown;
  workspaceId?: string;
  index: number;
  status: 'pending' | 'running' | 'ready' | 'failed' | 'rejected';
  heroDirectionId?: string;
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
  atlasAssetId?: unknown;
  textOverlays?: unknown;
  textOverlayWarnings?: string[];
  nativePerFormatRendered?: string[];
  nativePerFormatUrls?: Partial<
    Record<'1x1' | '4x5' | '9x16' | '16x9', string>
  >;
  localizedPerFormatUrls?: unknown;
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
    researchBundle: doc.researchBundle,
    schedulePlan: doc.schedulePlan,
    clusterBundle: doc.clusterBundle,
    referenceImages: doc.referenceImages,
    urlIngestion: doc.urlIngestion,
  };
}

function toVariation(doc: CampaignVariationDoc) {
  return {
    id: String(doc._id),
    campaignId: String(doc.campaignId),
    workspaceId: doc.workspaceId,
    index: doc.index,
    status: doc.status,
    heroDirectionId: doc.heroDirectionId,
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
    atlasAssetId: doc.atlasAssetId ? String(doc.atlasAssetId) : undefined,
    textOverlays: doc.textOverlays,
    textOverlayWarnings: doc.textOverlayWarnings,
    nativePerFormatRendered: doc.nativePerFormatRendered,
    nativePerFormatUrls: doc.nativePerFormatUrls,
    localizedPerFormatUrls: doc.localizedPerFormatUrls,
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
    /** URL-only ref summary persisted for /inspect visibility. dataUrls
     *  stripped at the call site to keep the row small. */
    referenceImages: v.optional(
      v.array(
        v.object({
          url: v.optional(v.string()),
          hint: v.optional(v.string()),
        })
      )
    ),
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
      referenceImages: args.referenceImages,
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
    heroDirectionId: v.optional(v.string()),
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
    nativePerFormatUrls: v.optional(v.any()),
    localizedPerFormatUrls: v.optional(v.any()),
    atlasUrl: v.optional(v.string()),
    atlasAssetId: v.optional(v.id('asset')),
    textOverlays: v.optional(v.any()),
    nativePerFormatRendered: v.optional(v.array(v.string())),
    textOverlayWarnings: v.optional(v.array(v.string())),
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
      heroDirectionId: args.heroDirectionId,
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
      nativePerFormatUrls: args.nativePerFormatUrls,
      localizedPerFormatUrls: args.localizedPerFormatUrls,
      atlasUrl: args.atlasUrl,
      atlasAssetId: args.atlasAssetId,
      textOverlays: args.textOverlays,
      nativePerFormatRendered: args.nativePerFormatRendered,
      textOverlayWarnings: args.textOverlayWarnings,
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

/**
 * Recent campaigns across ALL workspaces — used by the /runs history page
 * so a creator can browse every lap they've ever fired without knowing the
 * workspaceId. Bounded at 100 to keep payloads small; `paginate` would be
 * the next step if a creator's history outgrows this cap.
 */
export const listRecent = queryGeneric({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 100);
    const campaigns = (await ctx.db
      .query('campaign')
      .order('desc')
      .take(limit)) as CampaignDoc[];
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
 * Swap the atlas URL on a variation without touching anything else. Called
 * from /api/auto-mode/post-now after re-rendering the atlas against the
 * creator's latest text edits. The variation is identified by string id so
 * the post-now route (which holds the variation as a string) can patch
 * without round-tripping through the typed v.id() form.
 */
export const setVariationAtlas = mutationGeneric({
  args: {
    variationId: v.string(),
    atlasUrl: v.string(),
    atlasAssetId: v.optional(v.id('asset')),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { atlasUrl: args.atlasUrl };
    if (args.atlasAssetId !== undefined) patch.atlasAssetId = args.atlasAssetId;
    await ctx.db.patch(args.variationId as any, patch);
    return null;
  },
});

export const setVariationRenderedMedia = mutationGeneric({
  args: {
    variationId: v.string(),
    atlasUrl: v.optional(v.string()),
    atlasAssetId: v.optional(v.id('asset')),
    nativePerFormatUrls: v.optional(v.any()),
    localizedPerFormatUrls: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.atlasUrl !== undefined) patch.atlasUrl = args.atlasUrl;
    if (args.atlasAssetId !== undefined) patch.atlasAssetId = args.atlasAssetId;
    if (args.nativePerFormatUrls !== undefined) {
      patch.nativePerFormatUrls = args.nativePerFormatUrls;
    }
    if (args.localizedPerFormatUrls !== undefined) {
      patch.localizedPerFormatUrls = args.localizedPerFormatUrls;
    }
    if (Object.keys(patch).length > 0) await ctx.db.patch(args.variationId as any, patch);
    return null;
  },
});

/**
 * Persist the B2 research bundle on the campaign row. Called from
 * runAutoMode after the research Managed Agent completes, before the
 * variation fan-out. Stored on the campaign so /inspect and the right
 * rail show research signals on page reload.
 */
export const setCampaignResearchBundle = mutationGeneric({
  args: {
    campaignId: v.id('campaign'),
    researchBundle: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.campaignId as any, {
      researchBundle: args.researchBundle,
    });
    return null;
  },
});

/**
 * Persist the signoff Managed Agent's schedule plan on the campaign row.
 * Called from runAutoMode after the signoff agent completes, before
 * scheduleVariationPosts. Surfaces in /inspect so creators can audit
 * which variations were auto-posted vs held vs rejected and why.
 */
export const setCampaignSchedulePlan = mutationGeneric({
  args: {
    campaignId: v.id('campaign'),
    schedulePlan: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.campaignId as any, {
      schedulePlan: args.schedulePlan,
    });
    return null;
  },
});

/**
 * Persist the cluster Managed Agent bundle on the campaign row. Mirrors
 * setCampaignResearchBundle / setCampaignSchedulePlan.
 */
export const setCampaignClusterBundle = mutationGeneric({
  args: {
    campaignId: v.id('campaign'),
    clusterBundle: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.campaignId as any, {
      clusterBundle: args.clusterBundle,
    });
    return null;
  },
});

/**
 * Persist the URL ingestion bundle on the campaign row so /inspect + /runs
 * expand can surface exactly what was scraped from the trigger URL —
 * title, description, og:image, body images, brand parse. The input that
 * feeds every downstream agent.
 */
export const setCampaignUrlIngestion = mutationGeneric({
  args: {
    campaignId: v.id('campaign'),
    urlIngestion: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.campaignId as any, {
      urlIngestion: args.urlIngestion,
    });
    return null;
  },
});

const DEFAULT_TEXT_LOCALE = 'en-SG';

type VariationTextOverlayRecord = {
  zone: { purpose: string; bbox?: unknown };
  content: Record<string, string>;
  formatContent?: Record<string, Record<string, string>>;
  textAlign?: string;
  scope?: string;
  metadata?: {
    sourceLocale?: string;
    translatedFrom?: Record<string, string>;
    translationProvider?: Record<string, string>;
    updatedAt?: number;
    provenance?: Record<string, unknown>;
    localOverrides?: Record<string, Record<string, boolean>>;
    heroDirectionId?: string;
  };
};

function deterministicTextTranslation(text: string, targetLocale: string): string {
  void text;
  void targetLocale;
  return '';
}

function cloneFormatContent(
  input: Record<string, Record<string, string>> | undefined
): Record<string, Record<string, string>> | undefined {
  if (!input) return undefined;
  const out: Record<string, Record<string, string>> = {};
  for (const [format, content] of Object.entries(input)) out[format] = { ...content };
  return out;
}

function cloneOverlayMetadata(
  metadata: VariationTextOverlayRecord['metadata']
): NonNullable<VariationTextOverlayRecord['metadata']> {
  return {
    ...(metadata ?? {}),
    translatedFrom: metadata?.translatedFrom ? { ...metadata.translatedFrom } : undefined,
    translationProvider: metadata?.translationProvider
      ? { ...metadata.translationProvider }
      : undefined,
    provenance: metadata?.provenance ? { ...metadata.provenance } : undefined,
    localOverrides: metadata?.localOverrides
      ? Object.fromEntries(
          Object.entries(metadata.localOverrides).map(([format, locales]) => [
            format,
            { ...locales },
          ])
        )
      : undefined,
  };
}

function markOverlayLocalOverride(
  metadata: NonNullable<VariationTextOverlayRecord['metadata']>,
  format: string,
  locale: string
) {
  metadata.localOverrides = {
    ...(metadata.localOverrides ?? {}),
    [format]: {
      ...(metadata.localOverrides?.[format] ?? {}),
      [locale]: true,
    },
  };
}

function clearOverlayLocalOverride(
  metadata: NonNullable<VariationTextOverlayRecord['metadata']>,
  format: string,
  locale: string
) {
  if (!metadata.localOverrides?.[format]?.[locale]) return;
  const nextFormat = { ...metadata.localOverrides[format] };
  delete nextFormat[locale];
  const next = { ...metadata.localOverrides };
  if (Object.keys(nextFormat).length > 0) next[format] = nextFormat;
  else delete next[format];
  metadata.localOverrides = Object.keys(next).length > 0 ? next : undefined;
}

function hasExplicitOverlayOverride(
  overlay: VariationTextOverlayRecord,
  format: string,
  locale: string
): boolean {
  if (overlay.metadata?.localOverrides?.[format]?.[locale] === true) return true;
  if (overlay.formatContent?.[format]?.[locale] === undefined) return false;
  return overlay.metadata?.translatedFrom?.[locale] !== DEFAULT_TEXT_LOCALE;
}

function applyVariationOverlayUpdate(
  overlay: VariationTextOverlayRecord,
  args: {
    variationId: string;
    heroDirectionId?: string;
    locale: string;
    format: string;
    scope: 'global' | 'local';
    role: string;
    text: string;
    translateLinked?: boolean;
    targetLocales?: string[];
    translations?: Record<string, string>;
    overwriteTranslations?: boolean;
  }
): VariationTextOverlayRecord {
  const metadata = cloneOverlayMetadata(overlay.metadata);
  metadata.sourceLocale = args.locale;
  if (args.heroDirectionId) metadata.heroDirectionId = args.heroDirectionId;
  metadata.updatedAt = Date.now();
  metadata.provenance = {
    ...(metadata.provenance ?? {}),
    kind: 'canvas-text-edit',
    variationId: args.variationId,
    heroDirectionId: args.heroDirectionId,
    role: args.role,
    locale: args.locale,
    format: args.format,
    scope: args.scope,
  };
  const next: VariationTextOverlayRecord = {
    ...overlay,
    content: { ...(overlay.content ?? {}) },
    formatContent: cloneFormatContent(overlay.formatContent),
    metadata,
  };

  if (args.scope === 'local') {
    next.formatContent = {
      ...(next.formatContent ?? {}),
      [args.format]: {
        ...(next.formatContent?.[args.format] ?? {}),
        [args.locale]: args.text,
      },
    };
    markOverlayLocalOverride(metadata, args.format, args.locale);
    delete metadata.translatedFrom?.[args.locale];
    delete metadata.translationProvider?.[args.locale];
    next.scope = 'global';
  } else {
    next.content[args.locale] = args.text;
    clearOverlayLocalOverride(metadata, args.format, args.locale);
    if (next.formatContent?.[args.format]) {
      delete next.formatContent[args.format][args.locale];
      if (Object.keys(next.formatContent[args.format]).length === 0) {
        delete next.formatContent[args.format];
      }
    }
    if (next.formatContent && Object.keys(next.formatContent).length === 0) {
      delete next.formatContent;
    }
  }

  if (args.locale === DEFAULT_TEXT_LOCALE && args.translateLinked) {
    for (const targetLocale of args.targetLocales ?? []) {
      if (targetLocale === args.locale) continue;
      const translated =
        args.translations?.[targetLocale]?.trim() ??
        deterministicTextTranslation(args.text, targetLocale);
      if (!translated) continue;
      if (args.scope === 'local') {
        if (
          !args.overwriteTranslations &&
          hasExplicitOverlayOverride(next, args.format, targetLocale)
        ) {
          continue;
        }
        next.formatContent = {
          ...(next.formatContent ?? {}),
          [args.format]: {
            ...(next.formatContent?.[args.format] ?? {}),
            [targetLocale]: translated,
          },
        };
      } else {
        next.content[targetLocale] = translated;
      }
      metadata.translatedFrom = {
        ...(metadata.translatedFrom ?? {}),
        [targetLocale]: args.locale,
      };
      metadata.translationProvider = {
        ...(metadata.translationProvider ?? {}),
        [targetLocale]: args.translations?.[targetLocale]
          ? 'agent'
          : 'deterministic-fallback',
      };
    }
  }

  return next;
}

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
    translateLinked: v.optional(v.boolean()),
    targetLocales: v.optional(v.array(v.string())),
    translations: v.optional(v.record(v.string(), v.string())),
    overwriteTranslations: v.optional(v.boolean()),
    heroDirectionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Best-effort patch: locate the variation row and update its textOverlays.
    // We use a raw query since we hold a string id, not the typed v.id().
    const variation = (await ctx.db.get(args.variationId as any)) as CampaignVariationDoc | null;
    if (!variation) return null;

    // Merge the new text into the existing textOverlays structure (any[]).
    const existingOverlays = (variation.textOverlays ?? []) as VariationTextOverlayRecord[];

    const updated = existingOverlays.map((ov) => {
      if (ov.zone.purpose !== args.role) return ov;
      if (
        args.heroDirectionId &&
        ov.metadata?.heroDirectionId &&
        ov.metadata.heroDirectionId !== args.heroDirectionId
      ) {
        return ov;
      }
      return applyVariationOverlayUpdate(ov, args);
    });

    // If no matching overlay was found (e.g. first edit), append a new entry.
    const hasMatch = existingOverlays.some((ov) => {
      if (ov.zone.purpose !== args.role) return false;
      if (
        args.heroDirectionId &&
        ov.metadata?.heroDirectionId &&
        ov.metadata.heroDirectionId !== args.heroDirectionId
      ) {
        return false;
      }
      return true;
    });
    if (!hasMatch) {
      updated.push({
        zone: { purpose: args.role },
        content: args.scope === 'global' ? { [args.locale]: args.text } : {},
        ...(args.scope === 'local'
          ? { formatContent: { [args.format]: { [args.locale]: args.text } } }
          : {}),
        scope: args.scope,
      } as VariationTextOverlayRecord);
      updated[updated.length - 1] = applyVariationOverlayUpdate(
        updated[updated.length - 1],
        args
      );
    }

    await ctx.db.patch(args.variationId as any, {
      textOverlays: updated,
    });

    return null;
  },
});
