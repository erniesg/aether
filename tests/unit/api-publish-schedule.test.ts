import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'PUBLISHER_PROVIDER',
  'POSTIZ_API_KEY',
  'POSTIZ_API_URL',
  'POSTIZ_INTEGRATION_INSTAGRAM',
] as const;

function request(body: unknown): Request {
  return new Request('http://localhost/api/publish/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function post() {
  return {
    id: 'sp_1',
    platform: 'instagram',
    mediaUrls: ['https://cdn.aether.test/ig.png'],
    caption: 'slow glow key visual',
    hashtags: ['aether'],
    scheduledAt: '2026-05-01T12:00:00.000Z',
  };
}

describe('/api/publish/schedule', () => {
  const envSnapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      envSnapshot[key] = process.env[key];
      delete process.env[key];
    }
    vi.restoreAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) {
      if (envSnapshot[key] === undefined) delete process.env[key];
      else process.env[key] = envSnapshot[key];
    }
  });

  it('falls back to preview-only when no external publisher is configured', async () => {
    const { POST } = await import('@/app/api/publish/schedule/route');

    const res = await POST(
      request({ workspaceId: 'ws_demo', posts: [post()] })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      providerId: 'preview',
      results: [{ platform: 'instagram', status: 'preview-only' }],
    });
  });

  it('schedules through Postiz when the provider and integration env are present', async () => {
    process.env.PUBLISHER_PROVIDER = 'postiz';
    process.env.POSTIZ_API_KEY = 'postiz-key';
    process.env.POSTIZ_API_URL = 'https://postiz.test/public/v1';
    process.env.POSTIZ_INTEGRATION_INSTAGRAM = 'ig_integration';
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.endsWith('/upload-from-url')) {
        return new Response(
          JSON.stringify({
            id: 'media_1',
            path: 'https://uploads.postiz.com/ig.png',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (href.endsWith('/posts')) {
        return new Response(JSON.stringify([{ postId: 'post_1' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('unexpected', { status: 500 });
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const { POST } = await import('@/app/api/publish/schedule/route');
    const res = await POST(
      request({ workspaceId: 'ws_demo', posts: [post()] })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      providerId: 'postiz',
      results: [
        {
          platform: 'instagram',
          status: 'scheduled',
          externalId: 'post_1',
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns a clear validation error for empty schedule requests', async () => {
    const { POST } = await import('@/app/api/publish/schedule/route');

    const res = await POST(request({ workspaceId: 'ws_demo', posts: [] }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: 'posts with mediaUrls are required',
    });
  });
});
