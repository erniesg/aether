import { describe, expect, it, vi } from 'vitest';

import { createRapidApiClient, type FetchLike } from '@/lib/signals/rapidapi/client';
import {
  parseTikTokResponse,
  scrapeTikTok,
} from '@/lib/signals/rapidapi/tiktok';

import cassette from '../fixtures/signals-cassettes/tiktok/keyword-skincare.json';

describe('tiktok scraper', () => {
  it('parses the recorded cassette into normalized SignalHits', () => {
    const hits = parseTikTokResponse(cassette, { query: 'skincare' });
    expect(hits).toHaveLength(2);

    const [first] = hits;
    expect(first?.platform).toBe('tiktok');
    expect(first?.id).toBe('tiktok:7234567890');
    expect(first?.title).toContain('skincare');
    expect(first?.url).toContain('tiktok.com/@ritualstudio/video/7234567890');
    expect(first?.thumbnailUrl).toContain('cover-1.jpg');
    expect(first?.author).toBe('ritualstudio');
    expect(first?.metrics.likes).toBe(8421);
    expect(first?.metrics.comments).toBe(142);
    expect(first?.metrics.views).toBe(95231);
    expect(first?.metrics.shares).toBe(200);
  });

  it('issues the keyword search request and parses through scrapeTikTok', async () => {
    const fetchImpl = vi.fn<FetchLike>(async (url) => {
      expect(url).toContain('tiktok-scraper7.p.rapidapi.com');
      expect(url).toContain('/feed/search');
      expect(url).toContain('keywords=skincare');
      return new Response(JSON.stringify(cassette), { status: 200 });
    });

    const client = createRapidApiClient({ apiKey: 'k', fetchImpl });
    const hits = await scrapeTikTok(client, { query: 'skincare' });

    expect(hits.length).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('returns an empty list for an empty response', () => {
    expect(parseTikTokResponse({}, { query: 'x' })).toEqual([]);
  });
});
