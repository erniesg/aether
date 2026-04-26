/**
 * Pinterest direct publisher adapter — Pinterest API v5.
 *
 * ─── HOW TO OBTAIN CREDENTIALS ──────────────────────────────────────────────
 *
 * 1. PINTEREST_ACCESS_TOKEN  (`pina_…` user access token):
 *    a. Go to https://developers.pinterest.com/apps/
 *    b. Create an app or pick an existing one.
 *    c. In "Generate access token" pick scopes:
 *         pins:read, pins:write, boards:read, boards:write, user_accounts:read
 *    d. Generate. Save the resulting `pina_…` token.
 *
 * 2. PINTEREST_BOARD_ID  (target board id):
 *    a. Boards must exist before you can pin. Either:
 *       - GET /v5/boards (with the token) to list yours, OR
 *       - POST /v5/boards (requires `boards:write`) to create one.
 *    b. The board id is a long numeric string. Set as PINTEREST_BOARD_ID.
 *
 * ─── SCHEDULING LIMITATION ──────────────────────────────────────────────────
 *
 * Pinterest API v5 has no native scheduling — pins go live immediately.
 * This adapter posts IMMEDIATELY when scheduledAt is within 5 minutes of
 * now, otherwise rejects. For true future scheduling use Postiz with
 * POSTIZ_INTEGRATION_PINTEREST.
 *
 * ─── ENV VARS ────────────────────────────────────────────────────────────────
 *   PINTEREST_ACCESS_TOKEN  user-context token, starts with pina_
 *   PINTEREST_BOARD_ID      destination board (required)
 *   PINTEREST_LINK_URL      optional default link url for pins
 *   PINTEREST_API_BASE      override the API base (default api.pinterest.com)
 */

import {
  PublisherError,
  type PublisherProvider,
  type PublisherProviderId,
  type ScheduledPost,
  type ScheduleResult,
} from './types';

const PROVIDER_ID = 'pinterest' as const satisfies PublisherProviderId;
const DEFAULT_API_BASE = 'https://api.pinterest.com';
const IMMEDIATE_WINDOW_MS = 5 * 60_000;

export interface PinterestPublisherOptions {
  accessToken: string;
  boardId: string;
  /** Optional default link to attach to pins. Per-post link overrides. */
  defaultLinkUrl?: string;
  /** Override API base. */
  apiBase?: string;
  /** Inject for tests. */
  fetch?: typeof fetch;
}

export function isPinterestPublisherConfigured(
  env: Partial<Record<string, string>>
): boolean {
  return Boolean(
    env.PINTEREST_ACCESS_TOKEN?.trim() && env.PINTEREST_BOARD_ID?.trim()
  );
}

export function createPinterestPublisherFromEnv(
  opts: Pick<PinterestPublisherOptions, 'fetch'>,
  env: Partial<Record<string, string>> = process.env
): PublisherProvider | null {
  if (!isPinterestPublisherConfigured(env)) return null;
  return createPinterestPublisher({
    accessToken: env.PINTEREST_ACCESS_TOKEN!.trim(),
    boardId: env.PINTEREST_BOARD_ID!.trim(),
    defaultLinkUrl: env.PINTEREST_LINK_URL?.trim(),
    apiBase: env.PINTEREST_API_BASE?.trim() || DEFAULT_API_BASE,
    fetch: opts.fetch,
  });
}

export function createPinterestPublisher(
  opts: PinterestPublisherOptions
): PublisherProvider {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '');

  function isImmediate(scheduledAt: string): boolean {
    const delta = new Date(scheduledAt).getTime() - Date.now();
    return delta <= IMMEDIATE_WINDOW_MS;
  }

  /**
   * Pinterest's `description` is the body copy; the post's caption maps
   * to `title` (≤ 100 chars). Hashtags pile into `description` since
   * Pinterest doesn't have a separate hashtag field.
   */
  function buildPinPayload(post: ScheduledPost): Record<string, unknown> {
    const title = post.caption.trim().slice(0, 100);
    const hashtagBlock = post.hashtags
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
      .join(' ');
    const description = hashtagBlock
      ? `${post.caption.trim()}\n\n${hashtagBlock}`
      : post.caption.trim();
    const payload: Record<string, unknown> = {
      board_id: opts.boardId,
      title,
      description,
      media_source: {
        source_type: 'image_url',
        url: post.mediaUrls[0],
      },
    };
    if (opts.defaultLinkUrl) payload.link = opts.defaultLinkUrl;
    return payload;
  }

  return {
    id: PROVIDER_ID,

    canPublish(post: ScheduledPost): boolean {
      return post.platform === 'pinterest';
    },

    /**
     * POST /v5/pins → returns the created pin id. Build the public URL
     * from the pin id (https://www.pinterest.com/pin/<id>).
     */
    async schedule(post: ScheduledPost): Promise<ScheduleResult> {
      if (!isImmediate(post.scheduledAt)) {
        throw new PublisherError(
          'Pinterest direct adapter does not support future scheduling — ' +
            'set scheduledAt to within 5 minutes of now for immediate pin, ' +
            'or use Postiz (POSTIZ_API_KEY + POSTIZ_INTEGRATION_PINTEREST) for scheduling.',
          PROVIDER_ID
        );
      }

      if (!post.mediaUrls || post.mediaUrls.length === 0) {
        throw new PublisherError('mediaUrls required', PROVIDER_ID);
      }

      const res = await fetchImpl(`${apiBase}/v5/pins`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildPinPayload(post)),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new PublisherError(
          `POST /v5/pins failed with HTTP ${res.status}: ${text}`,
          PROVIDER_ID
        );
      }
      const json = (await res.json()) as { id?: string };
      const pinId = json.id;
      if (!pinId) {
        throw new PublisherError(
          'POST /v5/pins succeeded but returned no pin id',
          PROVIDER_ID
        );
      }
      return {
        externalId: pinId,
        previewUrl: `https://www.pinterest.com/pin/${pinId}/`,
      };
    },

    /**
     * Best-effort recent pins for the configured board. Pinterest only
     * supports listing pins per-board, not per-account, so we list the
     * one board we're configured to publish to.
     */
    async list(_workspaceId: string): Promise<ScheduledPost[]> {
      type V5Pin = {
        id: string;
        title?: string;
        description?: string;
        link?: string;
        created_at?: string;
        media?: { url?: string };
      };
      type V5BoardPins = { items?: V5Pin[] };
      const res = await fetchImpl(
        `${apiBase}/v5/boards/${opts.boardId}/pins?page_size=20`,
        { headers: { Authorization: `Bearer ${opts.accessToken}` } }
      );
      if (!res.ok) return [];
      const json = (await res.json()) as V5BoardPins;
      return (json.items ?? []).map((p) => ({
        id: p.id,
        platform: 'pinterest',
        mediaUrls: p.media?.url ? [p.media.url] : [],
        caption: p.title ?? '',
        hashtags: [],
        scheduledAt: p.created_at ?? new Date().toISOString(),
      }));
    },

    async cancel(_id: string): Promise<void> {
      // Pinterest pins post immediately; no scheduled state to cancel.
      // Deletes are a separate concept (DELETE /v5/pins/{id}) — out of
      // scope for this contract.
    },
  };
}
