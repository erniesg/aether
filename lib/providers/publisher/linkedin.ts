/**
 * LinkedIn direct publisher adapter using the LinkedIn REST API (v202405).
 *
 * ─── HOW TO OBTAIN CREDENTIALS ──────────────────────────────────────────────
 *
 * 1. LINKEDIN_ACCESS_TOKEN  (OAuth 2.0 user access token):
 *    a. Complete the OAuth 2.0 flow at /api/social-auth/linkedin/start, OR
 *    b. Go to https://www.linkedin.com/developers/tools/oauth/token-generator
 *       and generate a token with scopes: openid profile email w_member_social
 *    c. Paste the resulting access token here.
 *    Note: user access tokens typically expire in 60 days. Organization tokens
 *    may be longer-lived — check your app's token settings.
 *
 * 2. LINKEDIN_MEMBER_ID  (numeric member urn id — NOT the email):
 *    With your access token, call:
 *      GET https://api.linkedin.com/v2/userinfo
 *          Authorization: Bearer <token>
 *    The `sub` field is the URN id (e.g. "ABCdef123"). Set as LINKEDIN_MEMBER_ID.
 *    The adapter constructs the full URN as `urn:li:person:<LINKEDIN_MEMBER_ID>`.
 *
 * ─── SCHEDULING LIMITATION ──────────────────────────────────────────────────
 *
 * LinkedIn supports scheduled posts via lifecycleState=PUBLISHED_SCHEDULE, but
 * that shape requires a `scheduledAt` epoch-ms field under `distribution` which
 * is only available on the newer Campaign Manager API and requires additional
 * approval scopes. This adapter posts IMMEDIATELY when scheduledAt is within
 * 5 minutes of now. For future scheduling use Postiz instead:
 *   POSTIZ_API_KEY + POSTIZ_INTEGRATION_LINKEDIN
 * TODO: implement PUBLISHED_SCHEDULE shape once `w_member_social` supports it.
 *
 * ─── ORG (PAGE) POSTS ────────────────────────────────────────────────────────
 *
 * To post as an Organization Page rather than a personal profile, set the author
 * urn to `urn:li:organization:<org-id>` and add scope `w_organization_social`.
 * Currently out of scope for this MVP — personal posts only.
 *
 * ─── ENV VARS ────────────────────────────────────────────────────────────────
 *   LINKEDIN_ACCESS_TOKEN   OAuth 2.0 user access token (w_member_social scope)
 *   LINKEDIN_MEMBER_ID      numeric member urn id (from /v2/userinfo `sub` field)
 *   LINKEDIN_API_VERSION    optional, default '202405' (YYYYMM)
 *   LINKEDIN_API_BASE       optional, default 'https://api.linkedin.com'
 */

import {
  PublisherError,
  type PublisherProvider,
  type PublisherProviderId,
  type ScheduledPost,
  type ScheduleResult,
} from './types';

const PROVIDER_ID = 'linkedin' as const satisfies PublisherProviderId;
const DEFAULT_API_BASE = 'https://api.linkedin.com';
const DEFAULT_API_VERSION = '202405';

/** Immediate-post window: post within this ms window without rejecting. */
const IMMEDIATE_WINDOW_MS = 5 * 60_000;

