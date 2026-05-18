import { analyzePosts } from './analyze';
import { isApifyConfigured, searchXViaApify, type ApifyXSort } from './apify';
import { enrichPostConversationTags } from './conversation';
import { deriveExpansionPlan } from './expand';
import { deriveSeedFrontier } from './frontier';
import { mockResolveEvent, mockRunShell, mockScrapePlatform } from './mock';
import {
  getEventBundle,
  saveEvent,
  savePosts,
  saveRunFinish,
  saveRunStart,
  saveThemes,
  saveVoices,
} from './store';
import {
  resolveEventViaTinyFish,
  scrapeLinkedInViaTinyFishSearchFetch,
  scrapePlatformFrontierViaTinyFish,
  scrapePlatformViaTinyFish,
  searchPlatformFallbackViaTinyFish,
} from './tinyfish';
import { isXSearchConfigured, searchXViaOfficialApi } from './x-api';
import type {
  EventPlatform,
  EventExpansionPlan,
  EventPost,
  EventRecapConfig,
  EventRecapRecord,
  EventScrapeRun,
  PlatformScrapeResult,
} from './types';
import { clampConfig, eventWindow, normalizeQuerySet, scorePostsByPlatform } from './utils';

const PLATFORMS: EventPlatform[] = ['x', 'linkedin'];

type LinkedInRefreshMode = 'search-fetch' | 'browser-direct';
type XRefreshProvider = 'official' | 'apify';

interface RefreshEventRecapInput extends Partial<EventRecapConfig> {
  name?: string;
  eventId: string;
  platforms?: EventPlatform[];
  targetItemsPerPlatform?: number;
  dedupeAgainstExisting?: boolean;
  linkedinMode?: LinkedInRefreshMode;
  maxQueries?: number;
  maxSearchPagesPerQuery?: number;
  includeMedia?: boolean;
  seenPostUrls?: string[];
  xProvider?: XRefreshProvider;
  apifyActorId?: string;
  apifySort?: ApifyXSort;
  apifyCandidateMultiplier?: number;
}

export async function createEventRecap(
  input: Partial<EventRecapConfig> & { name: string }
): Promise<EventRecapRecord> {
  const config = clampConfig(input);
  const now = Date.now();
  const existing = await getEventBundle(config.eventId);
  if (existing?.event) return existing.event;

  const event: EventRecapRecord = {
    ...config,
    status: 'draft',
    usedCredits: 0,
    querySet: deriveSeedFrontier({
      eventName: config.name,
      contextHint: config.contextHint,
    }).querySet,
    sourceUrls: [],
    createdAt: now,
    updatedAt: now,
  };
  await saveEvent(event);
  return event;
}

