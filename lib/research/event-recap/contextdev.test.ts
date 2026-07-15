import { describe, expect, it } from 'vitest';
import {
  isContextDevConfigured,
  scrapeUrlViaContextDev,
  searchPlatformViaContextDev,
} from './contextdev';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface RecordedRequest {
  url: string;
  init?: RequestInit;
  body?: Record<string, unknown>;
}

function recordingFetcher(
  responder: (request: RecordedRequest) => Response | Promise<Response>,
  log: RecordedRequest[]
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const request: RecordedRequest = { url, init };
    if (typeof init?.body === 'string') {
      try {
        request.body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        /* leave undefined */
      }
    }
    log.push(request);
    return responder(request);
  }) as typeof fetch;
}

/** Minimal valid Context.dev /v1/web/search result item. */
function makeSearchResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    url: 'https://x.com/buildersg/status/1234567890',
    title: 'Builder SG on X',
    description: 'Great recap of AI Engineer Singapore! The workflow demos were top-notch.',
    relevance: 'high',
    markdown: { markdown: null, code: 'NOT_REQUESTED' },
    ...overrides,
  };
}

function makeSearchResponse(
  results: unknown[] = [makeSearchResult()],
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    results,
    query: 'AI Engineer Singapore',
    key_metadata: { credits_consumed: 1, credits_remaining: 99 },
    ...extra,
  };
}

