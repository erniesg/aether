import { describe, expect, it, vi } from 'vitest';

import { createRapidApiClient, type FetchLike } from '@/lib/signals/rapidapi/client';
import {
  parseInstagramResponse,
  scrapeInstagram,
} from '@/lib/signals/rapidapi/instagram';

import cassette from '../fixtures/signals-cassettes/instagram/hashtag-barrierglow.json';

describe('instagram scraper', () => {
  it('parses the recorded cassette into normalized SignalHits', () => {
    const hits = parseInstagramResponse(cassette, {
      query: 'barrierglow',
      kind: 'hashtag',
    });
    expect(hits).toHaveLength(2);

    const [first] = hits;
    expect(first?.platform).toBe('instagram');
    expect(first?.id).toBe('instagram:media_001');
    expect(first?.title).toContain('barrierglow');
    expect(first?.url).toBe('https://www.instagram.com/p/C1abcDEFghi/');
    expect(first?.thumbnailUrl).toContain('barrier-1.jpg');
    expect(first?.author).toBe('solsticestudio');
    expect(first?.authorUrl).toContain('instagram.com/solsticestudio');
    expect(first?.metrics.likes).toBe(1240);
    expect(first?.metrics.comments).toBe(33);
    expect(first?.tags).toContain('hashtag');
  });

  it('routes hashtag queries through the hashtag path on the configured host', async () => {
    const fetchImpl = vi.fn<FetchLike>(async (url) => {
      expect(url).toContain('instagram-scraper-api2.p.rapidapi.com');
      expect(url).toContain('/v1/hashtag');
      expect(url).toContain('hashtag=barrierglow');
      return new Response(JSON.stringify(cassette), { status: 200 });
    });

    const client = createRapidApiClient({ apiKey: 'k', fetchImpl });
    const hits = await scrapeInstagram(client, {
      query: 'barrierglow',
      kind: 'hashtag',
      limit: 4,
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('returns an empty list when items are absent', () => {
    expect(parseInstagramResponse({ data: {} }, { query: 'x' })).toEqual([]);
  });
});
