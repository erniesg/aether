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
      supportsPointPrompt: true,
      supportsBoxPrompt: true,
      available: true,
    },
    {
      id: 'sam2',
      displayName: 'SAM 2 via Replicate',
      models: ['meta/sam-2'],
      supportsTextPrompt: false,
      supportsPointPrompt: false,
      supportsBoxPrompt: false,
      available: false,
      unavailableReason: 'Replicate SAM 2 is not connected',
    },
  ]),
  resolveProvider: vi.fn(() => ({
    id: 'sam3',
    displayName: 'SAM 3 via Modal',
    supportsTextPrompt: true,
    supportsPointPrompt: true,
    supportsBoxPrompt: true,
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

describe('/api/segment (validation + provider listing)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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

  it('rejects invalid mode values with a JSON 400', async () => {
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
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({
      ok: false,
      error: 'mode must be one of removebg, cutout, unmask',
    });
  });

  it('rejects invalid provider ids with a JSON 400', async () => {
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
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({
      ok: false,
      error: 'providerId must be one of sam3, sam2',
    });
  });

  it('rejects missing sourceUrl with a JSON 400', async () => {
    const { POST } = await import('@/app/api/segment/route');
    const response = await POST(
      new Request('http://localhost/api/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'removebg',
          width: 1024,
          height: 1024,
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: 'sourceUrl is required',
    });
  });
});