export interface LinkedInPublisherOptions {
  accessToken: string;
  /** Numeric member id (the `sub` from /v2/userinfo). Full URN is built internally. */
  memberId: string;
  /** LinkedIn-Version header value — YYYYMM, default '202405'. */
  apiVersion?: string;
  /** Override API base URL. */
  apiBase?: string;
  /** Inject for tests. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

export function isLinkedInPublisherConfigured(
  env: Partial<Record<string, string>>
): boolean {
  return Boolean(
    env.LINKEDIN_ACCESS_TOKEN?.trim() && env.LINKEDIN_MEMBER_ID?.trim()
  );
}

export function createLinkedInPublisherFromEnv(
  opts: Pick<LinkedInPublisherOptions, 'fetch'>,
  env: Partial<Record<string, string>> = process.env
): PublisherProvider | null {
  if (!isLinkedInPublisherConfigured(env)) return null;
  return createLinkedInPublisher({
    accessToken: env.LINKEDIN_ACCESS_TOKEN!.trim(),
    memberId: env.LINKEDIN_MEMBER_ID!.trim(),
    apiVersion: env.LINKEDIN_API_VERSION?.trim(),
    apiBase: env.LINKEDIN_API_BASE?.trim(),
    fetch: opts.fetch,
  });
}

export function createLinkedInPublisher(
  opts: LinkedInPublisherOptions
): PublisherProvider {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '');
  const apiVersion = opts.apiVersion ?? DEFAULT_API_VERSION;
  const authorUrn = `urn:li:person:${opts.memberId}`;

  /** Standard headers required on every LinkedIn REST API call. */
  function restHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': apiVersion,
      'X-Restli-Protocol-Version': '2.0.0',
      ...extra,
    };
  }

  function isImmediate(scheduledAt: string): boolean {
    const delta = new Date(scheduledAt).getTime() - Date.now();
    return delta <= IMMEDIATE_WINDOW_MS;
  }

  function buildCommentary(post: ScheduledPost): string {
    const hashtagBlock = post.hashtags
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
      .join(' ');
    const base = post.caption.trim();
    return hashtagBlock ? `${base}\n\n${hashtagBlock}` : base;
  }

  /**
   * Step 1: Initialize image upload with the LinkedIn Images API.
   * Returns the image URN and the signed upload URL.
   */
  async function initializeImageUpload(): Promise<{
    imageUrn: string;
    uploadUrl: string;
  }> {
    const res = await fetchImpl(
      `${apiBase}/rest/images?action=initializeUpload`,
      {
        method: 'POST',
        headers: restHeaders(),
        body: JSON.stringify({
          initializeUploadRequest: { owner: authorUrn },
        }),
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new PublisherError(
        `initializeUpload failed with HTTP ${res.status}: ${text}`,
        PROVIDER_ID
      );
    }
    type InitResponse = { value: { uploadUrl: string; image: string } };
    const json = (await res.json()) as InitResponse;
    return {
      imageUrn: json.value.image,
      uploadUrl: json.value.uploadUrl,
    };
  }

  /**
   * Step 2: PUT raw image bytes to the signed upload URL.
   * LinkedIn requires the Authorization header even on the signed URL.
   */
  async function uploadImageBytes(
    uploadUrl: string,
    imageUrl: string
  ): Promise<void> {
    // Fetch the image from the public CDN URL.
    const imageRes = await fetchImpl(imageUrl);
    if (!imageRes.ok) {
      throw new PublisherError(
        `failed to fetch media from ${imageUrl}: HTTP ${imageRes.status}`,
        PROVIDER_ID
      );
    }
    const bytes = await imageRes.arrayBuffer();

    // PUT the raw bytes to LinkedIn's upload endpoint.
    const putRes = await fetchImpl(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        'Content-Type': imageRes.headers.get('content-type') ?? 'image/png',
      },
      body: bytes,
    });
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => putRes.statusText);
      throw new PublisherError(
        `image upload PUT failed with HTTP ${putRes.status}: ${text}`,
        PROVIDER_ID
      );
    }
  }

  /**
   * Step 3: Create the post at POST /rest/posts.
   * Returns the post URN from the x-restli-id response header.
   */
  async function createPost(
    imageUrn: string,
    commentary: string
  ): Promise<string> {
    const altText = commentary.slice(0, 100);
    const payload = {
      author: authorUrn,
      commentary,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: {
          id: imageUrn,
          altText,
        },
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    const res = await fetchImpl(`${apiBase}/rest/posts`, {
      method: 'POST',
      headers: restHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new PublisherError(
        `POST /rest/posts failed with HTTP ${res.status}: ${text}`,
        PROVIDER_ID
      );
    }

    // The post URN is surfaced in the x-restli-id header AND in the JSON body.
    // Prefer the header (always present on 201); fall back to JSON `id`.
    const urnFromHeader = res.headers.get('x-restli-id') ?? '';
    if (urnFromHeader) return urnFromHeader;

    type PostResponse = { id?: string };
    const json = (await res.json()) as PostResponse;
    if (json.id) return json.id;

    throw new PublisherError(
      'POST /rest/posts succeeded but returned no post URN',
      PROVIDER_ID
    );
  }

  return {
    id: PROVIDER_ID,

    canPublish(post: ScheduledPost): boolean {
      return post.platform === 'linkedin';
    },

    /**
     * Posts immediately when scheduledAt is within IMMEDIATE_WINDOW_MS of now.
     * Rejects for true future scheduling — use Postiz for that.
     *
     * Three-step LinkedIn image post:
     *   1. POST /rest/images?action=initializeUpload → imageUrn + uploadUrl
     *   2. PUT <uploadUrl> with raw image bytes
     *   3. POST /rest/posts with the imageUrn → postUrn in x-restli-id header
     *
     * The image URL in mediaUrls[0] must be publicly accessible (Convex CDN
     * URLs work). Caption and hashtags are concatenated with a blank line.
     */
    async schedule(post: ScheduledPost): Promise<ScheduleResult> {
      if (!isImmediate(post.scheduledAt)) {
        throw new PublisherError(
          'LinkedIn direct adapter does not support future scheduling — ' +
            'set scheduledAt to within 5 minutes of now for immediate posting, ' +
            'or use Postiz (POSTIZ_API_KEY + POSTIZ_INTEGRATION_LINKEDIN) for scheduling. ' +
            'LinkedIn PUBLISHED_SCHEDULE lifecycle is out of scope for this MVP; ' +
            'see TODO in linkedin.ts for the follow-up.',
          PROVIDER_ID
        );
      }

      if (!post.mediaUrls || post.mediaUrls.length === 0) {
        throw new PublisherError('mediaUrls required', PROVIDER_ID);
      }

      const imageUrl = post.mediaUrls[0]!;
      const commentary = buildCommentary(post);

      // Step 1: Initialize image upload → get image URN + signed upload URL.
      const { imageUrn, uploadUrl } = await initializeImageUpload();

      // Step 2: PUT raw image bytes to the signed upload URL.
      await uploadImageBytes(uploadUrl, imageUrl);

      // Step 3: Create the post with the image URN → get post URN.
      const postUrn = await createPost(imageUrn, commentary);

      // Build a canonical feed URL from the post URN.
      // Format: urn:li:share:1234567890 → https://www.linkedin.com/feed/update/urn:li:share:1234567890/
      const previewUrl = `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/`;

      return {
        externalId: postUrn,
        previewUrl,
      };
    },

    /**
     * Returns recent posts authored by the configured member.
     * Uses GET /rest/posts?author=<urn>&q=author (paginated, limit 20).
     * Best-effort: not filtered by Aether workspace — consumer can filter further.
     */
    async list(_workspaceId: string): Promise<ScheduledPost[]> {
      type LIPost = {
        id: string;
        commentary?: string;
        createdAt?: number;
        lifecycleState?: string;
      };
      type LIListResponse = { elements?: LIPost[] };

      const params = new URLSearchParams({
        q: 'author',
        author: authorUrn,
        count: '20',
      });

      const res = await fetchImpl(`${apiBase}/rest/posts?${params.toString()}`, {
        headers: restHeaders(),
      });
      if (!res.ok) return [];

      const json = (await res.json()) as LIListResponse;
      const elements = json.elements ?? [];

      return elements.map((item) => ({
        id: item.id,
        platform: 'linkedin' as const,
        mediaUrls: [],
        caption: item.commentary ?? '',
        hashtags: [],
        scheduledAt:
          item.createdAt != null
            ? new Date(item.createdAt).toISOString()
            : new Date().toISOString(),
        externalId: item.id,
        status: 'published' as const,
      }));
    },

    /**
     * Cancel is a no-op for LinkedIn. LinkedIn does not expose a clean
     * scheduled-post cancellation endpoint through the standard REST API.
     * Deleting a published post (DELETE /rest/posts/<urn>) is a separate
     * concern — out of scope for this contract. Use Postiz for scheduling
     * and its own cancel flow.
     */
    async cancel(_id: string): Promise<void> {
      // LinkedIn does not expose scheduled-post cancellation via the REST API.
      // For published post deletion use DELETE /rest/posts/<urn> separately.
      // See: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/posts-api
    },
  };
}
