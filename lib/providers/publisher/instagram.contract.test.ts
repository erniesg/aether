/**
 * Contract tests for InstagramPublisher (Meta Graph API direct adapter).
 *
 * All Graph API calls are mocked via a fetch mock injected through the
 * factory options. No real credentials needed.
 *
 * Two-step IG publish flow:
 *   1. POST /{ig-user-id}/media        → { id: container_id }
 *   2. POST /{ig-user-id}/media_publish → { id: media_id }
 */

import { describe, expect, it, vi, type Mock } from 'vitest';
import type { ScheduledPost } from './types';

function post(overrides: Partial<ScheduledPost> = {}): ScheduledPost {
  return {
    id: 'sp_ig_1',
    platform: 'instagram',
    mediaUrls: ['https://cdn.aether.test/hero.png'],
    caption: 'slow glow key visual',
    hashtags: ['aether', 'launch'],
    scheduledAt: new Date(Date.now() - 60_000).toISOString(), // 1 min past → immediate
    ...overrides,
  };
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('InstagramPublisher · contract', () => {
  it('is configured when IG_ACCESS_TOKEN and IG_USER_ID are both present', async () => {
    const { isInstagramPublisherConfigured } = await import('./instagram');
    expect(
      isInstagramPublisherConfigured({ IG_ACCESS_TOKEN: 'tok', IG_USER_ID: 'uid' })
    ).toBe(true);
  });

  it('is NOT configured when either var is missing', async () => {
    const { isInstagramPublisherConfigured } = await import('./instagram');
    expect(isInstagramPublisherConfigured({ IG_ACCESS_TOKEN: 'tok' })).toBe(false);
    expect(isInstagramPublisherConfigured({ IG_USER_ID: 'uid' })).toBe(false);
    expect(isInstagramPublisherConfigured({})).toBe(false);
  });

  it('createInstagramPublisherFromEnv returns null when not configured', async () => {
    const { createInstagramPublisherFromEnv } = await import('./instagram');
    expect(createInstagramPublisherFromEnv({}, {})).toBeNull();
  });

  it('canPublish is true for instagram posts when configured', async () => {
    const { createInstagramPublisher } = await import('./instagram');
    const publisher = createInstagramPublisher({
      accessToken: 'tok',
      igUserId: 'uid',
    });
    expect(publisher.canPublish(post())).toBe(true);
  });

  it('canPublish is false for non-instagram platform', async () => {
    const { createInstagramPublisher } = await import('./instagram');
    const publisher = createInstagramPublisher({
      accessToken: 'tok',
      igUserId: 'uid',
    });
    expect(publisher.canPublish(post({ platform: 'x' }))).toBe(false);
  });

  it('schedule happy path: container + status poll + publish, returns permalink', async () => {
    // The IG content-publishing flow is now THREE steps after the
    // pollContainerReady fix: create container → poll status_code until
    // FINISHED → publish. The mock returns FINISHED on the first poll.
    const fetchMockFn = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('/media_publish?')) {
        return json({ id: 'media_xyz789' });
      }
      if (href.includes('container_abc?') && href.includes('fields=status_code')) {
        return json({ status_code: 'FINISHED' });
      }
      if (href.includes('/media?')) {
        return json({ id: 'container_abc' });
      }
      return new Response('unexpected', { status: 500 });
    });
    const fetchMock = fetchMockFn as unknown as typeof fetch;

    const { createInstagramPublisher } = await import('./instagram');
    const publisher = createInstagramPublisher({
      accessToken: 'tok',
      igUserId: '12345',
      fetch: fetchMock,
    });

    const result = await publisher.schedule(post());

    expect(result.externalId).toBe('media_xyz789');
    expect(result.previewUrl).toContain('instagram.com');
    // 3 fetches: container create + 1 status poll + media_publish.
    expect(fetchMockFn).toHaveBeenCalledTimes(3);

    // Step 1: container creation should have image_url and caption
    const step1Url = String((fetchMockFn as Mock).mock.calls[0][0]);
    expect(step1Url).toContain('/12345/media');
    expect(step1Url).toContain('image_url=');
    expect(step1Url).toContain('caption=');

    // Step 2: status poll uses the container id
    const step2Url = String((fetchMockFn as Mock).mock.calls[1][0]);
    expect(step2Url).toContain('container_abc');
    expect(step2Url).toContain('fields=status_code');

    // Step 3: publish should use the container id
    const step3Url = String((fetchMockFn as Mock).mock.calls[2][0]);
    expect(step3Url).toContain('/12345/media_publish');
    expect(step3Url).toContain('container_abc');
  });

  it('stages Convex storage URLs through the storage adapter before /media', async () => {
    // Regression guard (2026-04-27): Meta's media-puller refused Convex
    // URLs ("media URI doesn't meet our requirements"). The publisher
    // now detects *.convex.cloud / *.convex.dev hostnames, fetches the
    // bytes, stages them on R2, and passes the public R2 URL to /media.
    const stageSpy = vi.fn(async () => ({
      publicUrl: 'https://pub-test.r2.dev/staged/hero.png',
      key: 'staged/hero.png',
      size: 8,
      provider: 'r2',
      latencyMs: 12,
    }));
    const fakeStorage = {
      id: 'r2',
      isAvailable: () => true,
      stage: stageSpy,
    } as const;

    const fetchMockFn = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      // Source bytes fetch (Convex URL).
      if (href.includes('convex.cloud')) {
        return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]).buffer, {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      if (href.includes('/media_publish?')) return json({ id: 'media_xyz' });
      if (href.includes('container_abc?') && href.includes('fields=status_code')) {
        return json({ status_code: 'FINISHED' });
      }
      if (href.includes('/media?')) return json({ id: 'container_abc' });
      return new Response('unexpected', { status: 500 });
    });
    const fetchMock = fetchMockFn as unknown as typeof fetch;

    const { createInstagramPublisher } = await import('./instagram');
    const publisher = createInstagramPublisher({
      accessToken: 'tok',
      igUserId: '12345',
      fetch: fetchMock,
      storage: fakeStorage,
    });

    await publisher.schedule(
      post({ mediaUrls: ['https://fiery-opossum-632.convex.cloud/api/storage/abc'] })
    );

    // Storage adapter was invoked with the source bytes.
    expect(stageSpy).toHaveBeenCalledTimes(1);
    expect(stageSpy.mock.calls[0]![0].mimeType).toBe('image/png');

    // /media call carries the staged R2 URL, NOT the original Convex URL.
    const containerCall = (fetchMockFn as Mock).mock.calls.find((c) =>
      String(c[0]).includes('/12345/media?')
    );
    expect(containerCall).toBeDefined();
    expect(String(containerCall![0])).toContain('pub-test.r2.dev');
    expect(String(containerCall![0])).not.toContain('convex.cloud');
  });

  it('passes non-Convex URLs straight through to Meta (no staging)', async () => {
    const stageSpy = vi.fn();
    const fakeStorage = {
      id: 'r2',
      isAvailable: () => true,
      stage: stageSpy,
    } as const;

    const fetchMockFn = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('/media_publish?')) return json({ id: 'media_xyz' });
      if (href.includes('container_abc?') && href.includes('fields=status_code')) {
        return json({ status_code: 'FINISHED' });
      }
      if (href.includes('/media?')) return json({ id: 'container_abc' });
      return new Response('unexpected', { status: 500 });
    });

    const { createInstagramPublisher } = await import('./instagram');
    const publisher = createInstagramPublisher({
      accessToken: 'tok',
      igUserId: '12345',
      fetch: fetchMockFn as unknown as typeof fetch,
      storage: fakeStorage,
    });

    await publisher.schedule(
      post({ mediaUrls: ['https://cdn.example.com/hero.png'] })
    );

    expect(stageSpy).not.toHaveBeenCalled();
  });

  it('schedule rejects future-scheduled posts with a clear error', async () => {
    const { createInstagramPublisher } = await import('./instagram');
    const publisher = createInstagramPublisher({
      accessToken: 'tok',
      igUserId: 'uid',
    });

    const futurePost = post({
      scheduledAt: new Date(Date.now() + 10 * 60_000).toISOString(), // 10 min future
    });

    await expect(publisher.schedule(futurePost)).rejects.toThrow(
      /does not support future scheduling/
    );
  });

  it('list queries /{ig-user-id}/media and returns media items', async () => {
    const fetchMock = vi.fn(async () =>
      json({
        data: [
          {
            id: 'm1',
            media_type: 'IMAGE',
            timestamp: '2026-04-01T10:00:00+0000',
            caption: 'test caption',
            permalink: 'https://www.instagram.com/p/abc/',
          },
        ],
        paging: {},
      })
    ) as unknown as typeof fetch;

    const { createInstagramPublisher } = await import('./instagram');
    const publisher = createInstagramPublisher({
      accessToken: 'tok',
      igUserId: '12345',
      fetch: fetchMock,
    });

    const posts = await publisher.list('ws_test');
    expect(posts).toHaveLength(1);
    expect(posts[0]!.id).toBe('m1');
    expect(posts[0]!.platform).toBe('instagram');
  });

  it('cancel throws PublisherError (IG Graph does not support delete)', async () => {
    const { createInstagramPublisher } = await import('./instagram');
    const publisher = createInstagramPublisher({
      accessToken: 'tok',
      igUserId: 'uid',
    });

    await expect(publisher.cancel('m1')).rejects.toThrow(
      /cancel not supported/
    );
  });
});
