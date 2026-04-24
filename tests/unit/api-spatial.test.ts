import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  listProviders: vi.fn(() => [
    {
      id: 'draft',
      displayName: 'Draft spatial',
      models: ['particle-field-v1'],
      available: true,
      unavailableReason: undefined,
    },
  ]),
  resolveProvider: vi.fn(() => ({
    id: 'draft',
    displayName: 'Draft spatial',
    isAvailable: () => true,
    getAvailabilityIssue: () => undefined,
    listModels: () => ['particle-field-v1'],
    build: mocks.build,
  })),
}));

vi.mock('@/lib/providers/spatial/registry', () => ({
  KNOWN_SPATIAL_PROVIDER_IDS: ['draft'],
  listSpatialProviders: mocks.listProviders,
  resolveSpatialProvider: mocks.resolveProvider,
}));

describe('/api/spatial', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns a draft particle preview for a selected image', async () => {
    mocks.build.mockResolvedValue({
      provider: 'draft',
      model: 'particle-field-v1',
      format: 'particle-field',
      previewImageUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22/%3E',
      sceneSpec: {
        kind: 'particle-field',
        pointCount: 144,
        sourceUrl: 'https://cdn.test/source.png',
      },
      latencyMs: 12,
    });

    const { POST } = await import('@/app/api/spatial/route');
    const response = await POST(
      new Request('http://localhost/api/spatial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: 'https://cdn.test/source.png',
          width: 1024,
          height: 1024,
          format: 'particle-field',
          quality: 'draft',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.build).toHaveBeenCalledWith(
      {
        sourceUrl: 'https://cdn.test/source.png',
        width: 1024,
        height: 1024,
        format: 'particle-field',
        quality: 'draft',
        prompt: undefined,
      },
      { model: 'particle-field-v1' }
    );
    expect(await response.json()).toMatchObject({
      ok: true,
      provider: {
        id: 'draft',
        model: 'particle-field-v1',
      },
      preview: {
        imageDataUrl: expect.stringContaining('data:image/svg+xml'),
      },
      result: {
        format: 'particle-field',
        sceneSpec: {
          kind: 'particle-field',
          pointCount: 144,
        },
      },
    });
  });

  it('returns provider availability metadata', async () => {
    const { GET } = await import('@/app/api/spatial/route');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      providers: mocks.listProviders(),
    });
  });
});
