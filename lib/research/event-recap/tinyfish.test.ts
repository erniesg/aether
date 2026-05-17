import { describe, expect, it } from 'vitest';
import {
  linkedinQueryVariants,
  normalizeTinyFishPosts,
  platformFrontierQueries,
  scrapePlatformViaTinyFish,
} from './tinyfish';

describe('TinyFish event recap normalization', () => {
  it('turns X-style handles into LinkedIn search variants for frontier fanout', () => {
    expect(linkedinQueryVariants('@SherryYanJiang Singapore')).toEqual([
      'Sherry Yan Jiang Singapore',
      'SherryYanJiang Singapore',
      '@SherryYanJiang Singapore',
    ]);

    expect(platformFrontierQueries('linkedin', ['@SherryYanJiang Singapore'], 2)).toEqual([
      'Sherry Yan Jiang Singapore',
      'SherryYanJiang Singapore',
    ]);
  });

  it('keeps LinkedIn post metadata and flattens substantive comments', () => {
    const posts = normalizeTinyFishPosts('linkedin', {
      posts: [
        {
          url: 'https://www.linkedin.com/posts/example_1',
          author_name: 'Builder',
          author_handle: 'builder',
          author_headline: 'AI engineer',
          author_followers: 1200,
          text: 'My practical takeaway from AI Engineer Singapore was that evals need owners.',
          reactions: 12,
          comments: 2,
          comments_list: [
            {
              author_name: 'Attendee',
              author_headline: 'Founder',
              text: 'I had the same reaction, the evals talk was the most useful session.',
              reactions: 3,
            },
          ],
        },
      ],
    });

    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      authorMeta: { headline: 'AI engineer', followers: 1200 },
      metrics: { reactions: 12, comments: 2 },
    });
    expect(posts[1]).toMatchObject({
      authorName: 'Attendee',
      authorMeta: { headline: 'Founder' },
      tags: expect.arrayContaining(['linkedin-comment', 'comment', 'conversation']),
    });
  });

  it('returns as soon as TinyFish SSE emits COMPLETE', async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'STREAMING_URL',
              streaming_url: 'https://stream.tinyfish.test/run',
            })}\n\n`
          )
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'COMPLETE',
              status: 'COMPLETED',
              result: {
                posts: [
                  {
                    url: 'https://www.linkedin.com/posts/a_1',
                    author_name: 'Builder',
                    text: 'A direct LinkedIn search result.',
                  },
                ],
              },
            })}\n\n`
          )
        );
      },
      cancel() {
        cancelled = true;
      },
    });

    const result = await scrapePlatformViaTinyFish(
      {
        platform: 'linkedin',
        querySet: ['Builder Singapore'],
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-18T00:00:00.000Z',
        maxItems: 5,
      },
      async () => new Response(stream, { status: 200 })
    );

    expect(result.streamingUrl).toBe('https://stream.tinyfish.test/run');
    expect(result.posts).toHaveLength(1);
    expect(cancelled).toBe(true);
  });

  it('opens direct LinkedIn profile urls for account frontier scraping', async () => {
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      expect(payload.url).toBe('https://www.linkedin.com/in/sherrypeek/recent-activity/all/');
      return sseResponse([
        {
          type: 'COMPLETE',
          status: 'COMPLETED',
          result: {
            posts: [
              {
                url: 'https://www.linkedin.com/posts/sherrypeek_1',
                author_name: 'Sherry Jiang',
                text: 'AI Engineer Singapore post from profile activity.',
              },
            ],
          },
        },
      ]);
    };

    const result = await scrapePlatformViaTinyFish(
      {
        platform: 'linkedin',
        querySet: ['https://www.linkedin.com/in/sherrypeek/recent-activity/all/'],
        windowStart: '2026-05-11T00:00:00.000Z',
        windowEnd: '2026-05-18T00:00:00.000Z',
        maxItems: 5,
      },
      fetcher
    );

    expect(result.posts).toHaveLength(1);
  });
});

function sseResponse(events: unknown[]): Response {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }
  );
}
