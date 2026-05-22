import fs from 'node:fs';
import path from 'node:path';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import type {
  EventPost,
  EventRecapBundle,
  EventRecapRecord,
  EventScrapeRun,
  EventTheme,
  EventVoice,
} from './types';
import { listEventRunEvents } from './run-events';

interface EventMemoryState {
  events: Map<string, EventRecapRecord>;
  runs: Map<string, EventScrapeRun[]>;
  posts: Map<string, EventPost[]>;
  themes: Map<string, EventTheme[]>;
  voices: Map<string, EventVoice[]>;
}

interface EventArchiveObject {
  body?: ReadableStream;
  text?: () => Promise<string>;
}

interface EventArchiveBucket {
  get(key: string): Promise<EventArchiveObject | null>;
}

const GLOBAL_KEY = '__aether_event_recap_store__';

function memory(): EventMemoryState {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: EventMemoryState };
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      events: new Map(),
      runs: new Map(),
      posts: new Map(),
      themes: new Map(),
      voices: new Map(),
    };
  }
  return g[GLOBAL_KEY];
}

let client: ConvexHttpClient | null = null;

function convexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  if (!client) {
    client = new ConvexHttpClient(url);
    const deployKey = process.env.CONVEX_DEPLOY_KEY;
    if (deployKey) {
      const maybeAdmin = client as unknown as { setAdminAuth?: (key: string) => void };
      if (typeof maybeAdmin.setAdminAuth === 'function') maybeAdmin.setAdminAuth(deployKey);
    }
  }
  return client;
}

const eventRecapsApi = (anyApi as unknown as {
  eventRecaps: {
    getBundle: unknown;
    upsertEvent: unknown;
    startRun: unknown;
    finishRun: unknown;
    upsertPosts: unknown;
    replaceThemes: unknown;
    replaceVoices: unknown;
  };
}).eventRecaps;

export async function getEventBundle(eventId: string): Promise<EventRecapBundle | null> {
  const bundle = await loadEventBundle(eventId);
  if (!bundle) return null;
  bundle.runEvents = await listEventRunEvents(eventId, { limit: 400 });
  return bundle;
}

async function loadEventBundle(eventId: string): Promise<EventRecapBundle | null> {
  const convex = convexClient();
  if (convex) {
    try {
      const bundle = (await convex.query(eventRecapsApi.getBundle as never, {
        eventId,
        postLimit: 2000,
      } as never)) as EventRecapBundle | null;
      if (bundle) return normalizeBundle(bundle);
    } catch (err) {
      console.error('[event-recap/store] getEventBundle Convex read failed', err);
    }
  }

  const state = memory();
  const event = state.events.get(eventId);
  if (!event) return await readArchiveBundle(eventId);
  return {
    event,
    runs: state.runs.get(eventId) ?? [],
    posts: (state.posts.get(eventId) ?? []).map(normalizePost),
    themes: state.themes.get(eventId) ?? [],
    voices: state.voices.get(eventId) ?? [],
  };
}

async function readArchiveBundle(eventId: string): Promise<EventRecapBundle | null> {
  const archiveJson = await readArchiveJson(eventId);
  if (!archiveJson) return null;
  try {
    const querySet = flattenQuerySet(archiveJson.querySet);
    const updatedAt = dateMs(archiveJson.updatedAt) ?? Date.now();
    const generatedAt = dateMs(archiveJson.generatedAt) ?? updatedAt;
    const event: EventRecapRecord = {
      eventId: String(archiveJson.eventId ?? eventId),
      name: String(archiveJson.eventName ?? archiveJson.eventId ?? eventId),
      canonicalName: String(archiveJson.eventName ?? archiveJson.eventId ?? eventId),
      location: archiveJson.location,
      startsAt: archiveJson.windowStart,
      endsAt: archiveJson.windowEnd,
      daysBefore: 0,
      daysAfter: 0,
      refreshIntervalHours: 24,
      maxItemsPerPlatform: archiveJson.stats?.total ?? archiveJson.posts?.length ?? 0,
      monthlyCreditBudget: 0,
      liveMode: 'tinyfish',
      status: 'ready',
      usedCredits: 0,
      querySet,
      sourceUrls: [],
      lastRunAt: generatedAt,
      createdAt: generatedAt,
      updatedAt,
    };
    return {
      event,
      runs: archiveRuns(archiveJson, event.eventId, querySet),
      posts: ((archiveJson.posts ?? []) as EventPost[]).map(normalizePost),
      themes: (archiveJson.themes ?? []) as EventTheme[],
      voices: (archiveJson.voices ?? []) as EventVoice[],
      clustering: archiveJson.clustering,
    };
  } catch (err) {
    console.error('[event-recap/store] archive fallback read failed', err);
    return null;
  }
}

