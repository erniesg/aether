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

interface EventMemoryState {
  events: Map<string, EventRecapRecord>;
  runs: Map<string, EventScrapeRun[]>;
  posts: Map<string, EventPost[]>;
  themes: Map<string, EventTheme[]>;
  voices: Map<string, EventVoice[]>;
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
  if (!event) return null;
  return {
    event,
    runs: state.runs.get(eventId) ?? [],
    posts: (state.posts.get(eventId) ?? []).map(normalizePost),
    themes: state.themes.get(eventId) ?? [],
    voices: state.voices.get(eventId) ?? [],
  };
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
