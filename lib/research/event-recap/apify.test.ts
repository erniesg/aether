import { describe, expect, it } from 'vitest';
import {
  normalizeApifyLinkedInPost,
  normalizeApifyXTweet,
  searchLinkedInViaApify,
  searchXViaApify,
} from './apify';

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

describe('Apify LinkedIn event recap collection', () => {
  it('normalizes LinkedIn post metadata, engagement, author fields, and media', () => {
    const post = normalizeApifyLinkedInPost({
      id: '7462136639729881088',
      linkedinUrl: 'https://www.linkedin.com/posts/shreyanshhere_openai-google-deepmind-cursor-vercel-activity-7462136639729881088-Q5iw?utm_source=share',
      content:
        'OpenAI, Google DeepMind, Cursor, Vercel, Stripe, Cognition, and Z.ai at AI Engineer Singapore.',
      author: {
        name: 'Shreyansh Agarwal',
        publicIdentifier: 'shreyanshhere',
        linkedinUrl: 'https://www.linkedin.com/in/shreyanshhere?miniProfileUrn=abc',
        info: 'Founder, 19,049 followers',
        avatar: { url: 'https://media.licdn.com/dms/image/profile-displayphoto.jpg' },
      },
      postedAt: {
        timestamp: 1779112014706,
        date: '2026-05-18T13:46:54.706Z',
      },
      postImages: [
        {
          url: 'https://media.licdn.com/dms/image/v2/D5622AQHexample/feedshare-shrink_2048_1536/example.jpg',
          width: 2048,
          height: 1365,
        },
      ],
      engagement: {
        likes: 8,
        comments: 2,
        shares: 1,
        reactions: [{ type: 'LIKE', count: 6 }],
      },
    });

    expect(post).toMatchObject({
      platform: 'linkedin',
      url: 'https://www.linkedin.com/feed/update/urn:li:activity:7462136639729881088',
      authorName: 'Shreyansh Agarwal',
      authorHandle: 'shreyanshhere',
      authorUrl: 'https://www.linkedin.com/in/shreyanshhere/',
      authorMeta: {
        headline: 'Founder, 19,049 followers',
        followers: 19049,
      },
      postedAt: '2026-05-18T13:46:54.706Z',
      metrics: {
        reactions: 8,
        comments: 2,
        reposts: 1,
      },
      media: [
        {
          url: 'https://media.licdn.com/dms/image/v2/D5622AQHexample/feedshare-shrink_2048_1536/example.jpg',
          type: 'image',
          source: 'apify-linkedin',
          width: 2048,
          height: 1365,
        },
      ],
    });
  });

  it('uses LinkedIn title author when the scraped author name is only hashtags', () => {
    const post = normalizeApifyLinkedInPost({
      id: '7461344657520701441',
      linkedinUrl:
        'https://www.linkedin.com/posts/shaohuan-li_aiesingapore-aiengineer-activity-7461344657520701441-OaER',
      content: 'Attending the AI Engineer Singapore event today.',
      authorName: '#aiesingapore #aiengineer',
      authorHandle: 'shaohuan-li',
      title: '#aiesingapore #aiengineer | Shaohuan(Shao) LI',
      engagement: { likes: 65 },
    });

    expect(post).toMatchObject({
      authorName: 'Shaohuan(Shao) LI',
      authorHandle: 'shaohuan-li',
    });
  });

  it('skips seen LinkedIn activity URLs and builds a bounded Apify post-search input', async () => {
    const seenUrl =
      'https://www.linkedin.com/posts/seenbuilder_ai-engineer-singapore-activity-7462130000000000000-abcd';
    let body: Record<string, unknown> | undefined;
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return jsonResponse([
        {
          linkedinUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7462130000000000000',
          content: 'Seen AI Engineer Singapore LinkedIn post.',
          author: { name: 'Seen Builder', publicIdentifier: 'seenbuilder' },
          engagement: { likes: 1, comments: 0, shares: 0 },
        },
        {
          linkedinUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7462131111111111111',
          content: 'Fresh AI Engineer Singapore post with a keynote media carousel.',
          author: { name: 'Fresh Builder', publicIdentifier: 'freshbuilder' },
          postImages: [
            {
              url: 'https://media.licdn.com/dms/image/v2/D5622AQHfresh/feedshare-shrink_800_800/fresh.jpg',
            },
          ],
          engagement: { likes: 10, comments: 3, shares: 2 },
          comments: [
            {
              text: 'The keynote takeaways were useful.',
              author: { name: 'Attendee', publicIdentifier: 'attendee' },
              engagement: { likes: 4 },
            },
          ],
        },
      ]);
    };

    const result = await searchLinkedInViaApify(
      {
        querySet: [
          'AI Engineer Singapore',
          'Vivian Balakrishnan AI Engineer Singapore',
          'https://www.linkedin.com/in/sherrypeek/recent-activity/all/',
        ],
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-18T00:00:00.000Z',
        maxItems: 10,
        maxQueries: 4,
        seenPostUrls: [seenUrl],
        sortBy: 'date',
        contentType: 'all',
        candidateMultiplier: 2,
        scrapeComments: true,
        maxComments: 5,
      },
      { APIFY_API_TOKEN: 'test-token' },
      fetcher
    );

    expect(body).toMatchObject({
      searchQueries: ['AI Engineer Singapore', 'Vivian Balakrishnan AI Engineer Singapore'],
      maxPosts: 10,
      sortBy: 'date',
      contentType: 'all',
      postedLimitDate: '2026-05-11',
      scrapeComments: true,
      maxComments: 5,
      scrapeReactions: false,
    });
    expect(result.posts).toHaveLength(2);
    expect(result.posts[0]).toMatchObject({
      url: 'https://www.linkedin.com/feed/update/urn:li:activity:7462131111111111111',
      metrics: { reactions: 10, comments: 3, reposts: 2 },
      media: [{ url: 'https://media.licdn.com/dms/image/v2/D5622AQHfresh/feedshare-shrink_800_800/fresh.jpg' }],
    });
    expect(result.posts[1]).toMatchObject({
      url: expect.stringContaining(
        'https://www.linkedin.com/feed/update/urn:li:activity:7462131111111111111#comment-1-linkedin_'
      ),
      tags: ['apify-linkedin', 'linkedin-comment', 'comment', 'conversation'],
      metrics: { reactions: 4 },
    });
    expect(result.warnings.join(' ')).toContain('skipped 1 already-seen');
  });
});

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
