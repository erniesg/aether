import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'PUBLISHER_PROVIDER',
  'POSTIZ_BASE_URL',
  'POSTIZ_API_KEY',
  'SOCIAL_AUTO_UPLOAD_URL',
  'SOCIAL_AUTO_UPLOAD_TOKEN',
] as const;

const SCHEDULED_AT = '2026-05-01T12:00:00.000Z';

const snapshot: Record<string, string | undefined> = {};
const originalFetch = global.fetch;

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteRequest(body: unknown): Request {
  return new Request('http://localhost/api/publish', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

function post(platform = 'instagram') {
  return {
    platform,
    mediaUrls: ['https://cdn.aether.test/hero.png'],
    caption: 'distribution drop',
    hashtags: ['aether'],
    scheduledAt: SCHEDULED_AT,
    accountId: 'acct_1',
  };
}

describe('POST /api/publish', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    for (const key of ENV_KEYS) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const key of ENV_KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns available publisher metadata', async () => {
    const { GET } = await import('@/app/api/publish/route');
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      knownProviders: ['preview', 'postiz', 'social-auto-upload'],
    });
  });

  it('rejects malformed schedule bodies', async () => {
    const { POST } = await import('@/app/api/publish/route');
    const res = await POST(jsonRequest({ workspaceId: 'ws_demo' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
  });

  it('routes western platform scheduling through Postiz when configured', async () => {
    process.env.POSTIZ_BASE_URL = 'https://postiz.test/';
    process.env.POSTIZ_API_KEY = 'postiz_key';
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'postiz_1' }));

    const { POST } = await import('@/app/api/publish/route');
    const res = await POST(
      jsonRequest({ workspaceId: 'ws_demo', post: post('instagram') })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      provider: { id: 'postiz' },
      post: {
        id: 'postiz_1',
        provider: 'postiz',
        externalId: 'postiz_1',
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://postiz.test/public/v1/posts',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('falls through to social-auto-upload for CJK platforms even when Postiz is the default', async () => {
    process.env.PUBLISHER_PROVIDER = 'postiz';
    process.env.POSTIZ_BASE_URL = 'https://postiz.test';
    process.env.POSTIZ_API_KEY = 'postiz_key';
    process.env.SOCIAL_AUTO_UPLOAD_URL = 'https://sau.test/';
    process.env.SOCIAL_AUTO_UPLOAD_TOKEN = 'sau_key';
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'sau_1' }));

    const { POST } = await import('@/app/api/publish/route');
    const res = await POST(
      jsonRequest({ workspaceId: 'ws_demo', post: post('xhs') })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      provider: { id: 'social-auto-upload' },
      post: {
        id: 'sau_1',
        provider: 'social-auto-upload',
        externalId: 'sau_1',
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sau.test/v1/posts',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('cancels against the external id when one is present', async () => {
    process.env.POSTIZ_BASE_URL = 'https://postiz.test';
    process.env.POSTIZ_API_KEY = 'postiz_key';
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const { DELETE } = await import('@/app/api/publish/route');
    const res = await DELETE(
      deleteRequest({
        workspaceId: 'ws_demo',
        providerId: 'postiz',
        id: 'local_1',
        externalId: 'postiz_1',
      })
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://postiz.test/public/v1/posts/postiz_1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('does not silently fall back to preview for server-side real publishing', async () => {
    const { POST } = await import('@/app/api/publish/route');
    const res = await POST(
      jsonRequest({ workspaceId: 'ws_demo', post: post('instagram') })
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: 'publisher_unavailable',
    });
  });
});
