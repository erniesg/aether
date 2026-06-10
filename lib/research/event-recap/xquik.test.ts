import { describe, expect, it } from 'vitest';
import { isXquikConfigured, searchXViaXquik } from './xquik';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Minimal valid Xquik tweet fixture. */
function makeTweet(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '1234567890',
    text: 'Great recap of AI Engineer Singapore! The workflow demos were top-notch.',
    author: {
      userName: 'buildersg',
      name: 'Builder SG',
    },
    createdAt: '2026-05-18T10:00:00.000Z',
    likeCount: 42,
    retweetCount: 7,
    replyCount: 5,
    viewCount: 3100,
    quoteCount: 2,
    media: [],
    ...overrides,
  };
}

/** Minimal valid Xquik response envelope. */
function makeXquikResponse(
  tweets: unknown[] = [makeTweet()],
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    tweets,
    hasMore: false,
    nextCursor: '',
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// isXquikConfigured
// ---------------------------------------------------------------------------

describe('isXquikConfigured', () => {
  it('returns true when XQUIK_API_KEY is a non-empty trimmed string', () => {
    expect(isXquikConfigured({ XQUIK_API_KEY: 'xq_abc123' })).toBe(true);
  });

  it('returns false when XQUIK_API_KEY is absent', () => {
    expect(isXquikConfigured({})).toBe(false);
  });

  it('returns false when XQUIK_API_KEY is an empty string', () => {
    expect(isXquikConfigured({ XQUIK_API_KEY: '' })).toBe(false);
  });

  it('returns false when XQUIK_API_KEY is only whitespace', () => {
    expect(isXquikConfigured({ XQUIK_API_KEY: '   ' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// searchXViaXquik — unconfigured
// ---------------------------------------------------------------------------

describe('searchXViaXquik — unconfigured', () => {
  it('returns an empty result with a warning when the API key is missing', async () => {
    const result = await searchXViaXquik(
      {
        querySet: ['AI Engineer Singapore'],
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-18T00:00:00.000Z',
        maxItems: 10,
      },
      {},
      // fetcher should never be called
      () => { throw new Error('fetcher should not be called'); }
    );

    expect(result.platform).toBe('x');
    expect(result.posts).toHaveLength(0);
    expect(result.warnings.join(' ')).toMatch(/xquik api key is not configured/i);
  });
});

// ---------------------------------------------------------------------------
// searchXViaXquik — happy path: tweet parsing
// ---------------------------------------------------------------------------

describe('searchXViaXquik — happy path', () => {
  it('maps a canned Xquik response to a PlatformScrapeResult with correct url, metrics, and tags', async () => {
    const tweet = makeTweet({
      media: [
        { url: 'https://pbs.twimg.com/media/example.jpg', type: 'photo' },
      ],
    });

    const fetcher = async () => jsonResponse(makeXquikResponse([tweet]));

    const result = await searchXViaXquik(
      {
        querySet: ['AI Engineer Singapore'],
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-18T00:00:00.000Z',
        maxItems: 10,
      },
      { XQUIK_API_KEY: 'xq_test' },
      fetcher
    );

    expect(result.platform).toBe('x');
    expect(result.posts).toHaveLength(1);

    const post = result.posts[0];
    // URL follows the canonical x.com/<handle>/status/<id> pattern
    expect(post.url).toBe('https://x.com/buildersg/status/1234567890');
    // postId must be a non-empty string
    expect(post.postId).toBeTruthy();
    expect(typeof post.postId).toBe('string');

    // Author fields
    expect(post.authorName).toBe('Builder SG');
    expect(post.authorHandle).toBe('buildersg');
    expect(post.authorUrl).toBe('https://x.com/buildersg');

    // Metrics
    expect(post.metrics).toMatchObject({
      likes: 42,
      reposts: 7,
      replies: 5,
      views: 3100,
    });

    // Media
    expect(post.media).toHaveLength(1);
    expect(post.media![0]).toMatchObject({
      url: 'https://pbs.twimg.com/media/example.jpg',
      type: 'image',
    });

    // Provenance tag
    expect(post.tags).toContain('xquik');

    // raw must be the raw tweet object
    expect(post.raw).toMatchObject({ id: '1234567890' });

    // postedAt preserved
    expect(post.postedAt).toBe('2026-05-18T10:00:00.000Z');
  });

  it('maps the current Xquik search response contract', async () => {
    const tweet = {
      id: '2058983398048498138',
      text: 'Met @TejasKumar_ and @agrimsingh at AI Engineer Singapore.',
      url: 'https://x.com/Arindam_1729/status/2058983398048498138',
      author: {
        username: 'Arindam_1729',
        name: 'Arindam Majumder',
        followers: 8433,
        verified: true,
        profilePicture: 'https://pbs.twimg.com/profile_images/example_normal.jpg',
      },
      createdAt: 'Mon May 25 18:47:50 +0000 2026',
      likeCount: 3,
      retweetCount: 0,
      replyCount: 1,
      quoteCount: 0,
      viewCount: 859,
      media: [
        {
          media_url_https: 'https://pbs.twimg.com/media/HJL6fTIa4AAcjFk.jpg',
          type: 'photo',
        },
      ],
    };

    const fetcher = async () =>
      jsonResponse({
        tweets: [tweet],
        has_next_page: true,
        next_cursor: 'cursor_1',
      });

    const result = await searchXViaXquik(
      {
        querySet: ['AI Engineer Singapore'],
        windowStart: '2026-05-18T00:00:00.000Z',
        windowEnd: '2026-05-26T00:00:00.000Z',
        maxItems: 5,
      },
      { XQUIK_API_KEY: 'xq_test' },
      fetcher
    );

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toMatchObject({
      url: 'https://x.com/Arindam_1729/status/2058983398048498138',
      authorName: 'Arindam Majumder',
      authorHandle: 'Arindam_1729',
      postedAt: '2026-05-25T18:47:50.000Z',
      metrics: {
        likes: 3,
        replies: 1,
        comments: 1,
        views: 859,
        impressions: 859,
      },
      authorMeta: {
        followers: 8433,
        verified: true,
        profileImageUrl: 'https://pbs.twimg.com/profile_images/example_normal.jpg',
      },
    });
    expect(result.posts[0].media).toHaveLength(1);
    expect(result.posts[0].media![0]).toMatchObject({
      url: 'https://pbs.twimg.com/media/HJL6fTIa4AAcjFk.jpg',
      type: 'image',
    });
    expect(result.raw).toMatchObject({
      itemsReturned: 1,
      itemsCollected: 1,
      skippedInvalid: 0,
      nextCursors: ['cursor_1'],
    });
  });

  it('sends the x-api-key header and correct query params for each query', async () => {
    const captured: { url: string; headers: Record<string, string> }[] = [];

    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.push({
        url: String(input),
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      return jsonResponse(makeXquikResponse([]));
    };

    await searchXViaXquik(
      {
        querySet: ['AI Engineer Singapore', 'aiengineer'],
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-18T00:00:00.000Z',
        maxItems: 20,
      },
      { XQUIK_API_KEY: 'xq_mykey' },
      fetcher
    );

    expect(captured.length).toBeGreaterThanOrEqual(1);
    const firstReq = captured[0];
    expect(firstReq.headers['x-api-key']).toBe('xq_mykey');
    // Must hit the documented search endpoint
    expect(firstReq.url).toContain('https://xquik.com/api/v1/x/tweets/search');
    // Must include the query — URLSearchParams encodes spaces as '+', both forms acceptable
    const queryEncoded =
      firstReq.url.includes(encodeURIComponent('AI Engineer Singapore')) ||
      firstReq.url.includes('AI+Engineer+Singapore') ||
      firstReq.url.includes('AI%20Engineer%20Singapore');
    expect(queryEncoded).toBe(true);
    // Date range params are present
    expect(firstReq.url).toContain('sinceDate=');
    expect(firstReq.url).toContain('untilDate=');
  });
});

// ---------------------------------------------------------------------------
// searchXViaXquik — dedupe against seenPostUrls
// ---------------------------------------------------------------------------

describe('searchXViaXquik — dedupe', () => {
  it('excludes posts whose URLs appear in seenPostUrls', async () => {
    const seenUrl = 'https://x.com/buildersg/status/1234567890';
    const freshUrl = 'https://x.com/buildersg/status/9999999999';

    const tweets = [
      makeTweet({ id: '1234567890' }),
      makeTweet({ id: '9999999999', text: 'New post about the closing keynote.' }),
    ];

    const fetcher = async () => jsonResponse(makeXquikResponse(tweets));

    const result = await searchXViaXquik(
      {
        querySet: ['AI Engineer Singapore'],
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-18T00:00:00.000Z',
        maxItems: 10,
        seenPostUrls: [seenUrl],
      },
      { XQUIK_API_KEY: 'xq_test' },
      fetcher
    );

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].url).toBe(freshUrl);
  });

  it('dedupes across multiple queries within the same call', async () => {
    const sharedId = '111111111';
    let callCount = 0;

    const fetcher = async () => {
      callCount += 1;
      // Both queries return the same tweet
      return jsonResponse(makeXquikResponse([makeTweet({ id: sharedId, text: `Call ${callCount}: AI Engineer recap.` })]));
    };

    const result = await searchXViaXquik(
      {
        querySet: ['AI Engineer Singapore', 'aiengineer'],
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-18T00:00:00.000Z',
        maxItems: 10,
      },
      { XQUIK_API_KEY: 'xq_test' },
      fetcher
    );

    // Even though both queries returned the same URL, it should appear only once
    const urls = result.posts.map((p) => p.url);
    const uniqueUrls = new Set(urls);
    expect(urls.length).toBe(uniqueUrls.size);
  });
});

// ---------------------------------------------------------------------------
// searchXViaXquik — maxItems cap
// ---------------------------------------------------------------------------

describe('searchXViaXquik — maxItems', () => {
  it('returns at most maxItems posts across all queries', async () => {
    const tweets = Array.from({ length: 10 }, (_, i) =>
      makeTweet({ id: String(i + 1), text: `Tweet ${i + 1} about AI Engineer Singapore.` })
    );

    const fetcher = async () => jsonResponse(makeXquikResponse(tweets));

    const result = await searchXViaXquik(
      {
        querySet: ['AI Engineer Singapore'],
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-18T00:00:00.000Z',
        maxItems: 3,
      },
      { XQUIK_API_KEY: 'xq_test' },
      fetcher
    );

    expect(result.posts.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// searchXViaXquik — maxQueries cap
// ---------------------------------------------------------------------------

describe('searchXViaXquik — maxQueries', () => {
  it('stops iterating after maxQueries queries regardless of querySet length', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount += 1;
      return jsonResponse(makeXquikResponse([]));
    };

    await searchXViaXquik(
      {
        querySet: ['q1', 'q2', 'q3', 'q4', 'q5'],
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-18T00:00:00.000Z',
        maxItems: 50,
        maxQueries: 2,
      },
      { XQUIK_API_KEY: 'xq_test' },
      fetcher
    );

    expect(callCount).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// searchXViaXquik — error handling
// ---------------------------------------------------------------------------

describe('searchXViaXquik — non-2xx response', () => {
  it('throws a clear Error when the API returns a non-2xx status', async () => {
    const fetcher = async () =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });

    await expect(
      searchXViaXquik(
        {
          querySet: ['AI Engineer Singapore'],
          windowStart: '2026-05-11T00:00:00.000Z',
          windowEnd: '2026-05-18T00:00:00.000Z',
          maxItems: 10,
        },
        { XQUIK_API_KEY: 'xq_test' },
        fetcher
      )
    ).rejects.toThrow(/401/);
  });
});

// ---------------------------------------------------------------------------
// searchXViaXquik — media type mapping
// ---------------------------------------------------------------------------

describe('searchXViaXquik — media type mapping', () => {
  it.each([
    ['photo', 'image'],
    ['video', 'video'],
    ['animated_gif', 'gif'],
    ['gif', 'gif'],
    ['unknown_type', 'unknown'],
  ])('maps Xquik media type "%s" to EventPostMedia type "%s"', async (xquikType, expectedType) => {
    const tweet = makeTweet({
      media: [{ url: 'https://example.com/asset', type: xquikType }],
    });

    const fetcher = async () => jsonResponse(makeXquikResponse([tweet]));

    const result = await searchXViaXquik(
      {
        querySet: ['test'],
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-18T00:00:00.000Z',
        maxItems: 10,
      },
      { XQUIK_API_KEY: 'xq_test' },
      fetcher
    );

    expect(result.posts[0].media![0].type).toBe(expectedType);
  });
});
