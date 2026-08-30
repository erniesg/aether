import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

const PLATFORM = v.union(v.literal('x'), v.literal('linkedin'), v.literal('youtube'));
const MODE = v.union(v.literal('mock'), v.literal('tinyfish'));
const EVENT_STATUS = v.union(
  v.literal('draft'),
  v.literal('resolving'),
  v.literal('ready'),
  v.literal('refreshing'),
  v.literal('error')
);
const RUN_STATUS = v.union(
  v.literal('running'),
  v.literal('completed'),
  v.literal('failed'),
  v.literal('skipped')
);

const METRICS = v.object({
  likes: v.optional(v.number()),
  reposts: v.optional(v.number()),
  replies: v.optional(v.number()),
  comments: v.optional(v.number()),
  reactions: v.optional(v.number()),
  impressions: v.optional(v.number()),
  views: v.optional(v.number()),
});

const MEDIA = v.object({
  url: v.string(),
  type: v.union(v.literal('image'), v.literal('video'), v.literal('gif'), v.literal('unknown')),
  source: v.optional(v.string()),
  pageUrl: v.optional(v.string()),
  previewUrl: v.optional(v.string()),
  altText: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  localPath: v.optional(v.string()),
  contentType: v.optional(v.string()),
  bytes: v.optional(v.number()),
  downloadedAt: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  variants: v.optional(
    v.array(
      v.object({
        url: v.string(),
        contentType: v.optional(v.string()),
        bitrate: v.optional(v.number()),
      })
    )
  ),
});

const RAW_ACCESS_ACTION = v.union(v.literal('download'), v.literal('inspect'));
const RAW_ACCESS_FORMAT = v.union(v.literal('json'), v.literal('csv'));
const RAW_ACCESS_SCOPE = v.union(v.literal('raw'), v.literal('posts'));

interface EventDoc {
  _id: unknown;
  eventId: string;
}

interface RunDoc {
  _id: unknown;
  runId: string;
}

interface PostDoc {
  _id: unknown;
  postId: string;
  url: string;
}

interface ThemeDoc {
  _id: unknown;
}

interface VoiceDoc {
  _id: unknown;
}

async function findEvent(ctx: any, eventId: string): Promise<EventDoc | null> {
  return (await ctx.db
    .query('eventRecap')
    .withIndex('by_event_id', (q: any) => q.eq('eventId', eventId))
    .unique()) as EventDoc | null;
}

async function findRun(ctx: any, runId: string): Promise<RunDoc | null> {
  return (await ctx.db
    .query('eventScrapeRun')
    .withIndex('by_run_id', (q: any) => q.eq('runId', runId))
    .unique()) as RunDoc | null;
}

export const getBundle = queryGeneric({
  args: { eventId: v.string(), postLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const event = await findEvent(ctx, args.eventId);
    if (!event) return null;
    const postLimit = Math.max(1, Math.min(args.postLimit ?? 200, 500));
    const [runs, posts, themes, voices] = await Promise.all([
      ctx.db
        .query('eventScrapeRun')
        .withIndex('by_event', (q: any) => q.eq('eventId', args.eventId))
        .order('desc')
        .take(25),
      ctx.db
        .query('eventPost')
        .withIndex('by_event', (q: any) => q.eq('eventId', args.eventId))
        .order('desc')
        .take(postLimit),
      ctx.db
        .query('eventTheme')
        .withIndex('by_event', (q: any) => q.eq('eventId', args.eventId))
        .collect(),
      ctx.db
        .query('eventVoice')
        .withIndex('by_event', (q: any) => q.eq('eventId', args.eventId))
        .collect(),
    ]);
    return { event, runs, posts, themes, voices };
  },
});

export const list = queryGeneric({
  args: { workspaceId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.workspaceId) {
      return await ctx.db
        .query('eventRecap')
        .withIndex('by_workspace', (q: any) => q.eq('workspaceId', args.workspaceId))
        .order('desc')
        .take(100);
    }
    return await ctx.db.query('eventRecap').order('desc').take(100);
  },
});

