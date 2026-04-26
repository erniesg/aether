/**
 * Instagram direct publisher adapter using Meta Graph API.
 *
 * ─── HOW TO OBTAIN CREDENTIALS ──────────────────────────────────────────────
 *
 * 1. IG_ACCESS_TOKEN  (long-lived Page access token):
 *    a. Go to https://developers.facebook.com/tools/explorer/
 *    b. Select your App + click "Generate Access Token".
 *    c. Add these permissions: instagram_basic, instagram_content_publish,
 *       pages_show_list, pages_read_engagement.
 *    d. The Explorer gives you a short-lived token (1 hr). Exchange it for a
 *       long-lived one (60 days):
 *       GET https://graph.facebook.com/v22.0/oauth/access_token
 *           ?grant_type=fb_exchange_token
 *           &client_id=<APP_ID>
 *           &client_secret=<APP_SECRET>
 *           &fb_exchange_token=<SHORT_LIVED_TOKEN>
 *    e. Set the resulting token → IG_ACCESS_TOKEN.
 *    f. Refresh before expiry — or use a never-expiring System User token
 *       from Meta Business Suite → Settings → Business Users.
 *
 * 2. IG_USER_ID  (Instagram Business account user id — NOT the FB Page id):
 *    a. With your Page access token, call:
 *       GET https://graph.facebook.com/v22.0/<PAGE_ID>
 *           ?fields=instagram_business_account
 *           &access_token=<IG_ACCESS_TOKEN>
 *    b. The response's instagram_business_account.id is your IG_USER_ID.
 *
 * 3. IG_GRAPH_VERSION  (optional, defaults to v22.0):
 *    e.g. IG_GRAPH_VERSION=v22.0
 *
 * ─── SCHEDULING LIMITATION ──────────────────────────────────────────────────
 *
 * The Meta Graph API for content publishing does not support scheduling via
 * direct API calls (scheduling is only available through Facebook Creator
 * Studio or third-party tools like Postiz). This adapter posts IMMEDIATELY
 * when scheduledAt is within 5 minutes of now. For future scheduling, use
 * Postiz instead (POSTIZ_API_KEY + POSTIZ_INTEGRATION_INSTAGRAM).
 *
 * ─── ENV VARS ────────────────────────────────────────────────────────────────
 *   IG_ACCESS_TOKEN    long-lived page/user access token
 *   IG_USER_ID         Instagram Business account user id
 *   IG_GRAPH_VERSION   Graph API version (default: v22.0)
 */

import {
  PublisherError,
  type PublisherProvider,
  type PublisherProviderId,
  type ScheduledPost,
  type ScheduleResult,
} from './types';

const PROVIDER_ID = 'instagram' as const satisfies PublisherProviderId;
const DEFAULT_GRAPH_VERSION = 'v22.0';

/**
 * Two flavours of IG content publishing co-exist as of 2026-04:
 *   - FB Graph API (graph.facebook.com)        — token starts EAA…
 *     Needs IG Business account linked to a FB Page; older flow.
 *   - IG Business Login (graph.instagram.com)  — token starts IGAA…
 *     Direct IG OAuth, no FB Page link required; newer flow.
 *
 * The shape of the publishing endpoints is identical — only the host
 * differs. We auto-detect by token prefix; consumers can override via
 * IG_API_BASE if needed.
 */
const FB_GRAPH_BASE = 'https://graph.facebook.com';
const IG_BUSINESS_BASE = 'https://graph.instagram.com';

function pickGraphBase(
  accessToken: string,
  override: string | undefined
): string {
  if (override) return override.replace(/\/+$/, '');
  return accessToken.startsWith('IGAA') ? IG_BUSINESS_BASE : FB_GRAPH_BASE;
}

/** Immediate-post window: post within this ms window without rejecting. */
const IMMEDIATE_WINDOW_MS = 5 * 60_000;

