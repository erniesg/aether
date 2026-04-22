import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ingestBrand: vi.fn(),
}));

vi.mock('@/lib/brand/ingest', () => ({
  ingestBrand: mocks.ingestBrand,
}));

describe('/api/brand-ingest', () => {
  afterEach(() => {
    vi.resetModules();
    mocks.ingestBrand.mockReset();
  });

  it('accepts a url ingest request and returns { ok, snapshot, review }', async () => {
    mocks.ingestBrand.mockResolvedValueOnce({
      palette: [{ hex: '#0f1013', role: 'primary' }],
      typography: [{ family: 'Canela Deck', role: 'display' }],
      voice: { samples: ['Slow, certain skincare.'] },
      logos: [],
      productImages: [],
      confidence: 0.72,
      source: { kind: 'url', url: 'https://solsticeskin.com' },
    });

    const { POST } = await import('@/app/api/brand-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/brand-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'url', source: 'https://solsticeskin.com' }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.snapshot.palette[0]).toEqual({ hex: '#0f1013', role: 'primary' });
    expect(json.snapshot.source).toEqual({ kind: 'url', url: 'https://solsticeskin.com' });
    expect(json.review).toBe(false);
    expect(mocks.ingestBrand).toHaveBeenCalledWith(
      { kind: 'url', source: 'https://solsticeskin.com' },
      { bypassAgent: false }
    );
  });

  it('flips review=true when confidence drops below the threshold', async () => {
    mocks.ingestBrand.mockResolvedValueOnce({
      palette: [{ hex: '#0f1013' }],
      typography: [],
      voice: { samples: [] },
      logos: [],
      productImages: [],
      confidence: 0.3,
      source: { kind: 'url', url: 'https://thin.example.com' },
    });

    const { POST } = await import('@/app/api/brand-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/brand-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'url', source: 'https://thin.example.com' }),
      })
    );

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.review).toBe(true);
  });

  it('passes bypassAgent through to the ingest call when set', async () => {
    mocks.ingestBrand.mockResolvedValueOnce({
      palette: [],
      typography: [],
      voice: { samples: [] },
      logos: [],
      productImages: [],
      confidence: 0.2,
      source: { kind: 'files' },
    });

    const { POST } = await import('@/app/api/brand-ingest/route');
    await POST(
      new Request('http://localhost/api/brand-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'files',
          source: { texts: ['hi'] },
          bypassAgent: true,
        }),
      })
    );

    expect(mocks.ingestBrand).toHaveBeenCalledWith(
      { kind: 'files', source: { texts: ['hi'] } },
      { bypassAgent: true }
    );
  });

  it('rejects an unknown kind', async () => {
    const { POST } = await import('@/app/api/brand-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/brand-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'other', source: 'x' }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/kind must be one of/);
  });

  it('rejects missing source', async () => {
    const { POST } = await import('@/app/api/brand-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/brand-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'url' }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/source/);
  });

  it('translates fetch failures into 400s', async () => {
    mocks.ingestBrand.mockRejectedValueOnce(new Error('fetch failed: 404 Not Found'));
    const { POST } = await import('@/app/api/brand-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/brand-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'url', source: 'https://missing.example.com' }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('ingest_failed');
  });
});