export const upsertEvent = mutationGeneric({
  args: {
    eventId: v.string(),
    workspaceId: v.optional(v.string()),
    name: v.string(),
    contextHint: v.optional(v.string()),
    status: EVENT_STATUS,
    canonicalName: v.optional(v.string()),
    officialUrl: v.optional(v.string()),
    location: v.optional(v.string()),
    startsAt: v.optional(v.string()),
    endsAt: v.optional(v.string()),
    daysBefore: v.number(),
    daysAfter: v.number(),
    refreshIntervalHours: v.number(),
    maxItemsPerPlatform: v.number(),
    monthlyCreditBudget: v.number(),
    usedCredits: v.number(),
    querySet: v.array(v.string()),
    sourceUrls: v.array(v.string()),
    liveMode: MODE,
    lastRunAt: v.optional(v.number()),
    nextRefreshAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await findEvent(ctx, args.eventId);
    if (existing) {
      await ctx.db.patch(existing._id as any, {
        workspaceId: args.workspaceId,
        name: args.name,
        contextHint: args.contextHint,
        status: args.status,
        canonicalName: args.canonicalName,
        officialUrl: args.officialUrl,
        location: args.location,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
        daysBefore: args.daysBefore,
        daysAfter: args.daysAfter,
        refreshIntervalHours: args.refreshIntervalHours,
        maxItemsPerPlatform: args.maxItemsPerPlatform,
        monthlyCreditBudget: args.monthlyCreditBudget,
        usedCredits: args.usedCredits,
        querySet: args.querySet,
        sourceUrls: args.sourceUrls,
        liveMode: args.liveMode,
        lastRunAt: args.lastRunAt,
        nextRefreshAt: args.nextRefreshAt,
        error: args.error,
        updatedAt: args.updatedAt,
      });
      return args.eventId;
    }
    await ctx.db.insert('eventRecap', args);
    return args.eventId;
  },
});

