import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueEventRecapRefresh } from './refresh-trigger';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('refresh trigger (slice 11)', () => {
  it('POSTs to the refresh endpoint with the x-api-key and refresh payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, bundle: null }), { status: 200 })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await enqueueEventRecapRefresh({
      baseUrl: 'https://aether.berlayar.ai',
      eventId: 'aie-2026',
      apiKey: 'vibes_test_key',
      liveMode: 'tinyfish',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://aether.berlayar.ai/api/events/aie-2026/refresh');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('vibes_test_key');
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.liveMode).toBe('tinyfish');
  });

  it('returns ok:false when the response is non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('forbidden', { status: 403 })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await enqueueEventRecapRefresh({
      baseUrl: 'https://aether.berlayar.ai',
      eventId: 'aie-2026',
      apiKey: 'vibes_bad_key',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toContain('403');
  });

  it('returns ok:false when fetch itself throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('network failed')) as unknown as typeof fetch;

    const result = await enqueueEventRecapRefresh({
      baseUrl: 'https://aether.berlayar.ai',
      eventId: 'aie-2026',
      apiKey: 'vibes_test_key',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('network failed');
  });

  it('strips trailing slash from baseUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await enqueueEventRecapRefresh({
      baseUrl: 'https://aether.berlayar.ai/',
      eventId: 'aie-2026',
      apiKey: 'vibes_x',
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://aether.berlayar.ai/api/events/aie-2026/refresh');
  });

  it('rejects invalid eventIds before making the request', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      enqueueEventRecapRefresh({
        baseUrl: 'https://aether.berlayar.ai',
        eventId: '../etc/passwd',
        apiKey: 'vibes_x',
      })
    ).rejects.toThrow(/invalid eventId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses Bearer auth instead when apiKey looks like a Logto token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await enqueueEventRecapRefresh({
      baseUrl: 'https://aether.berlayar.ai',
      eventId: 'aie-2026',
      apiKey: 'eyJ.logto.token',
      authMode: 'bearer',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer eyJ.logto.token');
    expect(headers['x-api-key']).toBeUndefined();
  });
});
