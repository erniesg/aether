import { describe, expect, it, vi } from 'vitest';
import { countYouTubeQueries, searchYouTubeVideos } from './youtube';

describe('YouTube event recap collection', () => {
  it('normalizes video, channel, metrics, and thumbnail media', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/search')) {
        expect(url.searchParams.get('q')).toBe('AI Engineer Singapore');
        return jsonResponse({
          pageInfo: { totalResults: 20 },
          items: [
            { id: { videoId: 'seenVideo01' } },
            { id: { videoId: 'newVideo001' } },
          ],
        });
      }
      if (url.pathname.endsWith('/videos')) {
        expect(url.searchParams.get('id')).toBe('newVideo001');
        return jsonResponse({
          items: [
            {
              id: 'newVideo001',
              snippet: {
                title: 'AI Engineer Singapore Day 1',
                description: 'Keynote clips and practical agent takeaways.',
                channelId: 'channel-1',
                channelTitle: 'AI Engineer',
                publishedAt: '2026-05-17T03:00:00.000Z',
                thumbnails: {
                  high: {
                    url: 'https://i.ytimg.com/vi/newVideo001/hqdefault.jpg',
                    width: 480,
                    height: 360,
                  },
                },
                tags: ['AI Engineer', 'Singapore'],
              },
              statistics: {
                viewCount: '20248',
                likeCount: '375',
                commentCount: '6',
              },
            },
          ],
        });
      }
      if (url.pathname.endsWith('/channels')) {
        return jsonResponse({
          items: [
            {
              id: 'channel-1',
              snippet: {
                title: 'AI Engineer',
                customUrl: '@aiDotEngineer',
                description: 'Conference channel.',
                thumbnails: {
                  default: { url: 'https://yt3.ggpht.com/channel.jpg' },
                },
              },
              statistics: {
                subscriberCount: '38000',
                videoCount: '240',
              },
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    }) as unknown as typeof fetch;

    const result = await searchYouTubeVideos(
      {
        querySet: ['AI Engineer Singapore'],
        maxItems: 2,
        maxQueries: 1,
        seenPostUrls: ['https://www.youtube.com/watch?v=seenVideo01'],
      },
      { YOUTUBE_API_KEY: 'test-key' },
      fetcher
    );

    expect(result.platform).toBe('youtube');
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toMatchObject({
      platform: 'youtube',
      url: 'https://www.youtube.com/watch?v=newVideo001',
      authorName: 'AI Engineer',
      authorHandle: '@aiDotEngineer',
      authorUrl: 'https://www.youtube.com/channel/channel-1',
      authorMeta: {
        followers: 38000,
        posts: 240,
        profileImageUrl: 'https://yt3.ggpht.com/channel.jpg',
      },
      metrics: {
        views: 20248,
        impressions: 20248,
        likes: 375,
        comments: 6,
      },
      media: [
        {
          url: 'https://i.ytimg.com/vi/newVideo001/hqdefault.jpg',
          type: 'image',
          source: 'youtube-thumbnail',
          width: 480,
          height: 360,
        },
      ],
    });
    expect(result.posts[0].text).toContain('Keynote clips');
    expect(result.posts[0].tags).toEqual(
      expect.arrayContaining(['youtube-video', 'youtube-search', 'yt-tag:AI Engineer'])
    );
  });

  it('returns official approximate search counts with sample URLs', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname.endsWith('/search')).toBe(true);
      return jsonResponse({
        pageInfo: { totalResults: 123 },
        items: [
          { id: { videoId: 'video000001' } },
          { id: { videoId: 'video000002' } },
        ],
      });
    }) as unknown as typeof fetch;

    const result = await countYouTubeQueries(
      {
        querySet: ['AI Engineer Singapore'],
        maxQueries: 1,
      },
      { YOUTUBE_DATA_API_KEY: 'test-key' },
      fetcher
    );

    expect(result).toMatchObject({
      platform: 'youtube',
      mode: 'official',
      status: 'completed',
      totalLowerBound: 2,
      totalApproximate: 123,
    });
    expect(result.estimates[0]).toMatchObject({
      query: 'AI Engineer Singapore',
      count: 123,
      approximate: true,
      urls: [
        'https://www.youtube.com/watch?v=video000001',
        'https://www.youtube.com/watch?v=video000002',
      ],
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
