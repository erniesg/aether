import { describe, expect, it, vi } from 'vitest';

import { createRapidApiClient, type FetchLike } from '@/lib/signals/rapidapi/client';
import {
  parsePinterestResponse,
  scrapePinterest,
} from '@/lib/signals/rapidapi/pinterest';

import cassette from '../fixtures/signals-cassettes/pinterest/keyword-warm-shelf.json';

describe('pinterest scraper', () => {
  it('parses the recorded RapidAPI cassette into normalized SignalHits', () => {
    const hits = parsePinterestResponse(cassette, { query: 'warm shelf' });
    expect(hits).toHaveLength(2);

    const [first, second] = hits;
    expect(first?.platform).toBe('pinterest');
    expect(first?.id).toBe('pinterest:pin_001');
    expect(first?.title).toContain('warm shelf');
    expect(first?.url).toContain('pinterest.com/pin/12345');
    expect(first?.thumbnailUrl).toContain('warmshelf.jpg');
    expect(first?.author).toBe('ritualstudio');
    expect(first?.authorUrl).toContain('pinterest.com/ritualstudio');
    expect(first?.metrics.saves).toBe(421);
    expect(first?.metrics.comments).toBe(12);

    expect(second?.author).toBe('skinlab');
  });

  it('issues the expected RapidAPI request and parses through scrapePinterest', async () => {
    const fetchImpl = vi.fn<FetchLike>(async (url, init) => {
      expect(url).toContain('pinterest-scraper-fast.p.rapidapi.com');
      expect(url).toMatch(/q=warm(\+|%20)shelf/);
      const headers = init?.headers as Record<string, string>;
      expect(headers['X-RapidAPI-Key']).toBe('k');
      return new Response(JSON.stringify(cassette), { status: 200 });
    });

    const client = createRapidApiClient({ apiKey: 'k', fetchImpl });
    const hits = await scrapePinterest(client, { query: 'warm shelf', limit: 4 });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.platform).toBe('pinterest');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('returns [] when the response has no recognizable items', () => {
    expect(parsePinterestResponse({}, { query: 'x' })).toEqual([]);
    expect(parsePinterestResponse({ data: null }, { query: 'x' })).toEqual([]);
  });
});
