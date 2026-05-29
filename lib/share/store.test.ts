import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetShareStoreMemoryForTests,
  createShareLink,
  getShareSummary,
  resolveShareCode,
  recordShareEvent,
  type ShareTargetInput,
} from './store';

const ORIGINAL_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const ORIGINAL_CONVEX_DEPLOY_KEY = process.env.CONVEX_DEPLOY_KEY;
const ORIGINAL_AETHER_ENV = process.env.AETHER_ENV;
const ORIGINAL_SHARE_EVENT_LOG_SALT = process.env.SHARE_EVENT_LOG_SALT;

describe('share summary metrics', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    delete process.env.CONVEX_DEPLOY_KEY;
    delete process.env.AETHER_ENV;
    __resetShareStoreMemoryForTests();
  });

  afterEach(() => {
    __resetShareStoreMemoryForTests();
    restoreEnv('NEXT_PUBLIC_CONVEX_URL', ORIGINAL_CONVEX_URL);
    restoreEnv('CONVEX_DEPLOY_KEY', ORIGINAL_CONVEX_DEPLOY_KEY);
    restoreEnv('AETHER_ENV', ORIGINAL_AETHER_ENV);
    restoreEnv('SHARE_EVENT_LOG_SALT', ORIGINAL_SHARE_EVENT_LOG_SALT);
    vi.restoreAllMocks();
  });

  it('counts creator share actions separately from tracked short-link visits', async () => {
    const target = shareTarget('share-summary-metrics');
    const link = await createShareLink({
      requestUrl: 'http://localhost/api/share/link',
      target,
      platform: 'x',
      label: 'recap header',
    });

    await recordShareEvent({ eventType: 'platform_clicked', platform: 'x', code: link.code });
    await recordShareEvent({ eventType: 'copy_link', platform: 'copy', canonicalUrl: target.canonicalUrl });
    await recordShareEvent({ eventType: 'copy_clean_link', platform: 'copy', canonicalUrl: target.canonicalUrl });
    await recordShareEvent({
      eventType: 'native_share_error',
      platform: 'native',
      canonicalUrl: target.canonicalUrl,
    });
    await recordShareEvent({ eventType: 'share_link_visit', platform: 'x', code: link.code });
    await recordShareEvent({ eventType: 'share_link_bot_preview', platform: 'x', code: link.code });

    const summary = await getShareSummary(target.canonicalUrl);

    expect(summary.shareLinks).toBe(1);
    expect(summary.shareActions).toBe(2);
    expect(summary.trackedVisits).toBe(1);
    expect(summary.botPreviews).toBe(1);
    expect(summary.publicPostsByPlatform).toEqual({});
    expect(summary.platformActions).toMatchObject({ x: 1, copy: 1 });
    expect(summary.platformActions.native).toBeUndefined();
  });

  it('records request attribution metadata when a short link is created', async () => {
    process.env.SHARE_EVENT_LOG_SALT = 'test-share-salt';
    const target = shareTarget('share-link-request-metadata');
    const request = new Request('http://localhost/api/share/link?campaign=aie2026', {
      headers: {
        referer: 'https://aether.berlayar.ai/vibes/aie2026/',
        'user-agent': 'Vitest Browser/1.0',
        'accept-language': 'en-SG,en;q=0.9',
        'cf-connecting-ip': '203.0.113.8',
        'cf-ipcountry': 'SG',
        'cf-colo': 'SIN',
        'cf-ray': 'abc123-SIN',
        'sec-ch-ua': '"Chromium";v="125"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
      },
    });

    const link = await createShareLink({
      requestUrl: request.url,
      request,
      target,
      platform: 'facebook',
      label: 'recap panel',
    });

    const event = memoryEvents().find((item) => item.eventType === 'share_link_created' && item.code === link.code);
    expect(event).toMatchObject({
      code: link.code,
      platform: 'facebook',
      requestPath: '/api/share/link',
      requestQuery: 'campaign=aie2026',
      referer: 'https://aether.berlayar.ai/vibes/aie2026/',
      userAgent: 'Vitest Browser/1.0',
      acceptLanguage: 'en-SG,en;q=0.9',
      browserBrands: '"Chromium";v="125"',
      browserMobile: '?0',
      browserPlatform: '"macOS"',
      cfCountry: 'SG',
      cfColo: 'SIN',
      cfRay: 'abc123-SIN',
      metadata: { label: 'recap panel' },
    });
    expect(event?.ipHash).toMatch(/^sha256:/);
    expect(event?.visitorHash).toMatch(/^sha256:/);
    expect(JSON.stringify(event)).not.toContain('203.0.113.8');
  });

  it('does not create memory-only short links when staging Convex writes fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.AETHER_ENV = 'staging';
    process.env.NEXT_PUBLIC_CONVEX_URL = 'http://127.0.0.1:9';
    delete process.env.CONVEX_DEPLOY_KEY;
    __resetShareStoreMemoryForTests();

    await expect(
      createShareLink({
        requestUrl: 'https://aether-stg.berlayar.ai/api/share/link',
        target: shareTarget('staging-convex-write-failure'),
        platform: 'copy',
      })
    ).rejects.toThrow(/share store unavailable/i);
  });

  it('does not resolve from memory when staging Convex reads fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const target = shareTarget('staging-convex-read-failure');
    const link = await createShareLink({
      requestUrl: 'http://localhost/api/share/link',
      target,
      platform: 'copy',
    });

    process.env.AETHER_ENV = 'staging';
    process.env.NEXT_PUBLIC_CONVEX_URL = 'http://127.0.0.1:9';
    delete process.env.CONVEX_DEPLOY_KEY;
    __resetShareStoreMemoryForTests();

    await expect(resolveShareCode(link.code)).rejects.toThrow(/share store unavailable/i);
  });
});

function shareTarget(slug: string): ShareTargetInput {
  return {
    canonicalUrl: `http://localhost/events/${slug}`,
    objectType: 'event_recap',
    objectId: slug,
    slug,
    title: `Event recap ${slug}`,
    description: 'A creator-facing recap.',
  };
}

function restoreEnv(
  key: 'NEXT_PUBLIC_CONVEX_URL' | 'CONVEX_DEPLOY_KEY' | 'AETHER_ENV' | 'SHARE_EVENT_LOG_SALT',
  value: string | undefined
) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function memoryEvents(): Array<Record<string, unknown>> {
  return (
    globalThis as typeof globalThis & {
      __aether_share_store__?: { events: Array<Record<string, unknown>> };
    }
  ).__aether_share_store__?.events ?? [];
}
