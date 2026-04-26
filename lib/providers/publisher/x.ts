/**
 * X (Twitter) direct publisher adapter using the official `twitter-api-v2`
 * package (https://github.com/PLhery/node-twitter-api-v2).
 *
 * ─── HOW TO OBTAIN CREDENTIALS ──────────────────────────────────────────────
 *
 * 1. X_API_KEY + X_API_KEY_SECRET  (developer app / consumer credentials):
 *    a. Go to https://developer.twitter.com/en/portal/dashboard
 *    b. Create a project + app (or select existing).
 *    c. Under "Keys and Tokens" → copy "API Key" → X_API_KEY
 *                               → copy "API Key Secret" → X_API_KEY_SECRET
 *
 * 2. X_ACCESS_TOKEN + X_ACCESS_TOKEN_SECRET  (user-account credentials):
 *    a. In the same "Keys and Tokens" page, click "Generate" under
 *       "Access Token and Secret".  These tokens represent the account that
 *       will own the tweets.
 *    b. Copy "Access Token"        → X_ACCESS_TOKEN
 *    c. Copy "Access Token Secret" → X_ACCESS_TOKEN_SECRET
 *
 *    Note: The app MUST have "Read and Write" permission selected in
 *    "User authentication settings" before generating the tokens.  If you
 *    already generated tokens under "Read only", regenerate them after
 *    switching the permission level.
 *
 * ─── SCHEDULING LIMITATION ──────────────────────────────────────────────────
 *
 * The free / Basic X API tier does NOT support native post scheduling.
 * This adapter posts IMMEDIATELY when scheduledAt is in the past or within
 * 5 minutes of now. For true future scheduling, use Postiz instead:
 * set PUBLISHER_PROVIDER=postiz (or leave unset and configure Postiz env vars).
 *
 * ─── ENV VARS ────────────────────────────────────────────────────────────────
 *   X_API_KEY              consumer key from the developer portal
 *   X_API_KEY_SECRET       consumer secret from the developer portal
 *   X_ACCESS_TOKEN         user-level access token
 *   X_ACCESS_TOKEN_SECRET  user-level access token secret
 */

import { TwitterApi } from 'twitter-api-v2';
import {
  PublisherError,
  type PublisherProvider,
  type PublisherProviderId,
  type ScheduledPost,
  type ScheduleResult,
} from './types';

const PROVIDER_ID = 'x' as const satisfies PublisherProviderId;

/** Immediate-post window: post within this ms window without rejecting. */
const IMMEDIATE_WINDOW_MS = 5 * 60_000;

export interface XPublisherOptions {
  apiKey: string;
  apiKeySecret: string;
  accessToken: string;
  accessTokenSecret: string;
  /**
   * Optional fetch override. When provided, the adapter uses it to download
   * the image bytes before uploading to X via the v1 media endpoint.
   * Defaults to the global `fetch`.
   */
  fetch?: typeof fetch;
}

export function isXPublisherConfigured(env: Partial<Record<string, string>>): boolean {
  return Boolean(
    env.X_API_KEY?.trim() &&
      env.X_API_KEY_SECRET?.trim() &&
      env.X_ACCESS_TOKEN?.trim() &&
      env.X_ACCESS_TOKEN_SECRET?.trim()
  );
}

export function createXPublisherFromEnv(
  opts: Pick<XPublisherOptions, 'fetch'>,
  env: Partial<Record<string, string>> = process.env
): PublisherProvider | null {
  if (!isXPublisherConfigured(env)) return null;
  return createXPublisher({
    apiKey: env.X_API_KEY!.trim(),
    apiKeySecret: env.X_API_KEY_SECRET!.trim(),
    accessToken: env.X_ACCESS_TOKEN!.trim(),
    accessTokenSecret: env.X_ACCESS_TOKEN_SECRET!.trim(),
    fetch: opts.fetch,
  });
}

export function createXPublisher(opts: XPublisherOptions): PublisherProvider {
  const client = new TwitterApi({
    appKey: opts.apiKey,
    appSecret: opts.apiKeySecret,
    accessToken: opts.accessToken,
    accessSecret: opts.accessTokenSecret,
  });

  const fetchImpl = opts.fetch ?? globalThis.fetch;

  function isImmediate(scheduledAt: string): boolean {
    const delta = new Date(scheduledAt).getTime() - Date.now();
    return delta <= IMMEDIATE_WINDOW_MS;
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
      return post.platform === 'x';
    },

    /**
     * Posts immediately when scheduledAt is within IMMEDIATE_WINDOW_MS of now.
     * Rejects for true future scheduling — use Postiz for that.
     *
     * Steps:
     *   1. Fetch image bytes from post.mediaUrls[0] (public CDN URL expected).
     *   2. Upload to X via v1.uploadMedia → get media_id_string.
     *   3. Create tweet with caption + hashtags + media_id.
     */
    async schedule(post: ScheduledPost): Promise<ScheduleResult> {
      if (!isImmediate(post.scheduledAt)) {
        throw new PublisherError(
          'X direct adapter does not support future scheduling — ' +
            'set scheduledAt to within 5 minutes of now for immediate posting, ' +
            'or use Postiz (POSTIZ_API_KEY + POSTIZ_INTEGRATION_X) for scheduled tweets.',
          PROVIDER_ID
        );
      }

      if (!post.mediaUrls || post.mediaUrls.length === 0) {
        throw new PublisherError('mediaUrls required', PROVIDER_ID);
      }

      const imageUrl = post.mediaUrls[0]!;
      let mediaId: string;

      try {
        // Fetch image bytes from the public CDN URL
        const imageRes = await fetchImpl(imageUrl);
        if (!imageRes.ok) {
          throw new PublisherError(
            `failed to fetch media from ${imageUrl}: HTTP ${imageRes.status}`,
            PROVIDER_ID
          );
        }
        const arrayBuffer = await imageRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = imageRes.headers.get('content-type') ?? 'image/png';

        mediaId = await client.v1.uploadMedia(buffer, { mimeType });
      } catch (err) {
        if (err instanceof PublisherError) throw err;
        throw new PublisherError(
          `media upload failed: ${err instanceof Error ? err.message : String(err)}`,
          PROVIDER_ID,
          err
        );
      }

      let tweetId: string;
      try {
        const tweetResult = await client.v2.tweet({
          text: buildCaption(post),
          media: { media_ids: [mediaId] },
        });
        tweetId = tweetResult.data.id;
      } catch (err) {
        throw new PublisherError(
          `tweet creation failed: ${err instanceof Error ? err.message : String(err)}`,
          PROVIDER_ID,
          err
        );
      }

      return {
        externalId: tweetId,
        previewUrl: `https://twitter.com/i/web/status/${tweetId}`,
      };
    },

    /**
     * Listing posts is not supported at the free/Basic API tier for this
     * adapter. Returns an empty array.
     */
    async list(_workspaceId: string): Promise<ScheduledPost[]> {
      // eslint-disable-next-line no-console
      console.warn(
        '[XPublisher] list() is not supported at the free/Basic X API tier. ' +
          'Use Postiz (which has its own scheduling DB) if you need to list scheduled posts.'
      );
      return [];
    },

    /**
     * Deletes a tweet by its tweet id. Uses v2.deleteTweet under the hood.
     */
    async cancel(id: string): Promise<void> {
      try {
        await client.v2.deleteTweet(id);
      } catch (err) {
        throw new PublisherError(
          `deleteTweet failed for id=${id}: ${err instanceof Error ? err.message : String(err)}`,
          PROVIDER_ID,
          err
        );
      }
    },
  };
}
