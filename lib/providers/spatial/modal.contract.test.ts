import { afterEach, describe, expect, it, vi } from 'vitest';
import { createModalSplatProvider } from './modal';

describe('modal splat adapter · contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes a modal JSON response', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            splat_url: 'https://splat.example.com/out.splat',
            preview_url: 'https://splat.example.com/preview.gif',
            format: 'splat',
            gaussian_count: 250_000,
            model: 'splat-v1',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const provider = createModalSplatProvider(
      'https://splat.example.com/infer',
      'splat-token'
    );
    const result = await provider.generate(
      {
        sourceUrl: 'https://cdn.example.com/source.png',
        mode: 'splat-from-image',
        prompt: 'ceramic mug, turntable, 360°',
        size: { w: 1024, h: 1024 },
      },
      { model: 'splat-v1' }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://splat.example.com/infer',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer splat-token',
        }),
      })
    );
    expect(result).toMatchObject({
      provider: 'modal-splat',
      model: 'splat-v1',
      splatUrl: 'https://splat.example.com/out.splat',
      previewUrl: 'https://splat.example.com/preview.gif',
      format: 'splat',
      gaussianCount: 250_000,
    });
  });
});
