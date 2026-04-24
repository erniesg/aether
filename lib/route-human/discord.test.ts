import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewNotification } from './types';
import {
  BUTTON_PREFIX,
  DISCORD_COLOR,
} from './types';
import { buildDiscordPayload, sendReviewNotification } from './discord';

const BASE_NOTIFICATION: ReviewNotification = {
  kind: 'ready-for-ernie',
  issueNumber: 40,
  issueTitle: 'Discord human-review routing for capability authoring jobs',
  prNumber: 57,
  prUrl: 'https://github.com/erniesg/aether/pull/57',
  branch: 'feat/discord-route-human',
  author: 'claude',
  acceptanceChecklist: [
    { item: 'lib/route-human/discord.ts builds payload', passed: true },
    { item: 'interaction route verifies signature', passed: true },
    { item: 'fails closed when webhook url unset', passed: true },
  ],
  reviewerVerdict: 'APPROVE',
  reviewerSummary: 'All green. Artifact capture + fail-closed behavior look right.',
  artifacts: [
    {
      kind: 'screenshot',
      url: 'https://r2.example.com/aether/screenshot-1.png',
      caption: 'Review card rendered in staging',
    },
    {
      kind: 'log',
      url: 'https://r2.example.com/aether/test-output.txt',
      caption: 'Vitest output',
    },
  ],
  testSummary: { total: 42, passed: 42, failed: 0, coverage: 0.93 },
};

describe('buildDiscordPayload', () => {
  it('produces exactly one main embed with title, description, and footer', () => {
    const body = buildDiscordPayload(BASE_NOTIFICATION);
    expect(body.embeds.length).toBeGreaterThanOrEqual(1);
    const main = body.embeds[0];
    expect(main.title).toContain('ready-for-ernie');
    expect(main.title).toContain('#57');
    expect(main.description).toContain(BASE_NOTIFICATION.reviewerSummary);
    expect(main.url).toBe(BASE_NOTIFICATION.prUrl);
    expect(main.color).toBe(DISCORD_COLOR.APPROVE);
    expect(main.footer?.text).toContain('issue #40');
    expect(main.footer?.text).toContain('feat/discord-route-human');
  });

  it('renders the acceptance checklist as a field with ✓ / ✗ markers', () => {
    const body = buildDiscordPayload({
      ...BASE_NOTIFICATION,
      acceptanceChecklist: [
        { item: 'builder tested', passed: true },
        { item: 'signature verified', passed: false },
      ],
    });
    const checklistField = body.embeds[0].fields?.find((f) =>
      /acceptance/i.test(f.name)
    );
    expect(checklistField).toBeDefined();
    expect(checklistField!.value).toContain('✓');
    expect(checklistField!.value).toContain('builder tested');
    expect(checklistField!.value).toContain('✗');
    expect(checklistField!.value).toContain('signature verified');
  });

  it('renders a test summary field with counts and coverage', () => {
    const body = buildDiscordPayload(BASE_NOTIFICATION);
    const summaryField = body.embeds[0].fields?.find((f) =>
      /tests/i.test(f.name)
    );
    expect(summaryField).toBeDefined();
    expect(summaryField!.value).toContain('42');
    expect(summaryField!.value).toContain('93');
  });

  it('attaches the first artifact as the main embed image and adds extras as additional embeds', () => {
    const body = buildDiscordPayload(BASE_NOTIFICATION);
    expect(body.embeds[0].image?.url).toBe(BASE_NOTIFICATION.artifacts[0].url);
    // At least one extra embed for the second artifact
    const secondEmbed = body.embeds[1];
    expect(secondEmbed).toBeDefined();
    expect(secondEmbed.description).toContain(BASE_NOTIFICATION.artifacts[1].caption);
  });

  it('adds an action row with four buttons whose custom_ids encode the PR number', () => {
    const body = buildDiscordPayload(BASE_NOTIFICATION);
    const row = body.components?.[0];
    expect(row?.type).toBe(1);
    expect(row?.components).toHaveLength(4);
    const ids = row!.components.map((c) => c.custom_id);
    expect(ids).toEqual([
      `${BUTTON_PREFIX.MERGE}_57`,
      `${BUTTON_PREFIX.REQUEST_CHANGES}_57`,
      `${BUTTON_PREFIX.PAUSE}_57`,
      `${BUTTON_PREFIX.BLOCK}_57`,
    ]);
    // Labels include the requested icons
    const labels = row!.components.map((c) => c.label);
    expect(labels[0]).toMatch(/merge/i);
    expect(labels[1]).toMatch(/request changes/i);
    expect(labels[2]).toMatch(/pause/i);
    expect(labels[3]).toMatch(/block/i);
  });

  it('suppresses @mentions so Discord does not ping everyone', () => {
    const body = buildDiscordPayload(BASE_NOTIFICATION);
    expect(body.allowed_mentions).toBeDefined();
    expect(body.allowed_mentions?.parse).toEqual([]);
  });
});

const ORIGINAL_ENV = { ...process.env };

describe('sendReviewNotification', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('throws when DISCORD_WEBHOOK_URL is unset (fails closed)', async () => {
    delete process.env.DISCORD_WEBHOOK_URL;
    await expect(sendReviewNotification(BASE_NOTIFICATION)).rejects.toThrow(
      /DISCORD_WEBHOOK_URL/
    );
  });

  it('POSTs the payload to the webhook URL with ?wait=true and returns the messageId', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abc';
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://discord.com/api/webhooks/123/abc?wait=true');
      expect(init?.method).toBe('POST');
      const parsed = JSON.parse(String(init?.body ?? '{}'));
      expect(parsed.embeds[0].title).toContain('ready-for-ernie');
      return new Response(JSON.stringify({ id: '999888777' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const result = await sendReviewNotification(BASE_NOTIFICATION, { fetchImpl });
    expect(result.messageId).toBe('999888777');
  });

  it('throws on non-2xx webhook response', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abc';
    const fetchImpl = vi.fn(
      async () => new Response('rate limited', { status: 429 })
    ) as unknown as typeof fetch;
    await expect(
      sendReviewNotification(BASE_NOTIFICATION, { fetchImpl })
    ).rejects.toThrow(/429/);
  });
});
