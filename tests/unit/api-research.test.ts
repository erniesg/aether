import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ingestReferenceUrl: vi.fn(),
}));

vi.mock('@/lib/providers/reference/registry', () => ({
  ingestReferenceUrl: mocks.ingestReferenceUrl,
}));

describe('/api/research', () => {
  afterEach(() => {
    vi.resetModules();
    mocks.ingestReferenceUrl.mockReset();
  });

  it('scrapes direct source URLs through the reference provider seam', async () => {
    const scraped = {
      id: 'ref_pin',
      kind: 'image' as const,
      previewUrl: 'https://i.pinimg.com/ref.jpg',
      fullUrl: 'https://www.pinterest.com/pin/123/',
      attribution: {
        source: 'pinterest',
        author: 'Source Studio',
        url: 'https://www.pinterest.com/pin/123/',
      },
      capturedAt: '2026-04-25T00:00:00.000Z',
    };
    mocks.ingestReferenceUrl.mockResolvedValueOnce({
      record: scraped,
      fallback: false,
      providerId: 'pinterest',
    });

    const { POST } = await import('@/app/api/research/route');
    const res = await POST(
      new Request('http://localhost/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedText: 'https://www.pinterest.com/pin/123/',
          platforms: ['pinterest'],
          limit: 1,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      records: Array<{ id: string; tags: string[] }>;
      scrapedCount: number;
    };
    expect(json.ok).toBe(true);
    expect(json.records[0]?.id).toBe('ref_pin');
    expect(json.records[0]?.tags).toContain('research');
    expect(json.scrapedCount).toBe(1);
    expect(mocks.ingestReferenceUrl).toHaveBeenCalledWith(
      'https://www.pinterest.com/pin/123/'
    );
  });

  it('materializes keyword research when a platform search is not a direct URL', async () => {
    const { POST } = await import('@/app/api/research/route');
    const res = await POST(
      new Request('http://localhost/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedText: 'clinical glow shelf',
          platforms: ['pinterest'],
          limit: 1,
        }),
      })
    );

    const json = (await res.json()) as {
      ok: boolean;
      records: Array<{ title: string; fullUrl: string; attribution: { source: string } }>;
      materializedCount: number;
    };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.records[0]?.title).toContain('pinterest clinical glow shelf');
    expect(json.records[0]?.fullUrl).toContain('pinterest.com/search');
    expect(json.records[0]?.attribution.source).toBe('pinterest');
    expect(json.materializedCount).toBe(1);
  });
});