async function readArchiveJson(eventId: string): Promise<Record<string, any> | null> {
  if (process.env.NODE_ENV === 'production') {
    const r2Archive = await readR2Archive(eventId);
    if (r2Archive) return r2Archive;
  }

  const archivePath = resolveArchivePath(eventId);
  if (!archivePath) return null;
  return JSON.parse(fs.readFileSync(archivePath, 'utf8')) as Record<string, any>;
}

async function readR2Archive(eventId: string): Promise<Record<string, any> | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as CloudflareEnv & { AETHER_ASSETS?: EventArchiveBucket }).AETHER_ASSETS;
    const object = await bucket?.get(`event-recap-${eventId}/archive.json`);
    if (!object) return null;
    const text =
      typeof object.text === 'function'
        ? await object.text()
        : object.body
          ? await new Response(object.body).text()
          : '';
    return text ? (JSON.parse(text) as Record<string, any>) : null;
  } catch (err) {
    console.error('[event-recap/store] archive R2 read failed', err);
    return null;
  }
}

function resolveArchivePath(eventId: string): string | null {
  const direct = path.resolve(process.cwd(), 'outputs', `event-recap-${eventId}`, 'archive.json');
  if (fs.existsSync(direct)) return direct;
  const outputsDir = path.resolve(process.cwd(), 'outputs');
  if (!fs.existsSync(outputsDir)) return null;
  for (const entry of fs.readdirSync(outputsDir)) {
    if (!entry.startsWith('event-recap-')) continue;
    const candidate = path.join(outputsDir, entry, 'archive.json');
    if (!fs.existsSync(candidate)) continue;
    try {
      const archive = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { eventId?: string };
      if (archive.eventId === eventId) return candidate;
    } catch {
      // Ignore malformed local artifacts.
    }
  }
  return null;
}

function flattenQuerySet(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (!value || typeof value !== 'object') return [];
  const out = new Set<string>();
  for (const item of Object.values(value as Record<string, unknown>)) {
    if (!Array.isArray(item)) continue;
    for (const query of item) {
      if (typeof query === 'string' && query.trim()) out.add(query.trim());
    }
  }
  return Array.from(out);
}

function archiveRuns(archive: Record<string, any>, eventId: string, querySet: string[]): EventScrapeRun[] {
  const enrichments = Array.isArray(archive.enrichment) ? archive.enrichment : [];
  return enrichments
    .slice(-10)
    .reverse()
    .map((entry: Record<string, any>, index: number) => {
      const generatedAt = dateMs(entry.generatedAt) ?? dateMs(archive.updatedAt) ?? Date.now();
      return {
        runId: String(entry.runId ?? `${archive.runId ?? 'archive'}_${index}`),
        eventId,
        status: 'completed',
        mode: 'tinyfish',
        provider: String(entry.mode ?? 'archive-enrichment'),
        platforms: ['x', 'linkedin', 'youtube'],
        querySet,
        windowStart: String(archive.windowStart ?? ''),
        windowEnd: String(archive.windowEnd ?? ''),
        maxItemsPerPlatform: archive.stats?.total ?? archive.posts?.length ?? 0,
        estimatedCredits: 0,
        actualCredits: 0,
        streamingUrls: [],
        warnings: [],
        inputs: entry.input ?? {},
        outputs: entry,
        startedAt: generatedAt,
        finishedAt: generatedAt,
      } satisfies EventScrapeRun;
    });
}

function dateMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

export async function saveEvent(event: EventRecapRecord): Promise<void> {
  const state = memory();
  state.events.set(event.eventId, event);
  const convex = convexClient();
  if (!convex) return;
  try {
    await convex.mutation(eventRecapsApi.upsertEvent as never, event as never);
  } catch (err) {
    console.error('[event-recap/store] saveEvent Convex write failed', err);
  }
}

export async function saveRunStart(run: EventScrapeRun): Promise<void> {
  const state = memory();
  const runs = state.runs.get(run.eventId) ?? [];
  if (!runs.some((existing) => existing.runId === run.runId)) {
    state.runs.set(run.eventId, [run, ...runs].slice(0, 25));
  }
  const convex = convexClient();
  if (!convex) return;
  try {
    await convex.mutation(eventRecapsApi.startRun as never, run as never);
  } catch (err) {
    console.error('[event-recap/store] saveRunStart Convex write failed', err);
  }
}

export async function saveRunFinish(run: EventScrapeRun): Promise<void> {
  const state = memory();
  const runs = state.runs.get(run.eventId) ?? [];
  state.runs.set(
    run.eventId,
    [run, ...runs.filter((existing) => existing.runId !== run.runId)].slice(0, 25)
  );
  const convex = convexClient();
  if (!convex) return;
  try {
    await convex.mutation(eventRecapsApi.finishRun as never, {
      runId: run.runId,
      status: run.status,
      actualCredits: run.actualCredits,
      streamingUrls: run.streamingUrls,
      warnings: run.warnings,
      error: run.error,
      outputs: run.outputs,
      finishedAt: run.finishedAt ?? Date.now(),
    } as never);
  } catch (err) {
    console.error('[event-recap/store] saveRunFinish Convex write failed', err);
  }
}

export async function savePosts(eventId: string, posts: EventPost[]): Promise<void> {
  const state = memory();
  const existing = state.posts.get(eventId) ?? [];
  const byUrl = new Map(existing.map((post) => [post.url, post]));
  for (const post of posts) byUrl.set(post.url, post);
  state.posts.set(eventId, Array.from(byUrl.values()).sort((a, b) => b.reachScore - a.reachScore));
  const convex = convexClient();
  if (!convex || posts.length === 0) return;
  try {
    await convex.mutation(eventRecapsApi.upsertPosts as never, { posts } as never);
  } catch (err) {
    console.error('[event-recap/store] savePosts Convex write failed', err);
  }
}

export async function saveThemes(eventId: string, themes: EventTheme[]): Promise<void> {
  memory().themes.set(eventId, themes);
  const convex = convexClient();
  if (!convex) return;
  try {
    await convex.mutation(eventRecapsApi.replaceThemes as never, { eventId, themes } as never);
  } catch (err) {
    console.error('[event-recap/store] saveThemes Convex write failed', err);
  }
}

export async function saveVoices(eventId: string, voices: EventVoice[]): Promise<void> {
  memory().voices.set(eventId, voices);
  const convex = convexClient();
  if (!convex) return;
  try {
    await convex.mutation(eventRecapsApi.replaceVoices as never, { eventId, voices } as never);
  } catch (err) {
    console.error('[event-recap/store] saveVoices Convex write failed', err);
  }
}

function normalizeBundle(bundle: EventRecapBundle): EventRecapBundle {
  return {
    event: stripConvexMeta(bundle.event),
    runs: bundle.runs.map(stripConvexMeta),
    posts: bundle.posts.map(normalizePost),
    themes: bundle.themes.map(stripConvexMeta),
    voices: bundle.voices.map(stripConvexMeta),
    clustering: bundle.clustering,
  };
}

function stripConvexMeta<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const copy = { ...(value as Record<string, unknown>) };
  delete copy._id;
  delete copy._creationTime;
  return copy as T;
}

function normalizePost(post: EventPost): EventPost {
  const clean = stripConvexMeta(post);
  return {
    ...clean,
    updatedAt: clean.updatedAt ?? clean.capturedAt,
  };
}
