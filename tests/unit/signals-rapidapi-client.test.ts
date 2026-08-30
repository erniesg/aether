import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRapidApiClient,
  MissingRapidApiKeyError,
  RapidApiHttpError,
  rapidApiKeyConfigured,
  type FetchLike,
} from '@/lib/signals/rapidapi/client';

describe('rapidapi client', () => {
  const originalEnv = process.env.RAPIDAPI_KEY;

  beforeEach(() => {
    delete process.env.RAPIDAPI_KEY;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.RAPIDAPI_KEY;
    } else {
      process.env.RAPIDAPI_KEY = originalEnv;
    }
  });

  it('throws MissingRapidApiKeyError when no key is configured', async () => {
    const client = createRapidApiClient();
    expect(client.hasKey()).toBe(false);
    expect(rapidApiKeyConfigured()).toBe(false);

    await expect(
      client.request({ host: 'example.p.rapidapi.com', path: '/foo' })
    ).rejects.toBeInstanceOf(MissingRapidApiKeyError);
  });

  it('builds the URL, sets RapidAPI headers, and returns parsed JSON', async () => {
    const fetchImpl = vi.fn<FetchLike>(async (url, init) => {
      expect(url).toBe(
        'https://example.p.rapidapi.com/v1/foo?keyword=bar&limit=5'
      );
      expect((init?.headers as Record<string, string>)['X-RapidAPI-Key']).toBe(
        'k-secret'
      );
      expect((init?.headers as Record<string, string>)['X-RapidAPI-Host']).toBe(
        'example.p.rapidapi.com'
      );
      return new Response(JSON.stringify({ ok: true, items: [1, 2] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = createRapidApiClient({ apiKey: 'k-secret', fetchImpl });
    const result = await client.request<{ ok: boolean; items: number[] }>({
      host: 'example.p.rapidapi.com',
      path: '/v1/foo',
      params: { keyword: 'bar', limit: 5 },
    });

    expect(result).toEqual({ ok: true, items: [1, 2] });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('throws RapidApiHttpError on non-2xx with the response body attached', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response('rate limited', { status: 429 });

    const client = createRapidApiClient({ apiKey: 'k', fetchImpl });
    await expect(
      client.request({ host: 'example.p.rapidapi.com', path: '/x' })
    ).rejects.toMatchObject({
      name: 'RapidApiHttpError',
      status: 429,
      host: 'example.p.rapidapi.com',
    });
  });

  it('falls back to env key when no explicit key is provided', async () => {
    process.env.RAPIDAPI_KEY = 'env-key';
    const fetchImpl = vi.fn<FetchLike>(
      async () => new Response('{}', { status: 200 })
    );
    const client = createRapidApiClient({ fetchImpl });
    expect(client.hasKey()).toBe(true);
    expect(rapidApiKeyConfigured()).toBe(true);

    await client.request({ host: 'h.p.rapidapi.com', path: '/p' });
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers['X-RapidAPI-Key']).toBe('env-key');
  });

  it('drops undefined params and skips body when not provided', async () => {
    const fetchImpl = vi.fn<FetchLike>(async (url, init) => {
      expect(url).toBe('https://h.p.rapidapi.com/p?a=1');
      expect(init?.body).toBeUndefined();
      return new Response('{}', { status: 200 });
    });
    const client = createRapidApiClient({ apiKey: 'k', fetchImpl });
    await client.request({
      host: 'h.p.rapidapi.com',
      path: '/p',
      params: { a: 1, b: undefined },
    });
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('surfaces a friendly error when the response is not JSON', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response('<html>error</html>', { status: 200 });
    const client = createRapidApiClient({ apiKey: 'k', fetchImpl });
    await expect(
      client.request({ host: 'h.p.rapidapi.com', path: '/p' })
    ).rejects.toThrow(/non-JSON body/);
  });
});

describe('RapidApiHttpError', () => {
  it('preserves status, host, path and a truncated body', () => {
    const err = new RapidApiHttpError({
      status: 500,
      host: 'h',
      path: '/p',
      body: 'x'.repeat(1000),
    });
    expect(err.status).toBe(500);
    expect(err.message).toContain('500');
    expect(err.message.length).toBeLessThan(400);
  });
});
