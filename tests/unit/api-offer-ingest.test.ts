import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ingestOffer: vi.fn(),
}));

vi.mock('@/lib/offer/ingest', () => ({
  ingestOffer: mocks.ingestOffer,
}));

describe('/api/offer-ingest', () => {
  afterEach(() => {
    vi.resetModules();
    mocks.ingestOffer.mockReset();
  });

  it('accepts a url ingest request and returns { ok, snapshot, review }', async () => {
    mocks.ingestOffer.mockResolvedValueOnce({
      name: 'Spring Reset Duo',
      tagline: 'Barrier repair plus golden-hour glow.',
      claims: ['Ceramide cleanse', 'Niacinamide glow'],
      heroImages: [{ url: 'https://cdn.example.com/duo.jpg' }],
      confidence: 0.72,
      source: { kind: 'url', url: 'https://solsticeskin.com/duo' },
    });

    const { POST } = await import('@/app/api/offer-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/offer-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'url', source: 'https://solsticeskin.com/duo' }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.snapshot.name).toBe('Spring Reset Duo');
    expect(json.snapshot.claims).toEqual(['Ceramide cleanse', 'Niacinamide glow']);
    expect(json.snapshot.source).toEqual({ kind: 'url', url: 'https://solsticeskin.com/duo' });
    expect(json.review).toBe(false);
    expect(mocks.ingestOffer).toHaveBeenCalledWith(
      { kind: 'url', source: 'https://solsticeskin.com/duo' },
      { bypassAgent: false }
    );
  });

  it('flips review=true when confidence drops below the threshold', async () => {
    mocks.ingestOffer.mockResolvedValueOnce({
      name: 'Spring Reset Duo',
      claims: [],
      heroImages: [],
      confidence: 0.3,
      source: { kind: 'url', url: 'https://thin.example.com' },
    });

    const { POST } = await import('@/app/api/offer-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/offer-ingest', {
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
    mocks.ingestOffer.mockResolvedValueOnce({
      name: 'Untitled offer',
      claims: [],
      heroImages: [],
      confidence: 0.2,
      source: { kind: 'files' },
    });

    const { POST } = await import('@/app/api/offer-ingest/route');
    await POST(
      new Request('http://localhost/api/offer-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'files',
          source: { texts: ['hi'] },
          bypassAgent: true,
        }),
      })
    );

    expect(mocks.ingestOffer).toHaveBeenCalledWith(
      { kind: 'files', source: { texts: ['hi'] } },
      { bypassAgent: true }
    );
  });

  it('routes a clipboard source through the ingest call', async () => {
    mocks.ingestOffer.mockResolvedValueOnce({
      name: 'Spring Reset Duo',
      claims: ['Ceramide cleanse'],
      heroImages: [],
      confidence: 0.52,
      source: { kind: 'clipboard' },
    });

    const { POST } = await import('@/app/api/offer-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/offer-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'clipboard',
          source: { html: '<h1>Spring Reset Duo</h1><ul><li>Ceramide cleanse</li></ul>' },
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.ingestOffer).toHaveBeenCalled();
    const callArg = mocks.ingestOffer.mock.calls[0]![0] as { kind: string };
    expect(callArg.kind).toBe('clipboard');
  });

  it('rejects an unknown kind', async () => {
    const { POST } = await import('@/app/api/offer-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/offer-ingest', {
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
    const { POST } = await import('@/app/api/offer-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/offer-ingest', {
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
    mocks.ingestOffer.mockRejectedValueOnce(new Error('fetch failed: 404 Not Found'));
    const { POST } = await import('@/app/api/offer-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/offer-ingest', {
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
