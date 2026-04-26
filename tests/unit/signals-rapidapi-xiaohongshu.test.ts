import { describe, expect, it, vi } from 'vitest';

import { createRapidApiClient, type FetchLike } from '@/lib/signals/rapidapi/client';
import {
  parseXiaohongshuResponse,
  scrapeXiaohongshu,
} from '@/lib/signals/rapidapi/xiaohongshu';

import cassette from '../fixtures/signals-cassettes/xiaohongshu/keyword-skincare.json';

describe('xiaohongshu scraper', () => {
  it('parses the recorded cassette into normalized SignalHits', () => {
    const hits = parseXiaohongshuResponse(cassette, { query: 'skincare' });
    expect(hits).toHaveLength(2);

    const [first] = hits;
    expect(first?.platform).toBe('xiaohongshu');
    expect(first?.id).toBe('xiaohongshu:note_001');
    expect(first?.title).toContain('shelf reset');
    expect(first?.url).toContain('xiaohongshu.com/explore/note_001');
    expect(first?.thumbnailUrl).toContain('cover-1.jpg');
    expect(first?.author).toBe('晨光设计室');
    expect(first?.authorUrl).toContain('xiaohongshu.com/user/profile/user_aaa');
    // "1.2万" can't be coerced to a number, so likes is left undefined; numeric
    // strings come through as numbers.
    expect(first?.metrics.likes).toBeUndefined();
    expect(first?.metrics.comments).toBe(318);
    expect(first?.metrics.saves).toBe(5021);
    expect(first?.metrics.shares).toBe(210);

    const [, second] = hits;
    expect(second?.metrics.likes).toBe(482);
    expect(second?.thumbnailUrl).toContain('cover-2.jpg');
  });

  it('issues the search request and parses through scrapeXiaohongshu', async () => {
    const fetchImpl = vi.fn<FetchLike>(async (url) => {
      expect(url).toContain('xiaohongshu-all-in-one.p.rapidapi.com');
      expect(url).toContain('/search/notes');
      expect(url).toContain('keyword=skincare');
      return new Response(JSON.stringify(cassette), { status: 200 });
    });

    const client = createRapidApiClient({ apiKey: 'k', fetchImpl });
    const hits = await scrapeXiaohongshu(client, { query: 'skincare' });

    expect(hits.length).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
