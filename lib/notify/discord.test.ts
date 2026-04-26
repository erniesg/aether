import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyDiscord } from './discord';
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
});
