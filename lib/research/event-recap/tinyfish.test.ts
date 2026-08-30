import { describe, expect, it } from 'vitest';
import {
  isTinyFishAgentRunError,
  linkedinQueryVariants,
  normalizeTinyFishPosts,
  platformFrontierQueries,
  scrapeLinkedInViaTinyFishSearchFetch,
  scrapePlatformViaTinyFish,
  tinyFishBrowserBaseUrl,
  warmLinkedInSessionViaTinyFish,
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

    const postUrl =
      'https://www.linkedin.com/posts/0thernet_i-had-a-blast-in-singapore-this-week-activity-7461680102452502529-YgGD';
    expect(linkedinQueryVariants(postUrl)).toEqual([postUrl]);
    expect(platformFrontierQueries('linkedin', [postUrl], 2)).toEqual([postUrl]);
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
          image_urls: [
            'https://media.licdn.com/dms/image/v2/D4E22AQContent/feedshare-shrink_1280/example.jpg',
            'https://media.licdn.com/dms/image/v2/D4D3DAQHP_rpB7v5-Lg/image-scale_191_1128/daytonaio_cover.jpg',
          ],
          media: [
            {
              url: 'https://media.licdn.com/dms/image/v2/D4E22AQContent/feedshare-image-high-res/slide.jpg',
              type: 'image',
            },
            {
              url: 'https://media.licdn.com/dms/image/v2/D4D3DAQHP_rpB7v5-Lg/image-scale_191_1128/profile_cover.jpg',
              type: 'image',
            },
          ],
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
      media: [
        {
          url: 'https://media.licdn.com/dms/image/v2/D4E22AQContent/feedshare-shrink_1280/example.jpg',
          type: 'image',
          source: 'linkedin-tinyfish',
        },
        {
          url: 'https://media.licdn.com/dms/image/v2/D4E22AQContent/feedshare-image-high-res/slide.jpg',
          type: 'image',
          source: 'linkedin-tinyfish',
        },
      ],
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

  it('surfaces LinkedIn completed-but-blocked OTP results as verification handoffs', async () => {
    await expect(
      scrapePlatformViaTinyFish(
        {
          platform: 'linkedin',
          querySet: ['AI Engineer Singapore'],
          windowStart: '2026-05-11T00:00:00.000Z',
          windowEnd: '2026-05-18T00:00:00.000Z',
          maxItems: 5,
        },
        async () =>
          sseResponse([
            {
              type: 'STREAMING_URL',
              streaming_url: 'https://stream.tinyfish.test/verify',
            },
            {
              type: 'COMPLETE',
              status: 'COMPLETED',
              result: {
                status: 'blocked',
                reason: 'Email OTP encountered',
              },
            },
          ])
      )
    ).rejects.toSatisfy((err: unknown) => {
      expect(isTinyFishAgentRunError(err)).toBe(true);
      if (!isTinyFishAgentRunError(err)) return false;
      expect(err.status).toBe('blocked');
      expect(err.needsHumanVerification).toBe(true);
      expect(err.streamingUrl).toBe('https://stream.tinyfish.test/verify');
      return true;
    });
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

  it('skips already-seen LinkedIn URLs before TinyFish Fetch in search-fetch mode', async () => {
    const seenUrl =
      'https://www.linkedin.com/posts/sherrypeek_seen-ai-engineer-singapore-activity-1-abcD';
    const newUrl =
      'https://www.linkedin.com/posts/SherryPeek_New-AI-Engineer-Singapore-Activity-2-EfGh';
    const fetchedUrls: string[] = [];
    let searchCalls = 0;
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://api.search.tinyfish.ai')) {
        searchCalls += 1;
        return jsonResponse({
          results:
            searchCalls === 1
              ? [
                  { url: seenUrl, title: 'Seen post | Sherry Jiang' },
                  { url: newUrl, title: 'New post | Sherry Jiang' },
                ]
              : [],
        });
      }
      if (url === 'https://api.fetch.tinyfish.ai') {
        const payload = JSON.parse(String(init?.body ?? '{}')) as { urls?: string[] };
        fetchedUrls.push(...(payload.urls ?? []));
        return jsonResponse({
          results: [
            {
              url: newUrl,
              final_url: newUrl,
              title: 'New post | Sherry Jiang',
              text: 'AI Engineer Singapore had useful agent workflow takeaways. More Relevant Posts unrelated text.',
              image_links: [
                'https://media.licdn.com/dms/image/v2/D5610AQContent/feedshare-image-high-res/example?e=1',
                'https://media.licdn.com/dms/image/v2/D5610AQContent/image-scale_191_1128/example_cover?e=1',
                'https://media.licdn.com/dms/image/v2/C561BAQContent/company-background_1536_768/example?e=1',
                'https://media.licdn.com/dms/image/v2/D5616AQProfile/profile-displayphoto-shrink_100_100/profile.jpg',
              ],
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    };

    const result = await scrapeLinkedInViaTinyFishSearchFetch(
      {
        querySet: ['AI Engineer Singapore'],
        maxItems: 5,
        maxQueries: 1,
        searchPagesPerQuery: 1,
        seenPostUrls: [seenUrl.toLowerCase()],
      },
      fetcher
    );

    expect(fetchedUrls).toEqual([newUrl]);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toMatchObject({
      url: newUrl,
      authorName: 'Sherry Jiang',
      text: 'AI Engineer Singapore had useful agent workflow takeaways.',
      media: [
        {
          url: 'https://media.licdn.com/dms/image/v2/D5610AQContent/feedshare-image-high-res/example?e=1',
          type: 'image',
          source: 'linkedin-tinyfish-fetch',
        },
      ],
    });
    expect(result.warnings[0]).toContain('skipped 1 already-seen URLs');
  });

  it('keeps TinyFish Fetch batches within the API limit', async () => {
    const urls = Array.from(
      { length: 11 },
      (_, index) =>
        `https://www.linkedin.com/posts/builder_${index}-ai-engineer-singapore-activity-${index}-abcd`
    );
    const batchSizes: number[] = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://api.search.tinyfish.ai')) {
        return jsonResponse({
          results: urls.map((postUrl) => ({ url: postUrl, title: 'AI Engineer Singapore' })),
        });
      }
      if (url === 'https://api.fetch.tinyfish.ai') {
        const payload = JSON.parse(String(init?.body ?? '{}')) as { urls?: string[] };
        const batch = payload.urls ?? [];
        batchSizes.push(batch.length);
        return jsonResponse({
          results: batch.map((postUrl) => ({
            url: postUrl,
            final_url: postUrl,
            title: 'AI Engineer Singapore',
            text: 'AI Engineer Singapore attendee takeaway about agents and evals.',
          })),
        });
      }
      return jsonResponse({}, 404);
    };

    const result = await scrapeLinkedInViaTinyFishSearchFetch(
      {
        querySet: ['AI Engineer Singapore'],
        maxItems: 11,
        maxQueries: 1,
        searchPagesPerQuery: 1,
        candidateMultiplier: 1,
      },
      fetcher
    );

    expect(batchSizes).toEqual([10, 1]);
    expect(result.posts).toHaveLength(11);
  });

  it('returns an interactive inspector url for LinkedIn human handoff runs', async () => {
    const originalUseProfile = process.env.TINYFISH_LINKEDIN_USE_PROFILE;
    process.env.TINYFISH_LINKEDIN_USE_PROFILE = '1';
    const streamUrl = 'https://ip.tinyfish.test/tf-session/stream/0';
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/v1/vault/items')) return linkedinVaultResponse();
      if (url.includes('/automation/run-async')) {
        const payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(payload.use_vault).toBe(true);
        expect(payload.use_profile).toBe(true);
        expect(payload.credential_item_ids).toEqual(['credential-a']);
        return jsonResponse({ run_id: 'run-a', error: null });
      }
      if (url.includes('/v1/runs/run-a')) {
        return jsonResponse({
          run_id: 'run-a',
          status: 'RUNNING',
          streaming_url: streamUrl,
        });
      }
      if (url === 'https://ip.tinyfish.test/tf-session/pages') {
        return jsonResponse([
          {
            url: 'https://www.linkedin.com/uas/login',
            title: 'LinkedIn Login',
            devtoolsFrontendUrl: 'https://tetra-streaming.tinyfish.test/inspector.html?wss=abc',
          },
        ]);
      }
      return jsonResponse({}, 404);
    };

    try {
      const result = await warmLinkedInSessionViaTinyFish(
        {
          credentialItemIds: ['credential-a'],
          holdMinutes: 3,
          pollSeconds: 1,
        },
        fetcher
      );

      expect(result).toMatchObject({
        status: 'needs_human_verification',
        runId: 'run-a',
        streamingUrl: streamUrl,
        browserBaseUrl: 'https://ip.tinyfish.test/tf-session',
        inspectorUrl: 'https://tetra-streaming.tinyfish.test/inspector.html?wss=abc',
        needsHumanVerification: true,
      });
      expect(result.warnings.some((warning) => warning.includes('read-only'))).toBe(true);
      expect(calls).toContain('https://ip.tinyfish.test/tf-session/pages');
    } finally {
      if (originalUseProfile === undefined) {
        delete process.env.TINYFISH_LINKEDIN_USE_PROFILE;
      } else {
        process.env.TINYFISH_LINKEDIN_USE_PROFILE = originalUseProfile;
      }
    }
  });

  it('derives the TinyFish browser base url from the read-only stream url', () => {
    expect(tinyFishBrowserBaseUrl('https://ip.tinyfish.test/tf-session/stream/0')).toBe(
      'https://ip.tinyfish.test/tf-session'
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function linkedinVaultResponse(): Response {
  return jsonResponse({
    items: [
      {
        itemId: 'credential-a',
        label: 'LinkedIn',
        vaultName: 'Personal',
        domains: ['linkedin.com'],
        fieldMetadata: [
          { fieldId: 'username', label: 'username', type: 'STRING' },
          { fieldId: 'password', label: 'password', type: 'CONCEALED' },
        ],
      },
    ],
  });
}

function sseResponse(events: unknown[]): Response {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }
  );
}
