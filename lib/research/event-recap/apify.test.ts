import { describe, expect, it } from 'vitest';
import { normalizeApifyXTweet, searchXViaApify } from './apify';

describe('Apify X event recap collection', () => {
  it('normalizes tweet metadata, media, author fields, and metrics', () => {
    const post = normalizeApifyXTweet({
      id: '123',
      url: 'https://twitter.com/builder/status/123?utm_source=x',
      fullText: 'AI Engineer Singapore recap with a useful workflow screenshot.',
      createdAt: '2026-05-17T01:23:45.000Z',
      retweetCount: 3,
      quoteCount: 2,
      replyCount: 4,
      likeCount: 55,
      viewCount: 12345,
      author: {
        name: 'Builder',
        userName: 'builder',
        followersCount: 9001,
        verified: true,
        profileImageUrl: 'https://pbs.twimg.com/profile_images/example.jpg',
      },
      extendedEntities: {
        media: [
          {
            type: 'photo',
            media_url_https: 'https://pbs.twimg.com/media/example.jpg',
            ext_alt_text: 'workflow screenshot',
            width: 1200,
            height: 800,
          },
        ],
      },
    });

    expect(post).toMatchObject({
      platform: 'x',
      url: 'https://x.com/builder/status/123',
      authorName: 'Builder',
      authorHandle: 'builder',
      metrics: {
        likes: 55,
        reposts: 5,
        replies: 4,
        views: 12345,
        impressions: 12345,
      },
      media: [
        {
          url: 'https://pbs.twimg.com/media/example.jpg',
          type: 'image',
          source: 'apify-x',
          altText: 'workflow screenshot',
        },
      ],
    });
  });

  it('skips seen X URLs after an Apify run and keeps non-sentinel rows only', async () => {
    const seenUrl = 'https://x.com/seen/status/1';
    const newUrl = 'https://x.com/newbuilder/status/2';
    let body: Record<string, unknown> | undefined;
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return jsonResponse([
        { noResults: true },
        {
          id: '1',
          url: seenUrl,
          text: 'Seen AI Engineer Singapore post.',
          author: { name: 'Seen', userName: 'seen' },
        },
        {
          id: '2',
          url: newUrl,
          text: 'Fresh AI Engineer Singapore post with a media asset.',
          likeCount: 10,
          replyCount: 1,
          viewCount: 500,
          author: { name: 'New Builder', userName: 'newbuilder' },
          media: [{ type: 'photo', mediaUrl: 'https://pbs.twimg.com/media/new.jpg' }],
        },
      ]);
    };

    const result = await searchXViaApify(
      {
        querySet: ['AI Engineer Singapore'],
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-18T00:00:00.000Z',
        maxItems: 5,
        seenPostUrls: [seenUrl],
      },
      { APIFY_API_TOKEN: 'test-token' },
      fetcher
    );

    expect(body).toMatchObject({
      searchTerms: ['AI Engineer Singapore'],
      maxItems: 5,
      sort: 'Latest',
      tweetLanguage: 'en',
      start: '2026-05-11',
      end: '2026-05-18',
    });
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toMatchObject({
      url: newUrl,
      metrics: { likes: 10, replies: 1, views: 500 },
      media: [{ url: 'https://pbs.twimg.com/media/new.jpg' }],
    });
    expect(result.warnings.join(' ')).toContain('sentinel');
    expect(result.warnings.join(' ')).toContain('skipped 1 already-seen');
  });
});

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
