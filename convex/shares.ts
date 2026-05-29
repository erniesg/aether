import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

const SHARE_PLATFORM = v.union(
  v.literal('x'),
  v.literal('linkedin'),
  v.literal('facebook'),
  v.literal('whatsapp'),
  v.literal('telegram'),
  v.literal('copy'),
  v.literal('native'),
  v.literal('unknown')
);
const SHARE_OBJECT_TYPE = v.union(
  v.literal('vibes_page'),
  v.literal('event_recap'),
  v.literal('brand_page'),
  v.literal('canvas'),
  v.literal('render'),
  v.literal('pack'),
  v.literal('moodboard')
);
const SHARE_EVENT_TYPE = v.union(
  v.literal('share_link_created'),
  v.literal('platform_clicked'),
  v.literal('copy_link'),
  v.literal('copy_clean_link'),
  v.literal('native_share_success'),
  v.literal('native_share_error'),
  v.literal('share_link_visit'),
  v.literal('share_link_bot_preview'),
  v.literal('conversion')
);
const PUBLIC_MENTION_CONFIDENCE = v.union(
  v.literal('direct_tracked_url'),
  v.literal('direct_canonical_url'),
  v.literal('redirect_resolved'),
  v.literal('text_match'),
  v.literal('manual'),
  v.literal('published')
);
const SHARE_ACTION_EVENT_TYPES = new Set(['platform_clicked', 'copy_link', 'native_share_success']);

interface ShareTargetDoc {
  _id: any;
  canonicalUrl: string;
  objectType: string;
  objectId: string;
  slug?: string;
  title: string;
  description?: string;
  imageUrl?: string;
  createdAt: number;
  updatedAt: number;
}

interface ShareLinkDoc {
  _id: any;
  code: string;
  targetId: any;
  targetCanonicalUrl: string;
  platform: string;
  label?: string;
  actorId?: string;
  actorLabel?: string;
  sessionId?: string;
  shareTextHash?: string;
  visitCount: number;
  botVisitCount: number;
  createdAt: number;
  lastVisitedAt?: number;
}

async function findTargetByCanonical(ctx: any, canonicalUrl: string): Promise<ShareTargetDoc | null> {
  return (await ctx.db
    .query('shareTarget')
    .withIndex('by_canonical_url', (q: any) => q.eq('canonicalUrl', canonicalUrl))
    .unique()) as ShareTargetDoc | null;
}

async function findLinkByCode(ctx: any, code: string): Promise<ShareLinkDoc | null> {
  return (await ctx.db
    .query('shareLink')
    .withIndex('by_code', (q: any) => q.eq('code', code))
    .unique()) as ShareLinkDoc | null;
}

export const upsertTarget = mutationGeneric({
  args: {
    canonicalUrl: v.string(),
    objectType: SHARE_OBJECT_TYPE,
    objectId: v.string(),
    slug: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await findTargetByCanonical(ctx, args.canonicalUrl);
    if (existing) {
      await ctx.db.patch(existing._id, {
        objectType: args.objectType,
        objectId: args.objectId,
        slug: args.slug,
        title: args.title,
        description: args.description,
        imageUrl: args.imageUrl,
        updatedAt: args.now,
      });
      return String(existing._id);
    }
    return String(
      await ctx.db.insert('shareTarget', {
        canonicalUrl: args.canonicalUrl,
        objectType: args.objectType,
        objectId: args.objectId,
        slug: args.slug,
        title: args.title,
        description: args.description,
        imageUrl: args.imageUrl,
        createdAt: args.now,
        updatedAt: args.now,
      })
    );
  },
});