export async function refreshEventRecap(
  input: RefreshEventRecapInput
) {
  const existing = await getEventBundle(input.eventId);
  const base = existing?.event;
  if (!base && !input.name) {
    throw new Error(`event ${input.eventId} not found`);
  }
  const config = clampConfig({
    eventId: input.eventId,
    name: input.name ?? base?.name ?? input.eventId,
    contextHint: input.contextHint ?? base?.contextHint,
    workspaceId: input.workspaceId ?? base?.workspaceId,
    daysBefore: input.daysBefore ?? base?.daysBefore,
    daysAfter: input.daysAfter ?? base?.daysAfter,
    refreshIntervalHours: input.refreshIntervalHours ?? base?.refreshIntervalHours,
    maxItemsPerPlatform: input.maxItemsPerPlatform ?? base?.maxItemsPerPlatform,
    monthlyCreditBudget: input.monthlyCreditBudget ?? base?.monthlyCreditBudget,
    liveMode: input.liveMode ?? base?.liveMode ?? defaultMode(),
  });

  const resolvingEvent = toEventRecord(base, config, {
    status: 'resolving',
    updatedAt: Date.now(),
    error: undefined,
  });
  await saveEvent(resolvingEvent);

  const resolution =
    config.liveMode === 'tinyfish'
      ? await resolveEventViaTinyFish(config)
      : mockResolveEvent(config.name, config.contextHint);

  const { windowStart, windowEnd } = eventWindow({
    startsAt: resolution.startsAt,
    endsAt: resolution.endsAt,
    daysBefore: config.daysBefore,
    daysAfter: config.daysAfter,
  });
  const activeQuerySet = normalizeQuerySet([...(base?.querySet ?? []), ...resolution.querySet]);
  const platforms = sanitizePlatforms(input.platforms);
  const targetItemsPerPlatform = clampOptionalTarget(input.targetItemsPerPlatform);
  const platformBudgets = scrapeBudgetsByPlatform({
    platforms,
    existingPosts: existing?.posts ?? [],
    targetItemsPerPlatform,
    defaultBudget: config.maxItemsPerPlatform,
  });
  const maxBudget = Math.max(1, ...platforms.map((platform) => platformBudgets[platform] ?? 0));
  const estimatedCredits =
    config.liveMode === 'tinyfish'
      ? estimateTinyFishCredits({
          platforms: platforms.filter((platform) => (platformBudgets[platform] ?? 0) > 0).length,
          queryCount: activeQuerySet.length,
          maxItemsPerPlatform: maxBudget,
        })
      : 0;
  const usedCredits = base?.usedCredits ?? 0;
  const runId = `event_${config.eventId}_${Date.now().toString(36)}`;

  if (
    config.monthlyCreditBudget > 0 &&
    estimatedCredits > 0 &&
    usedCredits + estimatedCredits > config.monthlyCreditBudget
  ) {
    const skippedRun = skippedBudgetRun({
      runId,
      eventId: config.eventId,
      platforms,
      querySet: activeQuerySet,
      windowStart,
      windowEnd,
      maxItemsPerPlatform: maxBudget,
      estimatedCredits,
      targetItemsPerPlatform,
      platformBudgets,
    });
    await saveRunStart(skippedRun);
    await saveRunFinish(skippedRun);
    const event = toEventRecord(base, config, {
      status: 'ready',
      canonicalName: resolution.canonicalName,
      officialUrl: resolution.officialUrl,
      location: resolution.location,
      startsAt: resolution.startsAt,
      endsAt: resolution.endsAt,
      querySet: activeQuerySet,
      sourceUrls: resolution.sourceUrls,
      usedCredits,
      nextRefreshAt: nextRefreshAt(config.refreshIntervalHours),
      updatedAt: Date.now(),
    });
    await saveEvent(event);
    return getEventBundle(config.eventId);
  }

  const run =
    config.liveMode === 'mock'
      ? mockRunShell({
          runId,
          eventId: config.eventId,
          platforms,
          querySet: activeQuerySet,
          windowStart,
          windowEnd,
          maxItemsPerPlatform: maxBudget,
        })
      : liveRunShell({
          runId,
          eventId: config.eventId,
          platforms,
          querySet: activeQuerySet,
          windowStart,
          windowEnd,
          maxItemsPerPlatform: maxBudget,
          estimatedCredits,
          targetItemsPerPlatform,
          platformBudgets,
        });
  await saveRunStart(run);

  const refreshingEvent = toEventRecord(base, config, {
    status: 'refreshing',
    canonicalName: resolution.canonicalName,
    officialUrl: resolution.officialUrl,
    location: resolution.location,
    startsAt: resolution.startsAt,
    endsAt: resolution.endsAt,
    querySet: activeQuerySet,
    sourceUrls: resolution.sourceUrls,
    updatedAt: Date.now(),
  });
  await saveEvent(refreshingEvent);

  try {
    const platformResults =
      config.liveMode === 'mock'
        ? platforms.map((platform) =>
            mockScrapePlatform(platform, config.eventId, runId, platformBudgets[platform] ?? config.maxItemsPerPlatform)
          )
        : await Promise.all(
            platforms.map(async (platform) => {
              const maxItems = platformBudgets[platform] ?? config.maxItemsPerPlatform;
              const seenPostUrls =
                input.dedupeAgainstExisting === false
                  ? input.seenPostUrls ?? []
                  : [
                      ...(existing?.posts ?? [])
                        .filter((post) => post.platform === platform)
                        .map((post) => post.url),
                      ...(input.seenPostUrls ?? []),
                    ];
              if (maxItems <= 0) {
                return {
                  platform,
                  posts: [],
                  warnings: [
                    `${platform} already has ${seenPostUrls.length} stored posts; target ${targetItemsPerPlatform} reached, so refresh skipped expensive collection.`,
                  ],
                  raw: {
                    mode: 'delta-skip',
                    seenPostUrls: seenPostUrls.length,
                    targetItemsPerPlatform,
                  },
                } satisfies PlatformScrapeResult;
              }
              if (platform === 'x' && input.xProvider === 'apify') {
                return searchXViaApify({
                  querySet: activeQuerySet,
                  windowStart,
                  windowEnd,
                  maxItems,
                  maxQueries: input.maxQueries,
                  actorId: input.apifyActorId,
                  sort: input.apifySort,
                  candidateMultiplier: input.apifyCandidateMultiplier,
                  seenPostUrls,
                });
              }
              if (platform === 'x' && isXSearchConfigured()) {
                const official = await searchXViaOfficialApi({
                  querySet: activeQuerySet,
                  windowStart,
                  windowEnd,
                  maxItems,
                  maxQueries: input.maxQueries,
                  seenPostUrls,
                });
                if (official.posts.length > 0) return official;
              }
              if (platform === 'x' && isApifyConfigured()) {
                const apify = await searchXViaApify({
                  querySet: activeQuerySet,
                  windowStart,
                  windowEnd,
                  maxItems,
                  maxQueries: input.maxQueries,
                  actorId: input.apifyActorId,
                  sort: input.apifySort,
                  candidateMultiplier: input.apifyCandidateMultiplier,
                  seenPostUrls,
                });
                if (apify.posts.length > 0) return apify;
              }

              const result =
                platform === 'linkedin' && (input.linkedinMode ?? 'search-fetch') === 'search-fetch'
                  ? await scrapeLinkedInViaTinyFishSearchFetch({
                      querySet: activeQuerySet,
                      maxItems,
                      maxQueries: input.maxQueries ?? linkedinFrontierQueryLimit(),
                      searchPagesPerQuery: input.maxSearchPagesPerQuery,
                      includeMedia: input.includeMedia,
                      seenPostUrls,
                    })
                  : platform === 'linkedin'
                  ? await scrapePlatformFrontierViaTinyFish({
                      platform,
                      querySet: activeQuerySet,
                      windowStart,
                      windowEnd,
                      maxItems,
                      credentialItemIds: linkedinCredentialItemIds(),
                      maxQueries: linkedinFrontierQueryLimit(),
                      seenPostUrls,
                    })
                  : await scrapePlatformViaTinyFish({
                      platform,
                      querySet: activeQuerySet,
                      windowStart,
                      windowEnd,
                      maxItems,
                    });
              if (result.posts.length > 0) return result;
              const fallback = await searchPlatformFallbackViaTinyFish({
                platform,
                querySet: activeQuerySet,
                maxItems,
                seenPostUrls,
              });
              return {
                ...fallback,
                streamingUrl: result.streamingUrl,
                warnings: [...result.warnings, ...fallback.warnings],
                raw: { agent: result.raw, fallback: fallback.raw },
              };
            })
          );

    const posts = materializePosts(config.eventId, runId, platformResults);
    const previousPosts = existing?.posts ?? [];
    const merged = mergePosts(previousPosts, posts);
    const expansion = deriveExpansionPlan(resolution.canonicalName ?? config.name, merged, {
      baseQueries: activeQuerySet,
      maxQueries: 12,
    });
    const analysis = analyzePosts(config.eventId, merged);

    await savePosts(config.eventId, posts);
    await saveThemes(config.eventId, analysis.themes);
    await saveVoices(config.eventId, analysis.voices);

    const finishedRun: EventScrapeRun = {
      ...run,
      status: 'completed',
      actualCredits: estimatedCredits,
      streamingUrls: platformResults
        .filter((result) => result.streamingUrl)
        .map((result) => ({
          platform: result.platform,
          url: result.streamingUrl as string,
        })),
      warnings: [
        ...resolution.warnings,
        ...expansion.warnings,
        ...platformResults.flatMap((result) => result.warnings),
      ],
      outputs: {
        posts: posts.length,
        mergedPosts: merged.length,
        platformBudgets,
        targetItemsPerPlatform,
        themes: analysis.themes.length,
        voices: analysis.voices.length,
        expansion: summarizeExpansion(expansion),
      },
      finishedAt: Date.now(),
    };
    await saveRunFinish(finishedRun);

    const event = toEventRecord(base, config, {
      status: 'ready',
      canonicalName: resolution.canonicalName,
      officialUrl: resolution.officialUrl,
      location: resolution.location,
      startsAt: resolution.startsAt,
      endsAt: resolution.endsAt,
      querySet: expansion.querySet,
      sourceUrls: resolution.sourceUrls,
      usedCredits: usedCredits + estimatedCredits,
      lastRunAt: finishedRun.finishedAt,
      nextRefreshAt: nextRefreshAt(config.refreshIntervalHours),
      error: undefined,
      updatedAt: Date.now(),
    });
    await saveEvent(event);
    return getEventBundle(config.eventId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await saveRunFinish({
      ...run,
      status: 'failed',
      warnings: [...resolution.warnings],
      error: message,
      outputs: {},
      finishedAt: Date.now(),
    });
    const event = toEventRecord(base, config, {
      status: 'error',
      error: message,
      updatedAt: Date.now(),
    });
    await saveEvent(event);
    throw err;
  }
}

function sanitizePlatforms(platforms: EventPlatform[] | undefined): EventPlatform[] {
  const requested = platforms?.length ? platforms : PLATFORMS;
  const allowed = new Set<EventPlatform>(PLATFORMS);
  const seen = new Set<EventPlatform>();
  const sanitized = requested.filter((platform) => {
    if (!allowed.has(platform) || seen.has(platform)) return false;
    seen.add(platform);
    return true;
  });
  return sanitized.length ? sanitized : PLATFORMS;
}

function clampOptionalTarget(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(1, Math.min(1000, Math.round(value)));
}

function scrapeBudgetsByPlatform(input: {
  platforms: EventPlatform[];
  existingPosts: EventPost[];
  targetItemsPerPlatform?: number;
  defaultBudget: number;
}): Partial<Record<EventPlatform, number>> {
  const counts = input.existingPosts.reduce(
    (acc, post) => {
      acc[post.platform] += 1;
      return acc;
    },
    { x: 0, linkedin: 0 } satisfies Record<EventPlatform, number>
  );
  return Object.fromEntries(
    input.platforms.map((platform) => [
      platform,
      input.targetItemsPerPlatform
        ? Math.max(0, input.targetItemsPerPlatform - counts[platform])
        : input.defaultBudget,
    ])
  ) as Partial<Record<EventPlatform, number>>;
}

function toEventRecord(
  base: EventRecapRecord | undefined,
  config: EventRecapConfig,
  patch: Partial<EventRecapRecord>
): EventRecapRecord {
  const now = Date.now();
  return {
    ...config,
    status: base?.status ?? 'draft',
    canonicalName: base?.canonicalName,
    officialUrl: base?.officialUrl,
    location: base?.location,
    startsAt: base?.startsAt,
    endsAt: base?.endsAt,
    usedCredits: base?.usedCredits ?? 0,
    querySet: base?.querySet ?? [config.name],
    sourceUrls: base?.sourceUrls ?? [],
    lastRunAt: base?.lastRunAt,
    nextRefreshAt: base?.nextRefreshAt,
    error: base?.error,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
    ...patch,
  };
}

function liveRunShell(input: {
  runId: string;
  eventId: string;
  platforms: EventPlatform[];
  querySet: string[];
  windowStart: string;
  windowEnd: string;
  maxItemsPerPlatform: number;
  estimatedCredits: number;
  targetItemsPerPlatform?: number;
  platformBudgets?: Partial<Record<EventPlatform, number>>;
}): EventScrapeRun {
  return {
    runId: input.runId,
    eventId: input.eventId,
    status: 'running',
    mode: 'tinyfish',
    provider: 'tinyfish',
    platforms: input.platforms,
    querySet: input.querySet,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    maxItemsPerPlatform: input.maxItemsPerPlatform,
    estimatedCredits: input.estimatedCredits,
    streamingUrls: [],
    warnings: [],
    inputs: {
      ...input,
      targetItemsPerPlatform: input.targetItemsPerPlatform,
      platformBudgets: input.platformBudgets,
    },
    outputs: {},
    startedAt: Date.now(),
  };
}

function skippedBudgetRun(input: {
  runId: string;
  eventId: string;
  platforms: EventPlatform[];
  querySet: string[];
  windowStart: string;
  windowEnd: string;
  maxItemsPerPlatform: number;
  estimatedCredits: number;
  targetItemsPerPlatform?: number;
  platformBudgets?: Partial<Record<EventPlatform, number>>;
}): EventScrapeRun {
  return {
    ...liveRunShell(input),
    status: 'skipped',
    warnings: ['monthly TinyFish credit budget would be exceeded'],
    finishedAt: Date.now(),
  };
}

function materializePosts(
  eventId: string,
  runId: string,
  results: PlatformScrapeResult[]
): EventPost[] {
  const capturedAt = Date.now();
  return scorePostsByPlatform(
    results.flatMap((result) =>
      result.posts.map((post) => ({
        ...post,
        eventId,
        runId,
        capturedAt,
        reachScore: 0,
      }))
      .map(enrichPostConversationTags)
    )
  );
}

function mergePosts(existing: EventPost[], incoming: EventPost[]): EventPost[] {
  const byUrl = new Map(existing.map((post) => [post.url, post]));
  for (const post of incoming) byUrl.set(post.url, post);
  return Array.from(byUrl.values());
}

function nextRefreshAt(hours: number): number {
  return Date.now() + hours * 60 * 60 * 1000;
}

function linkedinCredentialItemIds(): string[] | undefined {
  const raw = process.env.TINYFISH_LINKEDIN_CREDENTIAL_ITEM_IDS?.trim();
  if (!raw) return undefined;
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function linkedinFrontierQueryLimit(): number {
  const raw = Number(process.env.TINYFISH_LINKEDIN_FRONTIER_QUERIES ?? 4);
  if (!Number.isFinite(raw)) return 4;
  return Math.max(1, Math.min(12, Math.round(raw)));
}

function estimateTinyFishCredits(input: {
  platforms: number;
  queryCount: number;
  maxItemsPerPlatform: number;
}): number {
  const queryFactor = Math.min(12, input.queryCount * 0.75);
  const volumeFactor = Math.min(20, input.maxItemsPerPlatform / 100);
  return Math.ceil(input.platforms * (3 + queryFactor + volumeFactor));
}

function summarizeExpansion(expansion: EventExpansionPlan) {
  return {
    corpus: expansion.corpus,
    querySet: expansion.querySet,
    anchors: expansion.anchors.slice(0, 12).map((anchor) => ({
      kind: anchor.kind,
      sourceKind: anchor.sourceKind,
      value: anchor.value,
      query: anchor.query,
      score: anchor.score,
      count: anchor.count,
      platforms: anchor.platforms,
      samplePostIds: anchor.samplePostIds.slice(0, 3),
      bias: anchor.bias,
      reason: anchor.reason,
    })),
  };
}

function defaultMode(): 'mock' | 'tinyfish' {
  return process.env.EVENT_RECAP_EXECUTION_MODE === 'tinyfish' ? 'tinyfish' : 'mock';
}
