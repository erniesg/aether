/**
 * Structured run-event log for event recap refreshes.
 *
 * Mirrors the `lapEvent` pattern (lib/agent/lap-logger.ts): every refresh
 * stage — resolution, budget, per-platform collection, clustering, finish —
 * appends one typed event so the report page can render a phased timeline
 * instead of raw JSON.
 *
 *   1. memory append is synchronous (so tests + same-process reads see it)
 *   2. Convex persistence is fire-and-forget (a network blip never blocks
 *      a refresh; the console / memory copy already exists)
 *
 * Tag convention — dot-delimited hierarchy so the UI groups by stage:
 *   plan.ready
 *   resolve.start / resolve.ok / resolve.fail
 *   budget.ready
 *   collect.<platform>.start / collect.<platform>.ok / collect.<platform>.fail
 *   enrich.ok
 *   cluster.ok
 *   export.ready
 *   run.done / run.fail
 *
 * `data` carries only safe counts / ids / short labels — never raw provider
 * payloads, so run events are safe to return in non-debug API responses.
 */

import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import type { EventPlatform, EventRecapRunEvent, EventRunEventLevel } from './types';

export interface LogEventRunEventInput {
  eventId: string;
  runId: string;
  tag: string;
  level?: EventRunEventLevel;
  message: string;
  platform?: EventPlatform;
  data?: Record<string, unknown>;
}

export interface ListEventRunEventsOptions {
  /** Restrict to a single run. */
  runId?: string;
  /** Cap the number of (newest) events returned. */
  limit?: number;
}

const MEMORY_KEY = '__aether_event_recap_run_events__';
const PER_EVENT_CAP = 1000;
const DEFAULT_LIMIT = 300;
const LEVEL_GLYPH: Record<EventRunEventLevel, string> = {
  debug: '·',
  info: '✓',
  warn: '⚠',
  error: '✗',
};

let sequence = 0;

function memory(): Map<string, EventRecapRunEvent[]> {
  const g = globalThis as typeof globalThis & {
    [MEMORY_KEY]?: Map<string, EventRecapRunEvent[]>;
  };
  if (!g[MEMORY_KEY]) g[MEMORY_KEY] = new Map();
  return g[MEMORY_KEY];
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

const runEventsApi = (anyApi as unknown as {
  eventRecapRunEvents: { recordRunEvent: unknown; listByEvent: unknown };
}).eventRecapRunEvents;

/**
 * Append one run event. Writes the in-memory copy synchronously and returns
 * it; the Convex write is fire-and-forget. Errors never propagate — logging
 * must not abort a refresh.
 */
export function logEventRunEvent(input: LogEventRunEventInput): EventRecapRunEvent {
  const level = input.level ?? 'info';
  const event: EventRecapRunEvent = {
    id: `re_${Date.now().toString(36)}_${(sequence++).toString(36)}`,
    eventId: input.eventId,
    runId: input.runId,
    tag: input.tag,
    level,
    message: input.message,
    platform: input.platform,
    data: input.data,
    ts: Date.now(),
  };

  const store = memory();
  const list = store.get(input.eventId) ?? [];
  list.push(event);
  store.set(input.eventId, list.length > PER_EVENT_CAP ? list.slice(-PER_EVENT_CAP) : list);

  // Console echo so serverless / dev logs still see progress.
  // eslint-disable-next-line no-console
  const log = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  log(
    `${LEVEL_GLYPH[level]} [event-recap:${input.tag}] ${input.message}` +
      (input.data ? ` ${JSON.stringify(input.data)}` : '')
  );

  const convex = convexClient();
  if (convex) {
    void convex
      .mutation(runEventsApi.recordRunEvent as never, {
        eventId: event.eventId,
        runId: event.runId,
        tag: event.tag,
        level: event.level,
        message: event.message,
        platform: event.platform,
        data: event.data,
        ts: event.ts,
      } as never)
      .catch((err) => {
        console.error('[event-recap/run-events] recordRunEvent Convex write failed', err);
      });
  }

  return event;
}

/**
 * List run events for an event, oldest first. Convex is the source of truth
 * when configured; otherwise the in-memory fallback is used.
 */
export async function listEventRunEvents(
  eventId: string,
  options: ListEventRunEventsOptions = {}
): Promise<EventRecapRunEvent[]> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, PER_EVENT_CAP));
  const convex = convexClient();
  if (convex) {
    try {
      const docs = (await convex.query(runEventsApi.listByEvent as never, {
        eventId,
        limit,
      } as never)) as EventRecapRunEvent[] | null;
      if (docs) return finalize(docs, options.runId, limit);
    } catch (err) {
      console.error('[event-recap/run-events] listByEvent Convex read failed', err);
    }
  }

  return finalize(memory().get(eventId) ?? [], options.runId, limit);
}

function finalize(
  events: EventRecapRunEvent[],
  runId: string | undefined,
  limit: number
): EventRecapRunEvent[] {
  const filtered = runId ? events.filter((event) => event.runId === runId) : events;
  const ordered = [...filtered].sort((a, b) => a.ts - b.ts);
  return ordered.length > limit ? ordered.slice(-limit) : ordered;
}

/** Test-only — clears the in-memory run-event log. */
export function __resetEventRunEventsMemory(): void {
  memory().clear();
  sequence = 0;
}
