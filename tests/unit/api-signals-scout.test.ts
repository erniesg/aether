import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import pinterestCassette from '../fixtures/signals-cassettes/pinterest/keyword-warm-shelf.json';
import instagramCassette from '../fixtures/signals-cassettes/instagram/hashtag-barrierglow.json';
import tiktokCassette from '../fixtures/signals-cassettes/tiktok/keyword-skincare.json';
import xhsCassette from '../fixtures/signals-cassettes/xiaohongshu/keyword-skincare.json';

const mocks = vi.hoisted(() => ({
  fetchImpl: vi.fn() as ReturnType<typeof vi.fn>,
}));

vi.mock('@/lib/signals/rapidapi/client', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/signals/rapidapi/client')
  >('@/lib/signals/rapidapi/client');
  return {
    ...actual,
    createRapidApiClient: (opts?: { apiKey?: string; fetchImpl?: typeof mocks.fetchImpl }) =>
      actual.createRapidApiClient({
        apiKey: opts?.apiKey ?? process.env.RAPIDAPI_KEY,
        fetchImpl: mocks.fetchImpl,
      }),
  };
});

const ORIGINAL_KEY = process.env.RAPIDAPI_KEY;

function respondByHost(handlers: Record<string, unknown>) {
  return vi.fn(async (input: string) => {
    for (const [host, body] of Object.entries(handlers)) {
      if (input.includes(host)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  });
}

describe('/api/signals/scout', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.fetchImpl.mockReset();
    delete process.env.RAPIDAPI_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.RAPIDAPI_KEY;
    else process.env.RAPIDAPI_KEY = ORIGINAL_KEY;
  });

  it('returns 503 when RAPIDAPI_KEY is not configured', async () => {
    const { POST } = await import('@/app/api/signals/scout/route');
    const res = await POST(
      new Request('http://localhost/api/signals/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'skincare' }),
      })
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/RAPIDAPI_KEY/);
  });

  it('rejects when query is missing', async () => {
    process.env.RAPIDAPI_KEY = 'k';
    const { POST } = await import('@/app/api/signals/scout/route');
    const res = await POST(
      new Request('http://localhost/api/signals/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it('fans out across all four platforms and aggregates normalized hits', async () => {
    process.env.RAPIDAPI_KEY = 'k';
    mocks.fetchImpl.mockImplementation(
      respondByHost({
        'pinterest-scraper-fast.p.rapidapi.com': pinterestCassette,
        'instagram-scraper-api2.p.rapidapi.com': instagramCassette,
        'tiktok-scraper7.p.rapidapi.com': tiktokCassette,
        'xiaohongshu-all-in-one.p.rapidapi.com': xhsCassette,
      })
    );

    const { POST } = await import('@/app/api/signals/scout/route');
    const res = await POST(
      new Request('http://localhost/api/signals/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'skincare', limit: 4 }),
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      hits: Array<{ platform: string }>;
      errors: Array<{ platform: string; error: string }>;
      platforms: string[];
    };
    expect(json.ok).toBe(true);
    expect(json.platforms).toEqual([
      'pinterest',
      'instagram',
      'tiktok',
      'xiaohongshu',
    ]);
    const platforms = new Set(json.hits.map((h) => h.platform));
    expect(platforms.has('pinterest')).toBe(true);
    expect(platforms.has('instagram')).toBe(true);
    expect(platforms.has('tiktok')).toBe(true);
    expect(platforms.has('xiaohongshu')).toBe(true);
    expect(json.errors).toEqual([]);
  });

  it('records per-platform errors without failing the whole scout', async () => {
    process.env.RAPIDAPI_KEY = 'k';
    mocks.fetchImpl.mockImplementation(async (input: string) => {
      if (input.includes('tiktok')) {
        return new Response('rate limit', { status: 429 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    const { POST } = await import('@/app/api/signals/scout/route');
    const res = await POST(
      new Request('http://localhost/api/signals/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'skincare',
          platforms: ['tiktok', 'pinterest'],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      errors: Array<{ platform: string; error: string }>;
    };
    expect(json.ok).toBe(true);
    expect(json.errors.length).toBe(1);
    expect(json.errors[0]?.platform).toBe('tiktok');
    expect(json.errors[0]?.error).toMatch(/429/);
  });
});