export const createLink = mutationGeneric({
  args: {
    code: v.string(),
    canonicalUrl: v.string(),
    objectType: SHARE_OBJECT_TYPE,
    objectId: v.string(),
    slug: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    platform: SHARE_PLATFORM,
    label: v.optional(v.string()),
    actorId: v.optional(v.string()),
    actorLabel: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    shareTextHash: v.optional(v.string()),
    requestPath: v.optional(v.string()),
    requestQuery: v.optional(v.string()),
    referer: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    acceptLanguage: v.optional(v.string()),
    browserPlatform: v.optional(v.string()),
    browserBrands: v.optional(v.string()),
    browserMobile: v.optional(v.string()),
    ipHash: v.optional(v.string()),
    visitorHash: v.optional(v.string()),
    cfCountry: v.optional(v.string()),
    cfColo: v.optional(v.string()),
    cfRay: v.optional(v.string()),
    metadata: v.optional(v.any()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const existingLink = await findLinkByCode(ctx, args.code);
    if (existingLink) {
      throw new Error(`share code collision: ${args.code}`);
    }

    let target = await findTargetByCanonical(ctx, args.canonicalUrl);
    let targetId = target?._id;
    if (target) {
      await ctx.db.patch(target._id, {
        objectType: args.objectType,
        objectId: args.objectId,
        slug: args.slug,
        title: args.title,
        description: args.description,
        imageUrl: args.imageUrl,
        updatedAt: args.now,
      });
    } else {
      targetId = await ctx.db.insert('shareTarget', {
        canonicalUrl: args.canonicalUrl,
        objectType: args.objectType,
        objectId: args.objectId,
        slug: args.slug,
        title: args.title,
        description: args.description,
        imageUrl: args.imageUrl,
        createdAt: args.now,
        updatedAt: args.now,
      });
    }

    const linkId = await ctx.db.insert('shareLink', {
      code: args.code,
      targetId,
      targetCanonicalUrl: args.canonicalUrl,
      platform: args.platform,
      label: args.label,
      actorId: args.actorId,
      actorLabel: args.actorLabel,
      sessionId: args.sessionId,
      shareTextHash: args.shareTextHash,
      visitCount: 0,
      botVisitCount: 0,
      createdAt: args.now,
    });
    const eventId = `share_${args.now}_${args.code}`;
    await ctx.db.insert('shareEvent', {
      eventId,
      targetId,
      linkId,
      code: args.code,
      targetCanonicalUrl: args.canonicalUrl,
      eventType: 'share_link_created',
      platform: args.platform,
      requestPath: args.requestPath,
      requestQuery: args.requestQuery,
      referer: args.referer,
      userAgent: args.userAgent,
      acceptLanguage: args.acceptLanguage,
      browserPlatform: args.browserPlatform,
      browserBrands: args.browserBrands,
      browserMobile: args.browserMobile,
      ipHash: args.ipHash,
      visitorHash: args.visitorHash,
      cfCountry: args.cfCountry,
      cfColo: args.cfColo,
      cfRay: args.cfRay,
      metadata: args.metadata ?? (args.label ? { label: args.label } : undefined),
      createdAt: args.now,
    });
    return {
      targetId: String(targetId),
      linkId: String(linkId),
      code: args.code,
      canonicalUrl: args.canonicalUrl,
    };
  },
});

export const resolveLink = queryGeneric({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const link = await findLinkByCode(ctx, args.code);
    if (!link) return null;
    const target = (await ctx.db.get(link.targetId)) as ShareTargetDoc | null;
    if (!target) return null;
    return { link, target };
  },
});