export const startRun = mutationGeneric({
  args: {
    runId: v.string(),
    eventId: v.string(),
    status: RUN_STATUS,
    mode: MODE,
    provider: v.string(),
    platforms: v.array(PLATFORM),
    querySet: v.array(v.string()),
    windowStart: v.string(),
    windowEnd: v.string(),
    maxItemsPerPlatform: v.number(),
    estimatedCredits: v.number(),
    actualCredits: v.optional(v.number()),
    streamingUrls: v.array(v.object({ platform: PLATFORM, url: v.string() })),
    warnings: v.array(v.string()),
    error: v.optional(v.string()),
    inputs: v.any(),
    outputs: v.any(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await findRun(ctx, args.runId);
    if (existing) return args.runId;
    await ctx.db.insert('eventScrapeRun', args);
    return args.runId;
  },
});

export const finishRun = mutationGeneric({
  args: {
    runId: v.string(),
    status: RUN_STATUS,
    actualCredits: v.optional(v.number()),
    streamingUrls: v.optional(v.array(v.object({ platform: PLATFORM, url: v.string() }))),
    warnings: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
    outputs: v.optional(v.any()),
    finishedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await findRun(ctx, args.runId);
    if (!run) return;
    await ctx.db.patch(run._id as any, {
      status: args.status,
      actualCredits: args.actualCredits,
      streamingUrls: args.streamingUrls,
      warnings: args.warnings,
      error: args.error,
      outputs: args.outputs,
      finishedAt: args.finishedAt,
    });
  },
});

export const upsertPosts = mutationGeneric({
  args: {
    posts: v.array(
      v.object({
        postId: v.string(),
        eventId: v.string(),
        runId: v.string(),
        platform: PLATFORM,
        url: v.string(),
        authorName: v.string(),
        authorHandle: v.optional(v.string()),
        authorUrl: v.optional(v.string()),
        authorMeta: v.optional(
          v.object({
            description: v.optional(v.string()),
            headline: v.optional(v.string()),
            location: v.optional(v.string()),
            followers: v.optional(v.number()),
            following: v.optional(v.number()),
            posts: v.optional(v.number()),
            listed: v.optional(v.number()),
            verified: v.optional(v.boolean()),
            verifiedType: v.optional(v.string()),
            profileImageUrl: v.optional(v.string()),
          })
        ),
        text: v.string(),
        postedAt: v.optional(v.string()),
        capturedAt: v.number(),
        updatedAt: v.number(),
        metrics: METRICS,
        media: v.optional(v.array(MEDIA)),
        reachScore: v.number(),
        tags: v.array(v.string()),
        raw: v.any(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const post of args.posts) {
      const existing = (await ctx.db
        .query('eventPost')
        .withIndex('by_event_url', (q: any) =>
          q.eq('eventId', post.eventId).eq('url', post.url)
        )
        .unique()) as PostDoc | null;
      if (existing) {
        await ctx.db.patch(existing._id as any, post);
        updated += 1;
      } else {
        await ctx.db.insert('eventPost', post);
        inserted += 1;
      }
    }
    return { inserted, updated };
  },
});

export const replaceThemes = mutationGeneric({
  args: {
    eventId: v.string(),
    themes: v.array(
      v.object({
        themeId: v.string(),
        eventId: v.string(),
        label: v.string(),
        summary: v.string(),
        keywords: v.array(v.string()),
        postIds: v.array(v.string()),
        score: v.number(),
        updatedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = (await ctx.db
      .query('eventTheme')
      .withIndex('by_event', (q: any) => q.eq('eventId', args.eventId))
      .collect()) as ThemeDoc[];
    for (const doc of existing) await ctx.db.delete(doc._id as any);
    for (const theme of args.themes) await ctx.db.insert('eventTheme', theme);
    return args.themes.length;
  },
});

export const replaceVoices = mutationGeneric({
  args: {
    eventId: v.string(),
    voices: v.array(
      v.object({
        voiceId: v.string(),
        eventId: v.string(),
        platform: PLATFORM,
        name: v.string(),
        handle: v.optional(v.string()),
        profileUrl: v.optional(v.string()),
        postCount: v.number(),
        totalEngagement: v.number(),
        reachScore: v.number(),
        samplePostUrls: v.array(v.string()),
        updatedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = (await ctx.db
      .query('eventVoice')
      .withIndex('by_event', (q: any) => q.eq('eventId', args.eventId))
      .collect()) as VoiceDoc[];
    for (const doc of existing) await ctx.db.delete(doc._id as any);
    for (const voice of args.voices) await ctx.db.insert('eventVoice', voice);
    return args.voices.length;
  },
});

export const recordRawAccess = mutationGeneric({
  args: {
    accessId: v.string(),
    eventId: v.string(),
    action: RAW_ACCESS_ACTION,
    format: RAW_ACCESS_FORMAT,
    scope: RAW_ACCESS_SCOPE,
    postCount: v.number(),
    mediaCount: v.number(),
    schemaVersion: v.optional(v.string()),
    latestRunId: v.optional(v.string()),
    requestPath: v.optional(v.string()),
    requestQuery: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    acceptLanguage: v.optional(v.string()),
    browserPlatform: v.optional(v.string()),
    browserBrands: v.optional(v.string()),
    referer: v.optional(v.string()),
    ipHash: v.optional(v.string()),
    visitorHash: v.optional(v.string()),
    cfCountry: v.optional(v.string()),
    cfColo: v.optional(v.string()),
    cfRay: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('eventRawAccess')
      .withIndex('by_access_id', (q: any) => q.eq('accessId', args.accessId))
      .unique();
    if (existing) return args.accessId;
    await ctx.db.insert('eventRawAccess', args);
    return args.accessId;
  },
});
