import { describe, expect, it, vi } from 'vitest';
import { enrichPublicMentions, resolveShortShareUrl } from './enrichment';
import type { PublicMentionInput } from './store';

describe('share public mention enrichment', () => {
  it('resolves tracked short URLs with the enrichment header before upserting mentions', async () => {
    const upserts: PublicMentionInput[] = [];
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          code: 'tota',
          canonicalUrl: 'https://aether.berlayar.ai/events/ai-engineer-singapore',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch;

    const result = await enrichPublicMentions({
      canonicalUrls: [],
      shortUrls: ['https://s.berlayar.ai/tota'],
      platforms: ['x'],
      fetchImpl,
      searchPosts: async () => [
        {
          platform: 'x',
          url: 'https://x.com/ernie/status/123',
          text: 'Recap here https://s.berlayar.ai/tota',
          authorName: 'Ernie',
          authorHandle: 'ernie',
          metrics: { likes: 4, reposts: 1, replies: 2, impressions: 100 },
        },
      ],
      upsertMention: async (mention) => {
        upserts.push(mention);
        return 'mention_1';
      },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://s.berlayar.ai/tota',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-aether-enrichment': '1',
        }),
        redirect: 'manual',
      })
    );
    expect(result).toMatchObject({ candidates: 1, matched: 1, upserted: 1, skipped: 0 });
    expect(upserts[0]).toMatchObject({
      canonicalUrl: 'https://aether.berlayar.ai/events/ai-engineer-singapore',
      platform: 'x',
      externalId: '123',
      matchedUrl: 'https://s.berlayar.ai/tota',
      matchedCode: 'tota',
      confidence: 'direct_tracked_url',
      metrics: { likes: 4, reposts: 1, replies: 2, impressions: 100 },
    });
  });

  it('matches canonical URLs directly without resolving a short link', async () => {
    const upserts: PublicMentionInput[] = [];

    const result = await enrichPublicMentions({
      canonicalUrls: ['https://aether.berlayar.ai/events/launch'],
      platforms: ['linkedin'],
      searchPosts: async () => [
        {
          platform: 'linkedin',
          url: 'https://www.linkedin.com/feed/update/urn:li:activity:7462136639729881088/',
          text: 'Full notes: https://aether.berlayar.ai/events/launch?utm_source=linkedin',
          authorName: 'Launch Team',
          metrics: { reactions: 7, comments: 3, reposts: 2 },
        },
      ],
      upsertMention: async (mention) => {
        upserts.push(mention);
        return 'mention_2';
      },
    });

    expect(result).toMatchObject({ candidates: 1, matched: 1, upserted: 1 });
    expect(upserts[0]).toMatchObject({
      canonicalUrl: 'https://aether.berlayar.ai/events/launch',
      platform: 'linkedin',
      externalId: '7462136639729881088',
      confidence: 'direct_canonical_url',
      metrics: { reactions: 7, comments: 3, reposts: 2 },
    });
  });

  it('returns null when a short URL does not answer with mapping JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;

    await expect(resolveShortShareUrl('https://s.berlayar.ai/miss', fetchImpl)).resolves.toBeNull();
  });
});
