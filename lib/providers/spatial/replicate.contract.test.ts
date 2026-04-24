import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReplicateSplatProvider } from './replicate';
import { SpatialBuildError } from './types';

const originalFetch = globalThis.fetch;

function stubFetch(handler: (input: string, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn(handler);
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('replicate spatial provider', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('reports unavailable without REPLICATE_API_TOKEN', () => {
    const provider = createReplicateSplatProvider(undefined);
    expect(provider.isAvailable()).toBe(false);
    expect(provider.getAvailabilityIssue()).toMatch(/not connected/i);
  });

  it('posts to replicate and returns a sceneUrl when the prediction succeeds inline', async () => {
    const fetchMock = stubFetch(async (input) => {
      if (typeof input === 'string' && input.endsWith('/predictions')) {
        return new Response(
          JSON.stringify({
            id: 'pred-1',
            status: 'succeeded',
            output: {
              splat: 'https://replicate.delivery/scene.ply',
              preview: 'https://replicate.delivery/preview.png',
              gaussian_count: 50000,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`unexpected fetch: ${String(input)}`);
    });

    const provider = createReplicateSplatProvider('sk-test', 'version-xyz');
    const result = await provider.build(
      {
        sourceUrl: 'https://img.example/photo.jpg',
        width: 512,
        height: 512,
        format: 'gaussian-splat',
        quality: 'draft',
      },
      { model: provider.listModels()[0] }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('replicate-splat');
    expect(result.sceneUrl).toBe('https://replicate.delivery/scene.ply');
    expect(result.sceneFormat).toBe('ply');
    expect(result.gaussianCount).toBe(50000);
    expect(result.previewImageUrl).toBe('https://replicate.delivery/preview.png');
    expect(result.sceneSpec.pointCount).toBe(50000);
  });

  it('falls back to a local preview data url when the provider omits one', async () => {
    stubFetch(async () =>
      new Response(
        JSON.stringify({
          id: 'pred-2',
          status: 'succeeded',
          output: 'https://replicate.delivery/bare.ksplat',
        }),
        { status: 200 }
      )
    );

    const provider = createReplicateSplatProvider('sk-test');
    const result = await provider.build(
      {
        sourceUrl: 'https://img.example/photo.jpg',
        width: 256,
        height: 256,
        format: 'gaussian-splat',
      },
      { model: provider.listModels()[0] }
    );

    expect(result.sceneUrl).toBe('https://replicate.delivery/bare.ksplat');
    expect(result.sceneFormat).toBe('ksplat');
    expect(result.previewImageUrl.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('surfaces SpatialBuildError when the create call fails', async () => {
    stubFetch(async () => new Response('rate limited', { status: 429 }));
    const provider = createReplicateSplatProvider('sk-test');

    await expect(
      provider.build(
        {
          sourceUrl: 'https://img.example/photo.jpg',
          width: 256,
          height: 256,
          format: 'gaussian-splat',
        },
        { model: provider.listModels()[0] }
      )
    ).rejects.toBeInstanceOf(SpatialBuildError);
  });
});
