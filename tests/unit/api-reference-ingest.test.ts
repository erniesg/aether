import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ingestReferenceUrl: vi.fn(),
}));

vi.mock('@/lib/providers/reference/registry', () => ({
  ingestReferenceUrl: mocks.ingestReferenceUrl,
}));

describe('/api/reference-ingest', () => {
  afterEach(() => {
    vi.resetModules();
    mocks.ingestReferenceUrl.mockReset();
  });

  it('accepts a URL JSON body and returns the record from the registry', async () => {
    const record = {
      id: 'ref_pin_abc',
      kind: 'image' as const,
      previewUrl: 'https://i.pinimg.com/x.jpg',
      fullUrl: 'https://www.pinterest.com/pin/1/',
      attribution: {
        source: 'pinterest',
        author: 'Solstice Studio',
        url: 'https://www.pinterest.com/pin/1/',
      },
      capturedAt: '2026-04-24T12:00:00.000Z',
    };
    mocks.ingestReferenceUrl.mockResolvedValueOnce({
      record,
      fallback: false,
      providerId: 'pinterest',
    });

    const { POST } = await import('@/app/api/reference-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/reference-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://www.pinterest.com/pin/1/' }),
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      record: typeof record;
      fallback: boolean;
      providerId: string;
    };
    expect(json.ok).toBe(true);
    expect(json.record).toEqual(record);
    expect(json.providerId).toBe('pinterest');
    expect(json.fallback).toBe(false);
    expect(mocks.ingestReferenceUrl).toHaveBeenCalledWith(
      'https://www.pinterest.com/pin/1/'
    );
  });

  it('surfaces fallback=true for link-only records', async () => {
    mocks.ingestReferenceUrl.mockResolvedValueOnce({
      record: {
        id: 'ref_abc',
        kind: 'embed' as const,
        previewUrl: 'https://plain.example.com/',
        fullUrl: 'https://plain.example.com/',
        attribution: { source: 'generic', url: 'https://plain.example.com/' },
        capturedAt: '2026-04-24T12:00:00.000Z',
      },
      fallback: true,
      providerId: 'generic',
    });

    const { POST } = await import('@/app/api/reference-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/reference-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://plain.example.com/' }),
      })
    );

    const json = (await res.json()) as { ok: boolean; fallback: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.fallback).toBe(true);
  });

  it('returns 400 when url is missing', async () => {
    const { POST } = await import('@/app/api/reference-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/reference-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/url is required/);
    expect(mocks.ingestReferenceUrl).not.toHaveBeenCalled();
  });

  it('translates fetch failures into 400 with ingest_failed code', async () => {
    mocks.ingestReferenceUrl.mockRejectedValueOnce(
      new Error('fetch failed: 404 Not Found')
    );
    const { POST } = await import('@/app/api/reference-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/reference-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://missing.example.com/' }),
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code?: string };
    expect(json.code).toBe('ingest_failed');
  });

  it('translates invalid URL errors into 400', async () => {
    mocks.ingestReferenceUrl.mockRejectedValueOnce(
      new Error('invalid URL: ::::')
    );
    const { POST } = await import('@/app/api/reference-ingest/route');
    const res = await POST(
      new Request('http://localhost/api/reference-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: '::::' }),
      })
    );
    expect(res.status).toBe(400);
  });

});
