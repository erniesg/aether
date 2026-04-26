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

  it('schedule happy path: two-step container + publish, returns permalink', async () => {
    const fetchMockFn = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('/media?')) {
        // Step 1: container creation
        return json({ id: 'container_abc' });
      }
      if (href.includes('/media_publish?')) {
        // Step 2: publish
        return json({ id: 'media_xyz789' });
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
    expect(fetchMockFn).toHaveBeenCalledTimes(2);

    // Step 1: container creation should have image_url and caption
    const step1Url = String((fetchMockFn as Mock).mock.calls[0][0]);
    expect(step1Url).toContain('/12345/media');
    expect(step1Url).toContain('image_url=');
    expect(step1Url).toContain('caption=');

    // Step 2: publish should use the container id
    const step2Url = String((fetchMockFn as Mock).mock.calls[1][0]);
    expect(step2Url).toContain('/12345/media_publish');
    expect(step2Url).toContain('container_abc');
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
