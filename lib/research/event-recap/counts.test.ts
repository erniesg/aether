import { describe, expect, it, vi } from 'vitest';
import { estimateEventCounts } from './counts';

describe('event count estimates', () => {
  it('estimates X and LinkedIn counts from a seed frontier', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oauth2/token')) {
        return jsonResponse({ access_token: 'app-token' });
      }
      if (url.includes('/2/tweets/counts/recent')) {
        return jsonResponse({ meta: { total_tweet_count: 42 }, data: [] });
      }
      if (url.includes('api.search.tinyfish.ai')) {
        const parsed = new URL(url);
        const q = parsed.searchParams.get('query') ?? '';
        const extra = q.includes('linkedin posts') ? [{ url: 'https://www.linkedin.com/posts/c_3' }] : [];
        return jsonResponse({
          results: [
            { url: 'https://www.linkedin.com/posts/a_1', title: 'A' },
            { url: 'https://www.linkedin.com/posts/b_2', title: 'B' },
            { url: 'https://example.com/not-linkedin' },
            ...extra,
          ],
        });
      }
      return jsonResponse({}, 404);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await estimateEventCounts({
        eventName: 'AI Engineer Summit Singapore',
        querySet: ['AI Engineer Summit Singapore', '"AI engineer" Singapore'],
        platforms: ['x', 'linkedin'],
        // Keep handles out of this unit test because X counts token generation
        // reads the provided env first and this test only mocks fetch.
        maxQueries: 2,
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-17T00:00:00.000Z',
      });

      expect(result.estimates).toHaveLength(2);
      expect(result.estimates[0]).toMatchObject({
        platform: 'x',
      });
      expect(result.estimates[0].estimates.length).toBe(2);
      expect(result.estimates[1]).toMatchObject({
        platform: 'linkedin',
        totalLowerBound: 3,
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('can use TinyFish Agent as a logged-in LinkedIn browser count probe', async () => {
    const originalFetch = global.fetch;
    const originalCredentialIds = process.env.TINYFISH_LINKEDIN_CREDENTIAL_ITEM_IDS;
    const originalUseProfile = process.env.TINYFISH_LINKEDIN_USE_PROFILE;
    process.env.TINYFISH_LINKEDIN_CREDENTIAL_ITEM_IDS = 'credential-a';
    process.env.TINYFISH_LINKEDIN_USE_PROFILE = '1';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/v1/vault/items')) return linkedinVaultResponse();
      const payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      expect(payload.use_vault).toBe(true);
      expect(payload.use_profile).toBe(true);
      expect(payload.credential_item_ids).toEqual(['credential-a']);
      expect(String(payload.url)).toContain('linkedin.com/search/results/content');
      return sseResponse([
        { type: 'STREAMING_URL', streaming_url: 'https://stream.tinyfish.test/run-1' },
        {
          type: 'COMPLETE',
          status: 'COMPLETED',
          result: {
            posts: [
              {
                url: 'https://www.linkedin.com/posts/sherry_1',
                author_name: 'Sherry Yan Jiang',
                text: 'A practical AI engineer Singapore takeaway.',
                reactions: 12,
              },
              {
                url: 'https://www.linkedin.com/posts/sherry_2',
                author_name: 'Sherry Yan Jiang',
                text: 'More notes from AI Engineer Singapore.',
                comments: 3,
              },
            ],
          },
        },
      ]);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await estimateEventCounts({
        eventName: 'AI Engineer Singapore',
        querySet: ['@SherryYanJiang Singapore'],
        platforms: ['linkedin'],
        linkedinMode: 'browser-direct',
        maxQueries: 1,
        maxItems: 10,
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-17T00:00:00.000Z',
      });

      expect(result.estimates).toHaveLength(1);
      expect(result.estimates[0]).toMatchObject({
        platform: 'linkedin',
        mode: 'browser-direct',
        totalLowerBound: 2,
        streamingUrl: 'https://stream.tinyfish.test/run-1',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      global.fetch = originalFetch;
      if (originalCredentialIds === undefined) {
        delete process.env.TINYFISH_LINKEDIN_CREDENTIAL_ITEM_IDS;
      } else {
        process.env.TINYFISH_LINKEDIN_CREDENTIAL_ITEM_IDS = originalCredentialIds;
      }
      if (originalUseProfile === undefined) {
        delete process.env.TINYFISH_LINKEDIN_USE_PROFILE;
      } else {
        process.env.TINYFISH_LINKEDIN_USE_PROFILE = originalUseProfile;
      }
    }
  });

  it('uses handle-to-name LinkedIn variants for search-index estimates', async () => {
    const originalFetch = global.fetch;
    const seenQueries: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api.search.tinyfish.ai')) {
        const parsed = new URL(url);
        seenQueries.push(parsed.searchParams.get('query') ?? '');
        return jsonResponse({
          results: [{ url: 'https://www.linkedin.com/posts/sherry_1', title: 'Sherry' }],
        });
      }
      return jsonResponse({}, 404);
    }) as unknown as typeof fetch;

    try {
      const result = await estimateEventCounts({
        eventName: 'AI Engineer Singapore',
        querySet: ['@SherryYanJiang Singapore'],
        platforms: ['linkedin'],
        linkedinMode: 'search-index',
        maxQueries: 1,
      });

      expect(result.estimates[0]).toMatchObject({
        platform: 'linkedin',
        totalLowerBound: 1,
      });
      expect(seenQueries.some((query) => query.includes('Sherry Yan Jiang Singapore'))).toBe(true);
      expect(seenQueries.some((query) => query.includes('SherryYanJiang Singapore'))).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('surfaces LinkedIn verification as a handoff state', async () => {
    const originalFetch = global.fetch;
    const originalCredentialIds = process.env.TINYFISH_LINKEDIN_CREDENTIAL_ITEM_IDS;
    process.env.TINYFISH_LINKEDIN_CREDENTIAL_ITEM_IDS = 'credential-a';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/v1/vault/items')) return linkedinVaultResponse();
      return sseResponse([
        { type: 'STREAMING_URL', streaming_url: 'https://stream.tinyfish.test/verify' },
        {
          type: 'COMPLETE',
          status: 'FAILED',
          error: { message: 'LinkedIn is asking for a verification code.' },
          help_message: 'Need help? See our error reference for troubleshooting tips.',
        },
      ]);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await estimateEventCounts({
        eventName: 'AI Engineer Singapore',
        querySet: ['@SherryYanJiang Singapore'],
        platforms: ['linkedin'],
        linkedinMode: 'browser-direct',
        maxQueries: 1,
        maxItems: 10,
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-17T00:00:00.000Z',
      });

      expect(result.estimates[0]).toMatchObject({
        platform: 'linkedin',
        mode: 'browser-direct',
        status: 'needs_human_verification',
        totalLowerBound: 0,
        streamingUrl: 'https://stream.tinyfish.test/verify',
      });
    } finally {
      global.fetch = originalFetch;
      if (originalCredentialIds === undefined) {
        delete process.env.TINYFISH_LINKEDIN_CREDENTIAL_ITEM_IDS;
      } else {
        process.env.TINYFISH_LINKEDIN_CREDENTIAL_ITEM_IDS = originalCredentialIds;
      }
    }
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sseResponse(events: unknown[]): Response {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }
  );
}

function linkedinVaultResponse(): Response {
  return jsonResponse({
    items: [
      {
        itemId: 'credential-a',
        label: 'LinkedIn',
        vaultName: 'Personal',
        domains: ['linkedin.com'],
        fieldMetadata: [
          { fieldId: 'username', label: 'username', type: 'STRING' },
          { fieldId: 'password', label: 'password', type: 'CONCEALED' },
        ],
      },
    ],
  });
}
