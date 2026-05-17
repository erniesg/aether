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
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
