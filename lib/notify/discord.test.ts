import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyDiscord, __resetDiscordIdempotency } from './discord';
import type { DiscordEmbed } from './discord';

describe('notifyDiscord', () => {
  const WEBHOOK = 'https://discord.com/api/webhooks/test/token';

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 })
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false and does not call fetch when no webhook URL is configured', async () => {
    const result = await notifyDiscord({ content: 'hello', tag: 'test' });
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts content-only message to the webhook URL', async () => {
    const result = await notifyDiscord({
      content: 'lap started',
      webhookUrl: WEBHOOK,
      tag: 'lap-start',
    });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WEBHOOK);
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.content).toBe('lap started');
    expect(body.embeds).toBeUndefined();
  });

  it('includes embeds array in the webhook body when embeds are provided', async () => {
    const embeds: DiscordEmbed[] = [
      {
        title: 'Variation 1',
        description: 'slow glow key visual — warm dawn palette',
        color: 5701191, // green
        image: { url: 'https://cdn.aether.test/hero_v1.png' },
        fields: [
          { name: 'Platform', value: 'instagram', inline: true },
          { name: 'Scheduled', value: '2026-04-27 7pm SGT', inline: true },
        ],
        footer: { text: 'campaign camp_1 · variation v1' },
        timestamp: '2026-04-26T13:00:00.000Z',
      },
    ];

    const result = await notifyDiscord({
      content: 'lap complete',
      embeds,
      webhookUrl: WEBHOOK,
    });

    expect(result).toBe(true);
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    ) as Record<string, unknown>;
    expect(body.embeds).toHaveLength(1);
    const embed = (body.embeds as typeof embeds)[0]!;
    expect(embed.title).toBe('Variation 1');
    expect(embed.color).toBe(5701191);
    expect(embed.image?.url).toBe('https://cdn.aether.test/hero_v1.png');
    expect(embed.fields).toHaveLength(2);
    expect(embed.fields![0]!.inline).toBe(true);
    expect(embed.footer?.text).toContain('camp_1');
  });

  it('silently truncates embeds array to 10 (Discord cap)', async () => {
    const embeds: DiscordEmbed[] = Array.from({ length: 15 }, (_, i) => ({
      title: `Embed ${i + 1}`,
    }));

    await notifyDiscord({ content: 'test', embeds, webhookUrl: WEBHOOK });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    ) as Record<string, unknown>;
    expect((body.embeds as DiscordEmbed[]).length).toBe(10);
  });

  it('forwards link-button components to the webhook body', async () => {
    await notifyDiscord({
      content: 'lap done',
      webhookUrl: WEBHOOK,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: 'Approve v1',
              url: 'https://example.com/approve?c=cmp1&v=1',
              emoji: { name: '✅' },
            },
          ],
        },
      ],
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    ) as Record<string, unknown>;
    expect(body.components).toBeDefined();
    const rows = body.components as Array<{ type: number; components: unknown[] }>;
    expect(rows.length).toBe(1);
    expect(rows[0].type).toBe(1);
    expect(rows[0].components.length).toBe(1);
  });

  it('truncates components array to 5 (Discord cap)', async () => {
    const rows = Array.from({ length: 8 }, () => ({
      type: 1 as const,
      components: [
        {
          type: 2 as const,
          style: 5 as const,
          label: 'btn',
          url: 'https://example.com/',
        },
      ],
    }));
    await notifyDiscord({
      content: 'x',
      webhookUrl: WEBHOOK,
      components: rows,
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    ) as Record<string, unknown>;
    expect((body.components as unknown[]).length).toBe(5);
  });

  it('returns false (fail-soft) when the webhook returns a non-2xx status', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    const result = await notifyDiscord({ content: 'x', webhookUrl: WEBHOOK });
    expect(result).toBe(false);
  });

  it('returns false (fail-soft) when fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network error'));
    const result = await notifyDiscord({ content: 'x', webhookUrl: WEBHOOK });
    expect(result).toBe(false);
  });

  describe('idempotency by (campaignId, tag)', () => {
    beforeEach(() => __resetDiscordIdempotency());

    it('skips duplicate (campaignId, tag) on the second call', async () => {
      await notifyDiscord({
        campaignId: 'c1',
        tag: 'lap-start',
        content: 'a',
        webhookUrl: WEBHOOK,
      });
      const second = await notifyDiscord({
        campaignId: 'c1',
        tag: 'lap-start',
        content: 'a',
        webhookUrl: WEBHOOK,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      // Returns true so callers treat it as already-delivered, not failed.
      expect(second).toBe(true);
    });

    it('different tags both fire under the same campaignId', async () => {
      await notifyDiscord({
        campaignId: 'c1',
        tag: 'lap-start',
        content: 'a',
        webhookUrl: WEBHOOK,
      });
      await notifyDiscord({
        campaignId: 'c1',
        tag: 'lap-end-review',
        content: 'b',
        webhookUrl: WEBHOOK,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('different campaignIds both fire under the same tag', async () => {
      await notifyDiscord({
        campaignId: 'c1',
        tag: 'lap-start',
        content: 'a',
        webhookUrl: WEBHOOK,
      });
      await notifyDiscord({
        campaignId: 'c2',
        tag: 'lap-start',
        content: 'b',
        webhookUrl: WEBHOOK,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not dedupe when no campaignId is supplied (ad-hoc pings)', async () => {
      await notifyDiscord({ tag: 'misc', content: 'a', webhookUrl: WEBHOOK });
      await notifyDiscord({ tag: 'misc', content: 'b', webhookUrl: WEBHOOK });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not record the dedupe key when the underlying webhook fails (so a retry can succeed)', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
      const first = await notifyDiscord({
        campaignId: 'c1',
        tag: 'lap-start',
        content: 'a',
        webhookUrl: WEBHOOK,
      });
      expect(first).toBe(false);
      const second = await notifyDiscord({
        campaignId: 'c1',
        tag: 'lap-start',
        content: 'a',
        webhookUrl: WEBHOOK,
      });
      expect(second).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('two concurrent calls with the same (campaignId, tag) only POST once', async () => {
      // Hold the first fetch open until both calls have entered notifyDiscord.
      let resolveFirst: () => void = () => {};
      const firstFetchHeld = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      fetchMock.mockImplementationOnce(async () => {
        await firstFetchHeld;
        return new Response(null, { status: 204 });
      });

      const p1 = notifyDiscord({
        campaignId: 'c-race',
        tag: 'lap-start',
        content: 'a',
        webhookUrl: WEBHOOK,
      });
      // Yield once so p1 reaches the fetch await, then fire p2.
      await Promise.resolve();
      const p2 = notifyDiscord({
        campaignId: 'c-race',
        tag: 'lap-start',
        content: 'a',
        webhookUrl: WEBHOOK,
      });
      // Now release the first fetch so both promises resolve.
      resolveFirst();
      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1).toBe(true);
      expect(r2).toBe(true);
      // The race-safe guard: only ONE fetch fires even though two calls
      // entered concurrently with the same key.
      expect(fetchMock).toHaveBeenCalledOnce();
    });
  });
});
