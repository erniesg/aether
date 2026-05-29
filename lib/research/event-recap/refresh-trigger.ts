/**
 * Trigger a refresh of an event recap by POSTing to the main aether
 * app's /api/events/:eventId/refresh route.
 *
 * Used by the cron-triggered worker `scheduled` handlers to enqueue
 * daily refreshes against published events. The refresh itself runs in
 * the main aether app (where the pipeline + Convex live); the worker
 * just kicks it off.
 *
 * Auth: pass either a `vibes_`-prefixed API key (sent as x-api-key) or
 * a Logto bearer token (set authMode: 'bearer'). The refresh route's
 * authorizeEventApiRequest accepts both.
 */

import { isValidEventId } from './worker-routing';

export interface EnqueueRefreshInput {
  baseUrl: string;
  eventId: string;
  apiKey: string;
  authMode?: 'api-key' | 'bearer';
  /** Forwarded to the refresh route. Defaults to undefined (uses route default). */
  liveMode?: 'tinyfish' | 'mock';
  /** Additional fields merged into the refresh body. */
  extra?: Record<string, unknown>;
  /** Override fetch for testing. */
  fetchImpl?: typeof fetch;
}

export interface EnqueueRefreshResult {
  ok: boolean;
  status?: number;
  body?: unknown;
  error?: string;
}

export async function enqueueEventRecapRefresh(input: EnqueueRefreshInput): Promise<EnqueueRefreshResult> {
  if (!isValidEventId(input.eventId)) {
    throw new Error(`invalid eventId: ${input.eventId}`);
  }
  const baseUrl = input.baseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/api/events/${input.eventId}/refresh`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (input.authMode === 'bearer') {
    headers.authorization = `Bearer ${input.apiKey}`;
  } else {
    headers['x-api-key'] = input.apiKey;
  }

  const body: Record<string, unknown> = { ...(input.extra ?? {}) };
  if (input.liveMode) body.liveMode = input.liveMode;

  const fetchImpl = input.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        ok: false,
        status: response.status,
        error: `refresh failed: HTTP ${response.status} ${text}`.trim(),
      };
    }
    const json = (await response.json().catch(() => null)) as unknown;
    return { ok: true, status: response.status, body: json };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
