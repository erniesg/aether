import { describe, expect, it, vi } from 'vitest';
import { countYouTubeQueries, searchYouTubeVideos } from './youtube';

describe('YouTube event recap collection', () => {
  it('normalizes video, channel, metrics, thumbnail media, comments, and live chat', async () => {
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
              liveStreamingDetails: {
                activeLiveChatId: 'chat-1',
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
      if (url.pathname.endsWith('/commentThreads')) {
        expect(url.searchParams.get('videoId')).toBe('newVideo001');
        return jsonResponse({
          items: [
            {
              id: 'thread-1',
              snippet: {
                videoId: 'newVideo001',
                totalReplyCount: 2,
                topLevelComment: {
                  id: 'comment-1',
                  snippet: {
                    authorDisplayName: 'Builder Viewer',
                    authorChannelUrl: 'https://www.youtube.com/@builderviewer',
                    authorProfileImageUrl: 'https://yt3.ggpht.com/viewer.jpg',
                    textOriginal: 'Loved the practical eval examples from AI Engineer Singapore.',
                    likeCount: 7,
                    publishedAt: '2026-05-17T04:00:00.000Z',
                  },
                },
              },
            },
          ],
        });
      }
      if (url.pathname.endsWith('/liveChat/messages')) {
        expect(url.searchParams.get('liveChatId')).toBe('chat-1');
        return jsonResponse({
          items: [
            {
              id: 'chat-message-1',
              snippet: {
                liveChatId: 'chat-1',
                type: 'textMessageEvent',
                publishedAt: '2026-05-17T03:30:00.000Z',
                textMessageDetails: {
                  messageText: 'This live demo is useful for agent builders.',
                },
              },
              authorDetails: {
                channelId: 'viewer-channel',
                channelUrl: 'https://www.youtube.com/channel/viewer-channel',
                displayName: 'Live Viewer',
                profileImageUrl: 'https://yt3.ggpht.com/live.jpg',
                isVerified: true,
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
        maxCommentsPerVideo: 1,
        maxLiveChatMessagesPerVideo: 1,
      },
      { YOUTUBE_API_KEY: 'test-key' },
      fetcher
    );

    expect(result.platform).toBe('youtube');
    expect(result.posts).toHaveLength(3);
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
    expect(result.posts[1]).toMatchObject({
      platform: 'youtube',
      url: 'https://www.youtube.com/watch?v=newVideo001&lc=comment-1',
      authorName: 'Builder Viewer',
      authorHandle: '@builderviewer',
      text: 'Loved the practical eval examples from AI Engineer Singapore.',
      metrics: { likes: 7, replies: 2, comments: 2 },
      tags: expect.arrayContaining(['youtube-comment', 'comment', 'conversation']),
    });
    expect(result.posts[2]).toMatchObject({
      platform: 'youtube',
      authorName: 'Live Viewer',
      authorHandle: 'viewer-channel',
      text: 'This live demo is useful for agent builders.',
      tags: expect.arrayContaining(['youtube-live-chat', 'comment', 'conversation']),
    });
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
