import { afterEach, describe, expect, it, vi } from 'vitest';
import { createModalSplatProvider } from './modal';
import { SpatialBuildError } from './types';

const originalFetch = globalThis.fetch;

function stubFetch(handler: (input: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = vi.fn(handler) as unknown as typeof fetch;
}

describe('modal spatial provider', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('is unavailable without SPATIAL_MODAL_URL', () => {
    const provider = createModalSplatProvider(undefined);
    expect(provider.isAvailable()).toBe(false);
    expect(provider.getAvailabilityIssue()).toMatch(/not connected/i);
  });

  it('forwards the request body and maps the response', async () => {
    let capturedBody: unknown;
    stubFetch(async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body ?? '{}'));
      return new Response(
        JSON.stringify({
          sceneUrl: 'https://modal.example/out.splat',
          previewImageUrl: 'https://modal.example/preview.png',
          sceneFormat: 'splat',
          gaussianCount: 12345,
          model: 'custom-v2',
          latencyMs: 4200,
        }),
        { status: 200 }
      );
    });

    const provider = createModalSplatProvider('https://modal.example', 'bearer-xyz');
    const result = await provider.build(
      {
        sourceUrl: 'https://img.example/photo.jpg',
        width: 512,
        height: 768,
        prompt: 'hero splat',
        format: 'gaussian-splat',
        quality: 'standard',
      },
      { model: 'custom-v2' }
    );

    expect(capturedBody).toMatchObject({
      model: 'custom-v2',
      image_url: 'https://img.example/photo.jpg',
      mode: 'splat-from-image',
      text_prompt: 'hero splat',
      format: 'gaussian-splat',
      quality: 'standard',
      width: 512,
      height: 768,
    });
    expect(result.provider).toBe('modal-splat');
    expect(result.sceneUrl).toBe('https://modal.example/out.splat');
    expect(result.sceneFormat).toBe('splat');
    expect(result.previewImageUrl).toBe('https://modal.example/preview.png');
    expect(result.model).toBe('custom-v2');
    expect(result.latencyMs).toBe(4200);
    expect(result.gaussianCount).toBe(12345);
  });

  it('raises SpatialBuildError when the endpoint returns a non-2xx', async () => {
    stubFetch(async () => new Response('boom', { status: 500 }));
    const provider = createModalSplatProvider('https://modal.example');
    await expect(
      provider.build(
        {
          sourceUrl: 'https://img.example/photo.jpg',
          width: 128,
          height: 128,
          format: 'gaussian-splat',
        },
        { model: 'splat-v1' }
      )
    ).rejects.toBeInstanceOf(SpatialBuildError);
  });
});
