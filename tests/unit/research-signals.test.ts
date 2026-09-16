import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResearchTarget } from '@/lib/research/research';
import { searchSignalReferencesForTarget } from '@/lib/research/signals';

const ORIGINAL_ENV = process.env;

function target(overrides: Partial<ResearchTarget> = {}): ResearchTarget {
  return {
    id: 'research-instagram-hashtag-barrierglow',
    kind: 'hashtag',
    platform: 'instagram',
    value: 'barrierglow',
    label: 'instagram #barrierglow',
    sourceUrl: 'https://www.instagram.com/explore/tags/barrierglow/',
    reason: 'creator hashtag',
    tags: ['research', 'instagram', 'hashtag', 'barrierglow'],
    ...overrides,
  };
}

describe('research signal adapters', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SIGNALS_EXECUTION_MODE;
    delete process.env.SIGNALS_MOCK;
    delete process.env.SIGNALS_SCRAPER_INSTAGRAM;
    delete process.env.SIGNALS_XHS_PROVIDERS;
    delete process.env.SIGNALS_XHS_RETRIES;
    delete process.env.SIGNALS_XHS_RETRY_DELAY_MS;
    delete process.env.APIFY_API_TOKEN;
    delete process.env.RAPIDAPI_KEY;
    delete process.env['X-RapidAPI-Key'];
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it('turns Apify Instagram hashtag results into editable references', async () => {
    process.env.APIFY_API_TOKEN = 'test-apify-token';
    process.env.SIGNALS_SCRAPER_INSTAGRAM = 'apify';
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            type: 'Video',
            ownerUsername: 'skin_studio',
            caption: 'Golden hour barrier glow #barrierglow',
            likesCount: 4200,
            commentsCount: 88,
            videoViewCount: 91000,
            url: 'https://www.instagram.com/reel/abc/',
            displayUrl: 'https://cdn.test/ig.jpg',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch;

    const outcome = await searchSignalReferencesForTarget(target(), {
      limit: 2,
      fetcher,
      now: '2026-04-26T00:00:00.000Z',
    });

    expect(outcome.tried).toBe(true);
    expect(outcome.warnings).toEqual([]);
    expect(outcome.records).toHaveLength(1);
    expect(outcome.records[0]).toMatchObject({
      kind: 'video',
      previewUrl: 'https://cdn.test/ig.jpg',
      fullUrl: 'https://www.instagram.com/reel/abc/',
      attribution: {
        source: 'instagram',
        author: 'skin_studio',
      },
      usageIntent: 'research signal',
    });
    expect(outcome.records[0]?.tags).toEqual(
      expect.arrayContaining(['research', 'signal', 'instagram', 'reel', 'barrierglow'])
    );
    const [, init] = vi.mocked(fetcher).mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      hashtags: ['barrierglow'],
      resultsLimit: 2,
    });
  });

  it('uses RapidAPI XHS search when configured', async () => {
    process.env.RAPIDAPI_KEY = 'test-rapidapi-token';
    process.env.SIGNALS_XHS_PROVIDERS = 'rapidapi';
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            items: [
              {
                note: {
                  note_id: 'xhs123',
                  type: 'normal',
                  display_title: 'Slow morning skincare shelf',
                  user: { nickname: 'red_studio' },
                  interact_info: {
                    liked_count: '1.2k',
                    collected_count: '300',
                    comment_count: '45',
                  },
                  images_list: [{ url: 'https://cdn.test/xhs.jpg' }],
                },
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch;

    const outcome = await searchSignalReferencesForTarget(
      target({
        id: 'research-xhs-keyword-slow-morning',
        kind: 'keyword',
        platform: 'xhs',
        value: 'slow morning skincare',
        label: 'xhs slow morning skincare',
        sourceUrl:
          'https://www.xiaohongshu.com/search_result?keyword=slow%20morning%20skincare',
        tags: ['research', 'xhs', 'keyword', 'slow-morning-skincare'],
      }),
      { limit: 1, fetcher, now: '2026-04-26T00:00:00.000Z' }
    );

    expect(outcome.warnings).toEqual([]);
    expect(outcome.records[0]).toMatchObject({
      kind: 'image',
      previewUrl: 'https://cdn.test/xhs.jpg',
      fullUrl: 'https://www.xiaohongshu.com/explore/xhs123',
      attribution: {
        source: 'xhs',
        author: 'red_studio',
      },
      title: 'Slow morning skincare shelf',
    });
    const [url, init] = vi.mocked(fetcher).mock.calls[0] ?? [];
    expect(String(url)).toContain('xiaohongshu/search-note/v2');
    expect((init?.headers as Record<string, string>)['X-RapidAPI-Host']).toBe(
      'xiaohongshu-all-api.p.rapidapi.com'
    );
  });

  it('retries transient RapidAPI XHS failures before falling back', async () => {
    process.env.RAPIDAPI_KEY = 'test-rapidapi-token';
    process.env.SIGNALS_XHS_PROVIDERS = 'rapidapi';
    process.env.SIGNALS_XHS_RETRIES = '3';
    process.env.SIGNALS_XHS_RETRY_DELAY_MS = '0';
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'temporary unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              items: [
                {
                  note: {
                    note_id: 'retry-ok',
                    display_title: 'Recovered XHS result',
                    user: { nickname: 'retry_studio' },
                    interact_info: { liked_count: '42' },
                    images_list: [{ url: 'https://cdn.test/retry.jpg' }],
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      ) as unknown as typeof fetch;

    const outcome = await searchSignalReferencesForTarget(
      target({
        kind: 'keyword',
        platform: 'xhs',
        value: 'slow morning skincare',
        label: 'xhs slow morning skincare',
        sourceUrl:
          'https://www.xiaohongshu.com/search_result?keyword=slow%20morning%20skincare',
        tags: ['research', 'xhs', 'keyword'],
      }),
      { limit: 1, fetcher, now: '2026-04-26T00:00:00.000Z' }
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(outcome.warnings).toEqual([]);
    expect(outcome.records[0]?.fullUrl).toBe(
      'https://www.xiaohongshu.com/explore/retry-ok'
    );
  });

  it('does not try signal APIs for unsupported research platforms', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;

    const outcome = await searchSignalReferencesForTarget(
      target({
        platform: 'pinterest',
        label: 'pinterest slow morning',
        sourceUrl: 'https://www.pinterest.com/search/pins/?q=slow%20morning',
        tags: ['research', 'pinterest', 'keyword'],
      }),
      { fetcher }
    );

    expect(outcome).toEqual({ records: [], warnings: [], tried: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