export const recordEvent = mutationGeneric({
  args: {
    eventId: v.string(),
    code: v.optional(v.string()),
    canonicalUrl: v.optional(v.string()),
    eventType: SHARE_EVENT_TYPE,
    platform: SHARE_PLATFORM,
    requestPath: v.optional(v.string()),
    requestQuery: v.optional(v.string()),
    referer: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    acceptLanguage: v.optional(v.string()),
    browserPlatform: v.optional(v.string()),
    browserBrands: v.optional(v.string()),
    browserMobile: v.optional(v.string()),
    ipHash: v.optional(v.string()),
    visitorHash: v.optional(v.string()),
    cfCountry: v.optional(v.string()),
    cfColo: v.optional(v.string()),
    cfRay: v.optional(v.string()),
    metadata: v.optional(v.any()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const link = args.code ? await findLinkByCode(ctx, args.code) : null;
    const target =
      link?.targetId
        ? ((await ctx.db.get(link.targetId)) as ShareTargetDoc | null)
        : args.canonicalUrl
          ? await findTargetByCanonical(ctx, args.canonicalUrl)
          : null;
    if (link && args.eventType === 'share_link_visit') {
      await ctx.db.patch(link._id, {
        visitCount: link.visitCount + 1,
        lastVisitedAt: args.now,
      });
    }
    if (link && args.eventType === 'share_link_bot_preview') {
      await ctx.db.patch(link._id, {
        botVisitCount: link.botVisitCount + 1,
      });
    }
    await ctx.db.insert('shareEvent', {
      eventId: args.eventId,
      targetId: target?._id,
      linkId: link?._id,
      code: args.code,
      targetCanonicalUrl: target?.canonicalUrl ?? args.canonicalUrl,
      eventType: args.eventType,
      platform: args.platform,
      requestPath: args.requestPath,
      requestQuery: args.requestQuery,
      referer: args.referer,
      userAgent: args.userAgent,
      acceptLanguage: args.acceptLanguage,
      browserPlatform: args.browserPlatform,
      browserBrands: args.browserBrands,
      browserMobile: args.browserMobile,
      ipHash: args.ipHash,
      visitorHash: args.visitorHash,
      cfCountry: args.cfCountry,
      cfColo: args.cfColo,
      cfRay: args.cfRay,
      metadata: args.metadata,
      createdAt: args.now,
    });
    return args.eventId;
  },
});

export const getSummary = queryGeneric({
  args: { canonicalUrl: v.string() },
  handler: async (ctx, args) => {
    const target = await findTargetByCanonical(ctx, args.canonicalUrl);
    if (!target) {
      return {
        target: null,
        shareLinks: 0,
        shareActions: 0,
        trackedVisits: 0,
        botPreviews: 0,
        publicPosts: 0,
        publicPostsByPlatform: {},
        platformActions: {},
        publicReach: {},
      };
    }
    const [links, events, mentions] = await Promise.all([
      ctx.db
        .query('shareLink')
        .withIndex('by_target', (q: any) => q.eq('targetId', target._id))
        .collect(),
      ctx.db
        .query('shareEvent')
        .withIndex('by_target', (q: any) => q.eq('targetId', target._id))
        .collect(),
      ctx.db
        .query('publicMention')
        .withIndex('by_target', (q: any) => q.eq('targetId', target._id))
        .collect(),
    ]);
    const actionEvents = events.filter((event: any) => SHARE_ACTION_EVENT_TYPES.has(event.eventType));
    const platformActions = actionEvents.reduce((acc: Record<string, number>, event: any) => {
      acc[event.platform] = (acc[event.platform] ?? 0) + 1;
      return acc;
    }, {});
    const publicPostsByPlatform = mentions.reduce((acc: Record<string, number>, mention: any) => {
      acc[mention.platform] = (acc[mention.platform] ?? 0) + 1;
      return acc;
    }, {});
    const publicReach = mentions.reduce(
      (acc: Record<string, number>, mention: any) => {
        for (const key of ['likes', 'reposts', 'quotes', 'replies', 'comments', 'reactions', 'views', 'impressions']) {
          const value = mention.metrics?.[key];
          if (typeof value === 'number') acc[key] = (acc[key] ?? 0) + value;
        }
        return acc;
      },
      {}
    );
    return {
      target,
      shareLinks: links.length,
      shareActions: actionEvents.length,
      trackedVisits: links.reduce((sum: number, link: ShareLinkDoc) => sum + link.visitCount, 0),
      botPreviews: links.reduce((sum: number, link: ShareLinkDoc) => sum + link.botVisitCount, 0),
      publicPosts: mentions.length,
      publicPostsByPlatform,
      platformActions,
      publicReach,
    };
  },
});

export const upsertPublicMention = mutationGeneric({
  args: {
    canonicalUrl: v.string(),
    platform: v.union(v.literal('x'), v.literal('linkedin'), v.literal('facebook')),
    externalId: v.optional(v.string()),
    externalUrl: v.string(),
    authorName: v.optional(v.string()),
    authorHandle: v.optional(v.string()),
    matchedUrl: v.string(),
    normalizedCanonicalUrl: v.string(),
    matchedCode: v.optional(v.string()),
    metrics: v.object({
      likes: v.optional(v.number()),
      reposts: v.optional(v.number()),
      quotes: v.optional(v.number()),
      replies: v.optional(v.number()),
      comments: v.optional(v.number()),
      reactions: v.optional(v.number()),
      views: v.optional(v.number()),
      impressions: v.optional(v.number()),
    }),
    confidence: PUBLIC_MENTION_CONFIDENCE,
    raw: v.optional(v.any()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const target = await findTargetByCanonical(ctx, args.canonicalUrl);
    if (!target) throw new Error(`share target not found: ${args.canonicalUrl}`);
    const existing = args.externalId
      ? await ctx.db
          .query('publicMention')
          .withIndex('by_platform_external', (q: any) =>
            q.eq('platform', args.platform).eq('externalId', args.externalId)
          )
          .unique()
      : await ctx.db
          .query('publicMention')
          .withIndex('by_external_url', (q: any) => q.eq('externalUrl', args.externalUrl))
          .unique();
    const patch = {
      targetId: target._id,
      platform: args.platform,
      externalId: args.externalId,
      externalUrl: args.externalUrl,
      authorName: args.authorName,
      authorHandle: args.authorHandle,
      matchedUrl: args.matchedUrl,
      normalizedCanonicalUrl: args.normalizedCanonicalUrl,
      matchedCode: args.matchedCode,
      metrics: args.metrics,
      confidence: args.confidence,
      raw: args.raw,
      lastCheckedAt: args.now,
      updatedAt: args.now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return String(existing._id);
    }
    return String(
      await ctx.db.insert('publicMention', {
        ...patch,
        firstSeenAt: args.now,
      })
    );
  },
});