export interface InstagramPublisherOptions {
  accessToken: string;
  igUserId: string;
  graphVersion?: string;
  /**
   * Override the API base URL. When omitted we auto-detect:
   *   - graph.instagram.com when token starts with IGAA…
   *   - graph.facebook.com  otherwise (EAA…).
   */
  apiBase?: string;
  /**
   * Injected fetch for testing. Defaults to the global `fetch`.
   */
  fetch?: typeof fetch;
}

export function isInstagramPublisherConfigured(
  env: Partial<Record<string, string>>
): boolean {
  return Boolean(env.IG_ACCESS_TOKEN?.trim() && env.IG_USER_ID?.trim());
}

export function createInstagramPublisherFromEnv(
  opts: Pick<InstagramPublisherOptions, 'fetch'>,
  env: Partial<Record<string, string>> = process.env
): PublisherProvider | null {
  if (!isInstagramPublisherConfigured(env)) return null;
  return createInstagramPublisher({
    accessToken: env.IG_ACCESS_TOKEN!.trim(),
    igUserId: env.IG_USER_ID!.trim(),
    graphVersion: env.IG_GRAPH_VERSION?.trim(),
    apiBase: env.IG_API_BASE?.trim(),
    fetch: opts.fetch,
  });
}

export function createInstagramPublisher(
  opts: InstagramPublisherOptions
): PublisherProvider {
  const graphVersion = opts.graphVersion ?? DEFAULT_GRAPH_VERSION;
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const graphBase = pickGraphBase(opts.accessToken, opts.apiBase);

  function graphUrl(path: string, params: Record<string, string>): string {
    const qs = new URLSearchParams({
      ...params,
      access_token: opts.accessToken,
    }).toString();
    return `${graphBase}/${graphVersion}/${path}?${qs}`;
  }

  async function graphPost<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = graphUrl(path, params);
    const res = await fetchImpl(url, { method: 'POST' });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new PublisherError(
        `Graph API POST /${path} failed with HTTP ${res.status}: ${text}`,
        PROVIDER_ID
      );
    }
    return (await res.json()) as T;
  }

  async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = graphUrl(path, params);
    const res = await fetchImpl(url, { method: 'GET' });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new PublisherError(
        `Graph API GET /${path} failed with HTTP ${res.status}: ${text}`,
        PROVIDER_ID
      );
    }
    return (await res.json()) as T;
  }

  function isImmediate(scheduledAt: string): boolean {
    const delta = new Date(scheduledAt).getTime() - Date.now();
    return delta <= IMMEDIATE_WINDOW_MS;
  }

  /**
   * Poll an IG media container's status_code until it reaches FINISHED
   * (or fails fast on ERROR/EXPIRED). 30 attempts × 1s = 30s ceiling —
   * comfortable for image containers (typically 2-5s) and survives
   * occasional reel/video processing.
   */
  async function pollContainerReady(containerId: string): Promise<void> {
    type ContainerStatus = {
      status_code:
        | 'IN_PROGRESS'
        | 'FINISHED'
        | 'ERROR'
        | 'EXPIRED'
        | 'PUBLISHED';
    };
    const maxAttempts = 30;
    const intervalMs = 1000;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const status = await graphGet<ContainerStatus>(containerId, {
        fields: 'status_code',
      });
      if (status.status_code === 'FINISHED') return;
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        throw new PublisherError(
          `IG container ${containerId} ${status.status_code}`,
          PROVIDER_ID
        );
      }
      // IN_PROGRESS — wait and retry.
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new PublisherError(
      `IG container ${containerId} did not reach FINISHED within ${(maxAttempts * intervalMs) / 1000}s`,
      PROVIDER_ID
    );
  }

  function buildCaption(post: ScheduledPost): string {
    const hashtagBlock = post.hashtags
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
      .join(' ');
    const base = post.caption.trim();
    return hashtagBlock ? `${base}\n\n${hashtagBlock}` : base;
  }

  return {
    id: PROVIDER_ID,

    canPublish(post: ScheduledPost): boolean {
      return post.platform === 'instagram';
    },

    /**
     * Posts immediately when scheduledAt is within IMMEDIATE_WINDOW_MS of now.
     * Rejects for true future scheduling — use Postiz for that.
     *
     * Two-step IG content publishing:
     *   1. POST /{ig-user-id}/media  with image_url + caption → container_id
     *   2. POST /{ig-user-id}/media_publish with creation_id → media_id
     *
     * The image URL must be publicly accessible (Convex CDN URLs work).
     * Caption and hashtags are concatenated with a blank line separator.
     */
    async schedule(post: ScheduledPost): Promise<ScheduleResult> {
      if (!isImmediate(post.scheduledAt)) {
        throw new PublisherError(
          'Instagram direct adapter does not support future scheduling — ' +
            'set scheduledAt to within 5 minutes of now for immediate posting, ' +
            'or use Postiz (POSTIZ_API_KEY + POSTIZ_INTEGRATION_INSTAGRAM) for scheduling.',
          PROVIDER_ID
        );
      }

      if (!post.mediaUrls || post.mediaUrls.length === 0) {
        throw new PublisherError('mediaUrls required', PROVIDER_ID);
      }

      const imageUrl = post.mediaUrls[0]!;
      const caption = buildCaption(post);

      // Step 1: Create media container.
      const containerResp = await graphPost<{ id: string }>(
        `${opts.igUserId}/media`,
        { image_url: imageUrl, caption }
      );
      const containerId = containerResp.id;

      // Step 2: Poll the container until it's FINISHED. IG fetches the
      // image_url asynchronously, so media_publish 400s with
      // "media is not ready to be published" if we fire it too soon.
      // Per Meta docs the container progresses through:
      //   IN_PROGRESS → FINISHED  (happy path)
      //   IN_PROGRESS → ERROR | EXPIRED  (fail)
      // Image containers usually finish within 2-5s.
      await pollContainerReady(containerId);

      // Step 3: Publish the container.
      const publishResp = await graphPost<{ id: string }>(
        `${opts.igUserId}/media_publish`,
        { creation_id: containerId }
      );
      const mediaId = publishResp.id;

      return {
        externalId: mediaId,
        // The permalink is only available after the post is indexed by IG.
        // We return a best-effort URL; the actual permalink requires a
        // subsequent GET /{media-id}?fields=permalink call that would add
        // another round-trip. For the demo the user id-based URL is sufficient.
        previewUrl: `https://www.instagram.com/p/${mediaId}/`,
      };
    },

    /**
     * Returns recent media for the IG user. This is "best-effort" — the
     * Graph API returns all media for the account, not filtered by Aether
     * workspace. The consumer can filter further by campaign / asset id.
     */
    async list(_workspaceId: string): Promise<ScheduledPost[]> {
      type IGMedia = {
        id: string;
        media_type?: string;
        timestamp?: string;
        caption?: string;
        permalink?: string;
      };
      type IGListResponse = { data?: IGMedia[] };

      const resp = await graphGet<IGListResponse>(`${opts.igUserId}/media`, {
        fields: 'id,media_type,timestamp,caption,permalink',
        limit: '20',
      });

      const items = resp.data ?? [];
      return items.map((item) => ({
        id: item.id,
        platform: 'instagram' as const,
        mediaUrls: [],
        caption: item.caption ?? '',
        hashtags: [],
        scheduledAt: item.timestamp ?? new Date().toISOString(),
        externalId: item.id,
        status: 'published' as const,
      }));
    },

    /**
     * Cancel is not supported via the Graph API for published media. Stories
     * can be deleted within 24h via DELETE /{media-id} but regular posts
     * cannot be deleted through the API on the current access tier.
     */
    async cancel(_id: string): Promise<void> {
      throw new PublisherError(
        'cancel not supported by IG Graph direct adapter — ' +
          'use Meta Business Suite or Creator Studio to delete posts.',
        PROVIDER_ID
      );
    },
  };
}