const WINDOW = {
  windowStart: '2025-06-01T00:00:00.000Z',
  windowEnd: '2025-06-09T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// isContextDevConfigured
// ---------------------------------------------------------------------------

describe('isContextDevConfigured', () => {
  it('returns true when CONTEXT_DEV_API_KEY is set', () => {
    expect(isContextDevConfigured({ CONTEXT_DEV_API_KEY: 'ctxt_secret_abc' })).toBe(true);
  });

  it('returns true when only the CONTEXT_API_KEY fallback is set', () => {
    expect(isContextDevConfigured({ CONTEXT_API_KEY: 'ctxt_secret_abc' })).toBe(true);
  });

  it('returns false when neither key is set or keys are blank', () => {
    expect(isContextDevConfigured({})).toBe(false);
    expect(isContextDevConfigured({ CONTEXT_DEV_API_KEY: '   ' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// searchPlatformViaContextDev — unconfigured
// ---------------------------------------------------------------------------

describe('searchPlatformViaContextDev — unconfigured', () => {
  it('returns an empty result with a warning and never calls the network', async () => {
    const result = await searchPlatformViaContextDev(
      {
        platform: 'x',
        querySet: ['AI Engineer Singapore'],
        maxItems: 10,
        ...WINDOW,
      },
      {},
      () => {
        throw new Error('fetcher should not be called');
      }
    );

    expect(result.platform).toBe('x');
    expect(result.posts).toHaveLength(0);
    expect(result.warnings.join(' ')).toMatch(/context\.dev api key is not configured/i);
  });
});

// ---------------------------------------------------------------------------
// searchPlatformViaContextDev — request shape
// ---------------------------------------------------------------------------

describe('searchPlatformViaContextDev — request shape', () => {
  it('POSTs to /v1/web/search with bearer auth, domain allowlist, and date-bounded query', async () => {
    const log: RecordedRequest[] = [];
    const fetcher = recordingFetcher(() => jsonResponse(makeSearchResponse()), log);

    await searchPlatformViaContextDev(
      {
        platform: 'x',
        querySet: ['AI Engineer Singapore'],
        maxItems: 10,
        ...WINDOW,
      },
      { CONTEXT_DEV_API_KEY: 'ctxt_secret_test' },
      fetcher
    );

    expect(log).toHaveLength(1);
    expect(log[0].url).toBe('https://api.context.dev/v1/web/search');
    expect(log[0].init?.method).toBe('POST');
    const headers = new Headers(log[0].init?.headers);
    expect(headers.get('authorization')).toBe('Bearer ctxt_secret_test');

    const body = log[0].body!;
    expect(body.includeDomains).toEqual(['x.com', 'twitter.com']);
    // Past-window backfill: the query carries Google-style date operators.
    expect(body.query).toContain('AI Engineer Singapore');
    expect(body.query).toContain('after:2025-05-31');
    expect(body.query).toContain('before:2025-06-10');
    const num = body.numResults as number;
    expect(num).toBeGreaterThanOrEqual(10);
    expect(num).toBeLessThanOrEqual(100);
    const markdownOptions = body.markdownOptions as Record<string, unknown>;
    expect(markdownOptions.enabled).toBe(true);
  });

  it('uses linkedin.com as the domain allowlist for linkedin', async () => {
    const log: RecordedRequest[] = [];
    const fetcher = recordingFetcher(() => jsonResponse(makeSearchResponse([])), log);

    await searchPlatformViaContextDev(
      {
        platform: 'linkedin',
        querySet: ['AI Engineer Singapore'],
        maxItems: 10,
        ...WINDOW,
      },
      { CONTEXT_DEV_API_KEY: 'ctxt_secret_test' },
      fetcher
    );

    expect(log[0].body!.includeDomains).toEqual(['linkedin.com']);
  });
});

// ---------------------------------------------------------------------------
// searchPlatformViaContextDev — normalization
// ---------------------------------------------------------------------------

describe('searchPlatformViaContextDev — normalization', () => {
  it('maps an X status result to a normalized post with canonical url and handle', async () => {
    const fetcher = recordingFetcher(
      () =>
        jsonResponse(
          makeSearchResponse([
            makeSearchResult({
              url: 'https://twitter.com/buildersg/status/1234567890?s=20',
            }),
          ])
        ),
      []
    );

    const result = await searchPlatformViaContextDev(
      {
        platform: 'x',
        querySet: ['AI Engineer Singapore'],
        maxItems: 10,
        ...WINDOW,
      },
      { CONTEXT_DEV_API_KEY: 'ctxt_secret_test' },
      fetcher
    );

    expect(result.posts).toHaveLength(1);
    const post = result.posts[0];
    expect(post.url).toBe('https://x.com/buildersg/status/1234567890');
    expect(post.platform).toBe('x');
    expect(post.authorHandle).toBe('buildersg');
    expect(post.text).toMatch(/great recap/i);
    expect(post.tags).toContain('contextdev');
    expect(post.postId).toBeTruthy();
  });

  it('accepts linkedin post permalinks and derives the author from the slug', async () => {
    const fetcher = recordingFetcher(
      () =>
        jsonResponse(
          makeSearchResponse([
            makeSearchResult({
              url: 'https://www.linkedin.com/posts/jane-doe_ai-engineer-singapore-recap-activity-987654321',
              description: 'What a week at AI Engineer Singapore.',
            }),
          ])
        ),
      []
    );

    const result = await searchPlatformViaContextDev(
      {
        platform: 'linkedin',
        querySet: ['AI Engineer Singapore'],
        maxItems: 10,
        ...WINDOW,
      },
      { CONTEXT_DEV_API_KEY: 'ctxt_secret_test' },
      fetcher
    );

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].platform).toBe('linkedin');
    expect(result.posts[0].authorHandle).toBe('jane-doe');
  });

  it('skips non-post URLs (profiles, search pages) and reports them in raw', async () => {
    const fetcher = recordingFetcher(
      () =>
        jsonResponse(
          makeSearchResponse([
            makeSearchResult({ url: 'https://x.com/buildersg' }),
            makeSearchResult({ url: 'https://x.com/search?q=aie' }),
            makeSearchResult(),
          ])
        ),
      []
    );

    const result = await searchPlatformViaContextDev(
      {
        platform: 'x',
        querySet: ['AI Engineer Singapore'],
        maxItems: 10,
        ...WINDOW,
      },
      { CONTEXT_DEV_API_KEY: 'ctxt_secret_test' },
      fetcher
    );

    expect(result.posts).toHaveLength(1);
    const raw = result.raw as Record<string, unknown>;
    expect(raw.skippedInvalid).toBe(2);
  });

  it('dedupes seen post urls and identical results across queries', async () => {
    const fetcher = recordingFetcher(
      () => jsonResponse(makeSearchResponse([makeSearchResult(), makeSearchResult()])),
      []
    );

    const result = await searchPlatformViaContextDev(
      {
        platform: 'x',
        querySet: ['AI Engineer Singapore', 'AIE Singapore recap'],
        maxItems: 10,
        seenPostUrls: [],
        ...WINDOW,
      },
      { CONTEXT_DEV_API_KEY: 'ctxt_secret_test' },
      fetcher
    );

    expect(result.posts).toHaveLength(1);

    const singleResultFetcher = recordingFetcher(
      () => jsonResponse(makeSearchResponse([makeSearchResult()])),
      []
    );
    const seenResult = await searchPlatformViaContextDev(
      {
        platform: 'x',
        querySet: ['AI Engineer Singapore'],
        maxItems: 10,
        seenPostUrls: ['https://x.com/buildersg/status/1234567890'],
        ...WINDOW,
      },
      { CONTEXT_DEV_API_KEY: 'ctxt_secret_test' },
      singleResultFetcher
    );

    expect(seenResult.posts).toHaveLength(0);
    expect((seenResult.raw as Record<string, unknown>).skippedSeen).toBe(1);
  });

  it('respects maxItems across queries', async () => {
    let call = 0;
    const fetcher = recordingFetcher(() => {
      call += 1;
      return jsonResponse(
        makeSearchResponse([
          makeSearchResult({
            url: `https://x.com/user${call}/status/${1000 + call}`,
          }),
        ])
      );
    }, []);

    const result = await searchPlatformViaContextDev(
      {
        platform: 'x',
        querySet: ['query one', 'query two', 'query three'],
        maxItems: 2,
        ...WINDOW,
      },
      { CONTEXT_DEV_API_KEY: 'ctxt_secret_test' },
      fetcher
    );

    expect(result.posts).toHaveLength(2);
  });

  it('sums credits consumed into raw', async () => {
    const fetcher = recordingFetcher(
      () => jsonResponse(makeSearchResponse([makeSearchResult()], { key_metadata: { credits_consumed: 3 } })),
      []
    );

    const result = await searchPlatformViaContextDev(
      {
        platform: 'x',
        querySet: ['AI Engineer Singapore'],
        maxItems: 10,
        ...WINDOW,
      },
      { CONTEXT_DEV_API_KEY: 'ctxt_secret_test' },
      fetcher
    );

    expect((result.raw as Record<string, unknown>).creditsConsumed).toBe(3);
  });

  it('throws on a non-OK HTTP response', async () => {
    const fetcher = recordingFetcher(() => jsonResponse({ error: 'RATE_LIMITED' }, 429), []);

    await expect(
      searchPlatformViaContextDev(
        {
          platform: 'x',
          querySet: ['AI Engineer Singapore'],
          maxItems: 10,
          ...WINDOW,
        },
        { CONTEXT_DEV_API_KEY: 'ctxt_secret_test' },
        fetcher
      )
    ).rejects.toThrow(/context\.dev.*429/i);
  });
});

// ---------------------------------------------------------------------------
// scrapeUrlViaContextDev
// ---------------------------------------------------------------------------

describe('scrapeUrlViaContextDev', () => {
  it('GETs /v1/web/scrape/markdown with the url encoded and returns markdown', async () => {
    const log: RecordedRequest[] = [];
    const fetcher = recordingFetcher(
      () =>
        jsonResponse({
          success: true,
          url: 'https://ai.engineer/summit',
          markdown: '# AI Engineer Summit',
        }),
      log
    );

    const result = await scrapeUrlViaContextDev(
      'https://ai.engineer/summit',
      { CONTEXT_DEV_API_KEY: 'ctxt_secret_test' },
      fetcher
    );

    expect(log[0].url).toContain('https://api.context.dev/v1/web/scrape/markdown?');
    expect(log[0].url).toContain(encodeURIComponent('https://ai.engineer/summit'));
    const headers = new Headers(log[0].init?.headers);
    expect(headers.get('authorization')).toBe('Bearer ctxt_secret_test');
    expect(result.markdown).toBe('# AI Engineer Summit');
  });

  it('returns undefined markdown when unconfigured, with a warning', async () => {
    const result = await scrapeUrlViaContextDev('https://ai.engineer/summit', {}, () => {
      throw new Error('fetcher should not be called');
    });
    expect(result.markdown).toBeUndefined();
    expect(result.warnings.join(' ')).toMatch(/not configured/i);
  });
});
