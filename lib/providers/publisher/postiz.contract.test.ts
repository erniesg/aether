import { describe, expect, it, vi } from 'vitest';
import { createInMemoryScheduledPostStorage } from './memory-storage';
import { createPostizPublisher } from './postiz';
import type { ScheduledPost } from './types';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

function post(overrides: Partial<ScheduledPost> = {}): ScheduledPost {
  return {
    id: 'sp_local_1',
    platform: 'instagram',
    mediaUrls: ['https://cdn.aether.test/ig.png'],
    caption: 'slow glow key visual',
    hashtags: ['aether', 'launch'],
    scheduledAt: '2026-05-01T12:00:00.000Z',
    ...overrides,
  };
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('PostizPublisher · contract', () => {
  it('uploads remote media by URL and schedules a platform post', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith('/upload-from-url')) {
        return json({ id: 'media_1', path: 'https://uploads.postiz.com/ig.png' });
      }
      if (href.endsWith('/posts')) {
        expect(init?.headers).toMatchObject({ Authorization: 'postiz-key' });
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          type: 'schedule',
          date: '2026-05-01T12:00:00.000Z',
          posts: [
            {
              integration: { id: 'ig_integration' },
              value: [
                {
                  content: 'slow glow key visual\n\n#aether #launch',
                  image: [
                    {
                      id: 'media_1',
                      path: 'https://uploads.postiz.com/ig.png',
                    },
                  ],
                },
              ],
              settings: { __type: 'instagram', post_type: 'post' },
            },
          ],
        });
        return json([{ postId: 'post_1', integration: 'ig_integration' }]);
      }
      return new Response('unexpected', { status: 500 });
    }) as unknown as typeof fetch;

    const publisher = createPostizPublisher({
      workspaceId: 'ws_demo',
      apiKey: 'postiz-key',
      apiBaseUrl: 'https://postiz.test/public/v1',
      integrationIds: { instagram: 'ig_integration' },
      storage: createInMemoryScheduledPostStorage(),
      fetch: fetchMock,
    });

    const result = await publisher.schedule(post());

    expect(result.externalId).toBe('post_1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(publisher.list('ws_demo')).resolves.toHaveLength(1);
  });

  it('uploads data URL media through multipart upload before scheduling', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith('/upload')) {
        expect(init?.body).toBeInstanceOf(FormData);
        return json({ id: 'media_data', path: 'https://uploads.postiz.com/aether.png' });
      }
      if (href.endsWith('/posts')) {
        return json([{ postId: 'post_data' }]);
      }
      return new Response('unexpected', { status: 500 });
    }) as unknown as typeof fetch;

    const publisher = createPostizPublisher({
      workspaceId: 'ws_demo',
      apiKey: 'postiz-key',
      integrationIds: { instagram: 'ig_integration' },
      fetch: fetchMock,
    });

    const result = await publisher.schedule(post({ mediaUrls: [TINY_PNG] }));

    expect(result.externalId).toBe('post_data');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('requires a platform integration id before scheduling', async () => {
    const publisher = createPostizPublisher({
      workspaceId: 'ws_demo',
      apiKey: 'postiz-key',
      integrationIds: {},
      fetch: vi.fn() as unknown as typeof fetch,
    });

    expect(publisher.canPublish(post())).toBe(false);
    await expect(publisher.schedule(post())).rejects.toThrow(
      /POSTIZ_INTEGRATION_INSTAGRAM/
    );
  });

  it('cancels by calling DELETE on Postiz before clearing local storage', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain('/posts/post_1');
      expect(init?.method).toBe('DELETE');
      expect(init?.headers).toMatchObject({ Authorization: 'postiz-key' });
      return new Response(null, { status: 204 });
    });
    const storage = createInMemoryScheduledPostStorage();
    await storage.insert('ws_demo', { ...post(), provider: 'postiz', externalId: 'post_1' });
    const publisher = createPostizPublisher({
      workspaceId: 'ws_demo',
      apiKey: 'postiz-key',
      integrationIds: { instagram: 'ig_integration' },
      storage,
      fetch: fetchMock as unknown as typeof fetch,
    });

    await publisher.cancel('post_1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats Postiz 404 on cancel as already-gone (idempotent)', async () => {
    const fetchMock = vi.fn(async () => new Response('not found', { status: 404 }));
    const publisher = createPostizPublisher({
      workspaceId: 'ws_demo',
      apiKey: 'postiz-key',
      integrationIds: { instagram: 'ig_integration' },
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(publisher.cancel('post_gone')).resolves.toBeUndefined();
  });

  it('throws PublisherError when Postiz cancel returns non-404 failure', async () => {
    const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }));
    const publisher = createPostizPublisher({
      workspaceId: 'ws_demo',
      apiKey: 'postiz-key',
      integrationIds: { instagram: 'ig_integration' },
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(publisher.cancel('post_1')).rejects.toThrow(/Postiz DELETE.*HTTP 500/);
  });
});
