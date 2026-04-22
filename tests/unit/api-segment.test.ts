import { afterEach, describe, expect, it, vi } from 'vitest';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

const mocks = vi.hoisted(() => ({
  segment: vi.fn(),
  listProviders: vi.fn(() => [
    {
      id: 'sam3',
      displayName: 'SAM 3 via Modal',
      models: ['sam3.1'],
      supportsTextPrompt: true,
      available: true,
    },
    {
      id: 'sam2',
      displayName: 'SAM 2 via Replicate',
      models: ['meta/sam-2'],
      supportsTextPrompt: false,
      available: false,
      unavailableReason: 'Replicate SAM 2 is not connected',
    },
  ]),
  resolveProvider: vi.fn(() => ({
    id: 'sam3',
    displayName: 'SAM 3 via Modal',
    supportsTextPrompt: true,
    getAvailabilityIssue: () => undefined,
    listModels: () => ['sam3.1'],
    segment: mocks.segment,
  })),
}));

vi.mock('@/lib/providers/segmentation/registry', () => ({
  KNOWN_SEGMENTATION_PROVIDER_IDS: ['sam3', 'sam2'],
  listSegmentationProviders: mocks.listProviders,
  resolveSegmentationProvider: mocks.resolveProvider,
}));

describe('/api/segment', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns a mask preview and composed cutout data url', async () => {
    mocks.segment.mockResolvedValue({
      provider: 'sam3',
      model: 'sam3.1',
      maskUrl: TINY_PNG,
      width: 1024,
      height: 1024,
      raw: { ok: true },
    });

    const { POST } = await import('@/app/api/segment/route');
    const response = await POST(
      new Request('http://localhost/api/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: TINY_PNG,
          mode: 'removebg',
          prompt: 'main subject',
          width: 1024,
          height: 1024,
        }),
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.provider).toEqual({ id: 'sam3', model: 'sam3.1' });
    expect(json.preview.maskDataUrl).toBe(TINY_PNG);
    expect(json.preview.cutoutDataUrl).toContain('data:image/svg+xml');
    expect(json.preview.sourceDataUrl).toBe(TINY_PNG);
  });

  it('returns provider availability for both known providers', async () => {
    const { GET } = await import('@/app/api/segment/route');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      providers: mocks.listProviders(),
    });
  });

  it('rejects invalid mode values', async () => {
    const { POST } = await import('@/app/api/segment/route');
    const response = await POST(
      new Request('http://localhost/api/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: TINY_PNG,
          mode: 'oops',
          width: 1024,
          height: 1024,
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: 'mode must be one of removebg, cutout, unmask',
    });
  });

  it('rejects invalid provider ids', async () => {
    const { POST } = await import('@/app/api/segment/route');
    const response = await POST(
      new Request('http://localhost/api/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'oops',
          sourceUrl: TINY_PNG,
          mode: 'removebg',
          width: 1024,
          height: 1024,
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: 'providerId must be one of sam3, sam2',
    });
  });

  it('returns provider status details when segmentation is unavailable', async () => {
    const { SegmentationUnavailableError } = await import(
      '@/lib/providers/segmentation/types'
    );

    mocks.resolveProvider.mockImplementation(() => {
      throw new SegmentationUnavailableError(
        'sam3',
        'SAM 3 is not connected'
      );
    });

    const { POST } = await import('@/app/api/segment/route');
    const response = await POST(
      new Request('http://localhost/api/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'sam3',
          sourceUrl: TINY_PNG,
          mode: 'removebg',
          width: 1024,
          height: 1024,
        }),
      })
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'provider_unavailable',
      providers: mocks.listProviders(),
    });
  });
});
