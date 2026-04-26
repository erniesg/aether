import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchProductOnSerp, searchProductImagesOnSerp } from './serp';

describe('searchProductOnSerp', () => {
  let prevKey: string | undefined;

  beforeEach(() => {
    prevKey = process.env.SERPAPI_KEY;
    process.env.SERPAPI_KEY = 'test-serpapi-key';
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.SERPAPI_KEY;
    else process.env.SERPAPI_KEY = prevKey;
    vi.restoreAllMocks();
  });

  it('returns null when SERPAPI_KEY is unset and no override is passed', async () => {
    delete process.env.SERPAPI_KEY;
    const got = await searchProductOnSerp('Eight Sleep Pod 4 Ultra', {
      fetchImpl: vi.fn() as never,
    });
    expect(got).toBeNull();
  });

  it('parses a knowledge-graph hit (high confidence)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          knowledge_graph: {
            title: 'Pod 4 Ultra',
            type: 'Mattress',
            description:
              'Smart mattress cover with personalised cooling and heating.',
            manufacturer: 'Eight Sleep',
            image: 'https://cdn.example/pod4-hero.jpg',
            images: [
              { source: 'https://cdn.example/pod4-side.jpg' },
              { source: 'https://cdn.example/pod4-detail.jpg' },
            ],
          },
          organic_results: [
            { title: 'Pod 4 Ultra | Eight Sleep', link: 'https://www.eightsleep.com/pod-4-ultra' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const got = await searchProductOnSerp('Eight Sleep Pod 4 Ultra', {
      fetchImpl: fetchMock as never,
    });
    expect(got).not.toBeNull();
    expect(got!.source).toBe('knowledge-graph');
    expect(got!.brand).toBe('Eight Sleep');
    expect(got!.product).toBe('Pod 4 Ultra');
    expect(got!.description).toMatch(/cooling/i);
    expect(got!.imageUrls).toHaveLength(3);
    expect(got!.officialUrl).toBe('https://www.eightsleep.com/pod-4-ultra');
  });

  it('falls back to organic top result when no knowledge graph', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          organic_results: [
            {
              title: 'Pod 4 Ultra Mattress Cover',
              link: 'https://example.com/pod-4-ultra',
              snippet: 'The Pod 4 Ultra cools and heats each side independently.',
              thumbnail: 'https://example.com/thumb.jpg',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const got = await searchProductOnSerp('Pod 4 Ultra', {
      fetchImpl: fetchMock as never,
    });
    expect(got).not.toBeNull();
    expect(got!.source).toBe('organic');
    expect(got!.product).toBe('Pod 4 Ultra Mattress Cover');
    expect(got!.officialUrl).toBe('https://example.com/pod-4-ultra');
  });

  it('returns null on SerpAPI error response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const got = await searchProductOnSerp('foo', { fetchImpl: fetchMock as never });
    expect(got).toBeNull();
  });

  it('returns null on non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, { status: 500 })
    );
    const got = await searchProductOnSerp('foo', { fetchImpl: fetchMock as never });
    expect(got).toBeNull();
  });

  it('returns null on network error (fail-soft)', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const got = await searchProductOnSerp('foo', { fetchImpl: fetchMock as never });
    expect(got).toBeNull();
  });

  it('passes the SG locale to SerpAPI', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    await searchProductOnSerp('Pod 4', { fetchImpl: fetchMock as never });
    const url = (fetchMock.mock.calls[0]![0] as string);
    expect(url).toContain('gl=sg');
    expect(url).toContain('hl=en');
  });
});

describe('searchProductImagesOnSerp', () => {
  let prevKey: string | undefined;
  beforeEach(() => {
    prevKey = process.env.SERPAPI_KEY;
    process.env.SERPAPI_KEY = 'test-key';
  });
  afterEach(() => {
    if (prevKey === undefined) delete process.env.SERPAPI_KEY;
    else process.env.SERPAPI_KEY = prevKey;
  });

  it('returns image URLs preferring `original` over `thumbnail`', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          images_results: [
            { original: 'https://x/a.jpg', thumbnail: 'https://x/a-thumb.jpg' },
            { original: 'https://x/b.jpg' },
            { thumbnail: 'https://x/c-thumb.jpg' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const got = await searchProductImagesOnSerp('Pod 4 Ultra', 3, {
      fetchImpl: fetchMock as never,
    });
    expect(got).toEqual([
      'https://x/a.jpg',
      'https://x/b.jpg',
      'https://x/c-thumb.jpg',
    ]);
  });

  it('returns [] when SERPAPI_KEY is unset', async () => {
    delete process.env.SERPAPI_KEY;
    const got = await searchProductImagesOnSerp('foo', 3, {
      fetchImpl: vi.fn() as never,
    });
    expect(got).toEqual([]);
  });

  it('respects the limit', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          images_results: Array.from({ length: 10 }, (_, i) => ({
            original: `https://x/${i}.jpg`,
          })),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const got = await searchProductImagesOnSerp('foo', 3, {
      fetchImpl: fetchMock as never,
    });
    expect(got).toHaveLength(3);
  });
});
