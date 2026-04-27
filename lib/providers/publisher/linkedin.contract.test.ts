/**
 * LinkedIn publisher adapter — contract tests.
 *
 * All network calls are mocked via a fetch stub injected through
 * LinkedInPublisherOptions.fetch, so no real credentials or network
 * connectivity are required.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLinkedInPublisher,
  createLinkedInPublisherFromEnv,
  isLinkedInPublisherConfigured,
  type LinkedInPublisherOptions,
} from './linkedin';
import type { ScheduledPost } from './types';
import { PublisherError } from './types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER_ID = 'AbCdEfG123';
const AUTHOR_URN = `urn:li:person:${MEMBER_ID}`;
const IMAGE_URN = 'urn:li:image:C5500AQH1e4z2ABC';
const UPLOAD_URL = 'https://dms.licdn.com/upload/signed-token-abc';
const POST_URN = 'urn:li:share:7123456789012345678';

function scheduledNow(): string {
  // Within the 5-minute immediate window.
  return new Date(Date.now() + 60_000).toISOString();
}

function scheduledFar(): string {
  // 30 minutes in the future — outside the immediate window.
  return new Date(Date.now() + 30 * 60_000).toISOString();
}

function makePost(overrides: Partial<ScheduledPost> = {}): ScheduledPost {
  return {
    id: 'post-1',
    platform: 'linkedin',
    mediaUrls: ['https://cdn.aether.test/hero.png'],
    caption: 'Hello LinkedIn',
    hashtags: ['aether', 'hackathon'],
    scheduledAt: scheduledNow(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock fetch helpers
// ---------------------------------------------------------------------------

/** Creates a minimal Response stub. */
function mockResponse(
  body: unknown,
  opts: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const { status = 200, headers = {} } = opts;
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(bodyStr, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

/** Image fetch response — returns raw bytes (mocked as an empty ArrayBuffer). */
function mockImageResponse(): Response {
  return new Response(new ArrayBuffer(8), {
    status: 200,
    headers: { 'Content-Type': 'image/png' },
  });
}

/** Builds the 3-call happy-path fetch mock. */
function buildHappyFetch(postUrn: string = POST_URN): typeof fetch {
  return vi.fn().mockImplementation((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : (url as Request).url;

    // Step 1: initializeUpload
    if (urlStr.includes('initializeUpload')) {
      return Promise.resolve(
        mockResponse({
          value: { uploadUrl: UPLOAD_URL, image: IMAGE_URN },
        })
      );
    }

    // Image fetch from CDN
    if (urlStr.includes('cdn.aether.test')) {
      return Promise.resolve(mockImageResponse());
    }

    // Step 2: PUT bytes to signed upload URL
    if (urlStr === UPLOAD_URL && init?.method === 'PUT') {
      return Promise.resolve(mockResponse('', { status: 201 }));
    }

    // Step 3: POST /rest/posts
    if (urlStr.includes('/rest/posts') && init?.method === 'POST') {
      return Promise.resolve(
        mockResponse({ id: postUrn }, {
          status: 201,
          headers: { 'x-restli-id': postUrn },
        })
      );
    }

    // List — GET /rest/posts
    if (urlStr.includes('/rest/posts') && (!init?.method || init.method === 'GET')) {
      return Promise.resolve(
        mockResponse({
          elements: [
            {
              id: postUrn,
              commentary: 'recent post',
              createdAt: 1714000000000,
              lifecycleState: 'PUBLISHED',
            },
          ],
        })
      );
    }

    return Promise.reject(new Error(`Unexpected fetch: ${urlStr} ${init?.method ?? 'GET'}`));
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// isLinkedInPublisherConfigured
// ---------------------------------------------------------------------------

describe('isLinkedInPublisherConfigured', () => {
  it('returns false when both env vars are absent', () => {
    expect(isLinkedInPublisherConfigured({})).toBe(false);
  });

  it('returns false when only LINKEDIN_ACCESS_TOKEN is set', () => {
    expect(
      isLinkedInPublisherConfigured({ LINKEDIN_ACCESS_TOKEN: 'token' })
    ).toBe(false);
  });

  it('returns false when only LINKEDIN_MEMBER_ID is set', () => {
    expect(
      isLinkedInPublisherConfigured({ LINKEDIN_MEMBER_ID: MEMBER_ID })
    ).toBe(false);
  });

  it('returns true when both LINKEDIN_ACCESS_TOKEN and LINKEDIN_MEMBER_ID are set', () => {
    expect(
      isLinkedInPublisherConfigured({
        LINKEDIN_ACCESS_TOKEN: 'token',
        LINKEDIN_MEMBER_ID: MEMBER_ID,
      })
    ).toBe(true);
  });

  it('trims whitespace before checking', () => {
    expect(
      isLinkedInPublisherConfigured({
        LINKEDIN_ACCESS_TOKEN: '  ',
        LINKEDIN_MEMBER_ID: MEMBER_ID,
      })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createLinkedInPublisherFromEnv
// ---------------------------------------------------------------------------

describe('createLinkedInPublisherFromEnv', () => {
  it('returns null when env vars are absent', () => {
    expect(createLinkedInPublisherFromEnv({}, {})).toBeNull();
  });

  it('returns a PublisherProvider when both vars are present', () => {
    const provider = createLinkedInPublisherFromEnv(
      {},
      { LINKEDIN_ACCESS_TOKEN: 'token', LINKEDIN_MEMBER_ID: MEMBER_ID }
    );
    expect(provider).not.toBeNull();
    expect(provider!.id).toBe('linkedin');
  });
});

// ---------------------------------------------------------------------------
// canPublish
// ---------------------------------------------------------------------------

describe('canPublish', () => {
  const provider = createLinkedInPublisher({
    accessToken: 'token',
    memberId: MEMBER_ID,
    fetch: vi.fn() as unknown as typeof fetch,
  });

  it('returns true for linkedin platform', () => {
    expect(provider.canPublish(makePost({ platform: 'linkedin' }))).toBe(true);
  });

  it('returns false for other platforms', () => {
    expect(provider.canPublish(makePost({ platform: 'instagram' }))).toBe(false);
    expect(provider.canPublish(makePost({ platform: 'x' }))).toBe(false);
    expect(provider.canPublish(makePost({ platform: 'pinterest' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// schedule — rejection paths
// ---------------------------------------------------------------------------

describe('schedule — validation', () => {
  function makeProvider(fetchFn: typeof fetch): ReturnType<typeof createLinkedInPublisher> {
    return createLinkedInPublisher({
      accessToken: 'token',
      memberId: MEMBER_ID,
      fetch: fetchFn,
    });
  }

  it('rejects when scheduledAt is more than 5 minutes in the future', async () => {
    const provider = makeProvider(vi.fn() as unknown as typeof fetch);
    await expect(
      provider.schedule(makePost({ scheduledAt: scheduledFar() }))
    ).rejects.toThrow(PublisherError);

    await expect(
      provider.schedule(makePost({ scheduledAt: scheduledFar() }))
    ).rejects.toThrow('does not support future scheduling');
  });

  it('rejects when mediaUrls is empty', async () => {
    const provider = makeProvider(vi.fn() as unknown as typeof fetch);
    await expect(
      provider.schedule(makePost({ mediaUrls: [] }))
    ).rejects.toThrow(PublisherError);

    await expect(
      provider.schedule(makePost({ mediaUrls: [] }))
    ).rejects.toThrow('mediaUrls required');
  });

  it('rejects when mediaUrls is missing', async () => {
    const provider = makeProvider(vi.fn() as unknown as typeof fetch);
    const post = makePost();
    // @ts-expect-error — deliberately violating the type to test runtime guard
    delete post.mediaUrls;
    await expect(provider.schedule(post)).rejects.toThrow(PublisherError);
  });
});

// ---------------------------------------------------------------------------
// schedule — happy path
// ---------------------------------------------------------------------------

describe('schedule — happy path', () => {
  it('fires the three expected fetches in order and returns correct externalId and previewUrl', async () => {
    const mockFetch = buildHappyFetch();
    const provider = createLinkedInPublisher({
      accessToken: 'li-token',
      memberId: MEMBER_ID,
      fetch: mockFetch,
    });

    const result = await provider.schedule(makePost());

    expect(result.externalId).toBe(POST_URN);
    expect(result.previewUrl).toContain('linkedin.com/feed/update/');
    expect(result.previewUrl).toContain(encodeURIComponent(POST_URN));

    const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls as [string | URL | Request, RequestInit?][];

    // Call 0: image fetch from CDN (happens inside uploadImageBytes after initializeUpload)
    // Call order: initializeUpload → CDN fetch → PUT bytes → POST /rest/posts
    const urls = calls.map(([url]) =>
      typeof url === 'string' ? url : url instanceof URL ? url.href : (url as Request).url
    );

    // The initializeUpload call must come first.
    expect(urls[0]).toContain('initializeUpload');
    // The CDN image fetch and PUT follow.
    const cdnCallIdx = urls.findIndex((u) => u.includes('cdn.aether.test'));
    expect(cdnCallIdx).toBeGreaterThan(0);
    const putCallIdx = urls.indexOf(UPLOAD_URL);
    expect(putCallIdx).toBeGreaterThan(cdnCallIdx);
    // The POST /rest/posts must be last.
    const postCallIdx = calls.findIndex(
      ([u, init]) =>
        (typeof u === 'string' ? u : '').includes('/rest/posts') &&
        init?.method === 'POST'
    );
    expect(postCallIdx).toBeGreaterThan(putCallIdx);

    // Total: 4 calls (initializeUpload, cdn fetch, PUT, POST /rest/posts).
    expect(calls).toHaveLength(4);
  });

  it('builds the author URN correctly in the POST body', async () => {
    const mockFetch = buildHappyFetch();
    const provider = createLinkedInPublisher({
      accessToken: 'li-token',
      memberId: MEMBER_ID,
      fetch: mockFetch,
    });

    await provider.schedule(makePost());

    const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls as [string | URL | Request, RequestInit?][];
    const postCall = calls.find(
      ([u, init]) =>
        (typeof u === 'string' ? u : '').includes('/rest/posts') &&
        init?.method === 'POST'
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string) as Record<string, unknown>;
    expect(body.author).toBe(AUTHOR_URN);
    expect(body.lifecycleState).toBe('PUBLISHED');
    expect(body.visibility).toBe('PUBLIC');
  });

  it('includes hashtags in commentary', async () => {
    const mockFetch = buildHappyFetch();
    const provider = createLinkedInPublisher({
      accessToken: 'li-token',
      memberId: MEMBER_ID,
      fetch: mockFetch,
    });

    const post = makePost({ caption: 'Test post', hashtags: ['aether', '#hackathon'] });
    await provider.schedule(post);

    const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls as [string | URL | Request, RequestInit?][];
    const postCall = calls.find(
      ([u, init]) =>
        (typeof u === 'string' ? u : '').includes('/rest/posts') &&
        init?.method === 'POST'
    );
    const body = JSON.parse(postCall![1]!.body as string) as Record<string, unknown>;
    expect(body.commentary).toContain('Test post');
    expect(body.commentary).toContain('#aether');
    expect(body.commentary).toContain('#hackathon');
  });
});

// ---------------------------------------------------------------------------
// schedule — fail-fast on initializeUpload error
// ---------------------------------------------------------------------------

describe('schedule — fail-fast on initializeUpload error', () => {
  it('throws PublisherError with HTTP status when initialize returns 400', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockResponse({ message: 'Bad Request' }, { status: 400 })
    ) as unknown as typeof fetch;

    const provider = createLinkedInPublisher({
      accessToken: 'li-token',
      memberId: MEMBER_ID,
      fetch: mockFetch,
    });

    await expect(provider.schedule(makePost())).rejects.toThrow(PublisherError);
    await expect(provider.schedule(makePost())).rejects.toThrow('400');
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('list', () => {
  it('returns recent posts mapped to ScheduledPost shape', async () => {
    const mockFetch = buildHappyFetch();
    const provider = createLinkedInPublisher({
      accessToken: 'li-token',
      memberId: MEMBER_ID,
      fetch: mockFetch,
    });

    // list() uses GET /rest/posts — trigger it directly.
    const posts = await provider.list('ws-1');

    expect(posts).toHaveLength(1);
    expect(posts[0]!.platform).toBe('linkedin');
    expect(posts[0]!.externalId).toBe(POST_URN);
    expect(posts[0]!.caption).toBe('recent post');
    expect(posts[0]!.status).toBe('published');
  });

  it('returns empty array when the API request fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockResponse('', { status: 500 })
    ) as unknown as typeof fetch;

    const provider = createLinkedInPublisher({
      accessToken: 'li-token',
      memberId: MEMBER_ID,
      fetch: mockFetch,
    });

    const posts = await provider.list('ws-1');
    expect(posts).toEqual([]);
  });

  it('passes the correct author query param in the GET request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockResponse({ elements: [] })
    ) as unknown as typeof fetch;

    const provider = createLinkedInPublisher({
      accessToken: 'li-token',
      memberId: MEMBER_ID,
      fetch: mockFetch,
    });

    await provider.list('ws-1');

    const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls as [string | URL | Request, RequestInit?][];
    const url = typeof calls[0]![0] === 'string' ? calls[0]![0] : '';
    expect(url).toContain('q=author');
    expect(url).toContain(encodeURIComponent(AUTHOR_URN));
  });
});

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

describe('cancel', () => {
  it('resolves without throwing (no-op)', async () => {
    const provider = createLinkedInPublisher({
      accessToken: 'token',
      memberId: MEMBER_ID,
      fetch: vi.fn() as unknown as typeof fetch,
    });
    await expect(provider.cancel(POST_URN)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// LinkedIn-Version header
// ---------------------------------------------------------------------------

describe('LinkedIn-Version header', () => {
  it('sends the default 202509 version when not overridden', async () => {
    // Why 202509: 202405 expired (HTTP 426 NONEXISTENT_VERSION as of
    // 2026-04-27 verification). LinkedIn versions auto-expire after ~12
    // months; 202509 is in the active window with headroom. Verified
    // against the publisher token via /rest/me on 2026-04-27.
    const mockFetch = buildHappyFetch();
    const provider = createLinkedInPublisher({
      accessToken: 'li-token',
      memberId: MEMBER_ID,
      fetch: mockFetch,
    });

    await provider.schedule(makePost());

    const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls as [string | URL | Request, RequestInit?][];
    const postCall = calls.find(
      ([u, init]) =>
        (typeof u === 'string' ? u : '').includes('/rest/posts') &&
        init?.method === 'POST'
    );
    const headers = postCall![1]!.headers as Record<string, string>;
    expect(headers['LinkedIn-Version']).toBe('202509');
    expect(headers['X-Restli-Protocol-Version']).toBe('2.0.0');
  });

  it('sends a custom version when apiVersion is overridden', async () => {
    const mockFetch = buildHappyFetch();
    const provider = createLinkedInPublisher({
      accessToken: 'li-token',
      memberId: MEMBER_ID,
      apiVersion: '202501',
      fetch: mockFetch,
    });

    await provider.schedule(makePost());

    const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls as [string | URL | Request, RequestInit?][];
    const postCall = calls.find(
      ([u, init]) =>
        (typeof u === 'string' ? u : '').includes('/rest/posts') &&
        init?.method === 'POST'
    );
    const headers = postCall![1]!.headers as Record<string, string>;
    expect(headers['LinkedIn-Version']).toBe('202501');
  });
});
