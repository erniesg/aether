/**
 * Pure routing helpers for the generic per-event recap worker.
 *
 * The worker serves four routes under /vibes/<eventId>:
 *   root          — HTML recap page
 *   data          — JSON payload from R2 (CORS-friendly)
 *   media         — media proxy from R2 (CORS-friendly)
 *   embed-snippet — copy-pasteable iframe snippet
 *
 * Validation: eventIds are restricted to safe kebab-case /
 * alphanumeric to prevent path traversal and other shenanigans when
 * we use them as R2 key prefixes.
 */

export type RecapRoute = 'root' | 'data' | 'media' | 'embed-snippet';

export interface RecapPathParts {
  eventId: string;
  route: RecapRoute;
}

const EVENT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/i;
const ROUTE_BY_SUFFIX: Record<string, RecapRoute> = {
  '': 'root',
  data: 'data',
  media: 'media',
  'embed-snippet': 'embed-snippet',
};

export function isValidEventId(value: string): boolean {
  if (!value || value.length > 64) return false;
  return EVENT_ID_PATTERN.test(value);
}

export function parseRecapPath(pathname: string): RecapPathParts | null {
  // Normalize trailing slash for the root path so /vibes/foo === /vibes/foo/
  const normalized = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
  const parts = normalized.split('/').filter((part) => part.length > 0);
  if (parts.length < 2 || parts[0] !== 'vibes') return null;

  const eventId = parts[1];
  if (!isValidEventId(eventId)) return null;

  const suffix = parts.slice(2).join('/');
  const route = ROUTE_BY_SUFFIX[suffix];
  if (route === undefined) return null;

  return { eventId, route };
}

export function r2DataKey(eventId: string): string {
  if (!isValidEventId(eventId)) {
    throw new Error(`invalid eventId: ${eventId}`);
  }
  return `event-recap-${eventId}/public.json`;
}

export function r2MediaKeyPrefix(eventId: string): string {
  if (!isValidEventId(eventId)) {
    throw new Error(`invalid eventId: ${eventId}`);
  }
  return `event-recap-${eventId}/media/`;
}
