import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReplicateSplatProvider } from './replicate';

describe('replicate splat adapter · contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes a splatter-image prediction into a .ply splat asset', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pred_1',
            status: 'succeeded',
            output: {
              splat: 'https://cdn.example.com/out.ply',
              preview: 'https://cdn.example.com/preview.mp4',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const provider = createReplicateSplatProvider('test-token');
    const result = await provider.generate(
      {
        sourceUrl: 'https://cdn.example.com/source.png',
        mode: 'splat-from-image',
        size: { w: 512, h: 512 },
      },
      { model: 'jd7h/splatter-image' }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.replicate.com/v1/predictions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
    expect(result).toMatchObject({
      provider: 'replicate-splat',
      model: 'jd7h/splatter-image',
      splatUrl: 'https://cdn.example.com/out.ply',
      previewUrl: 'https://cdn.example.com/preview.mp4',
      format: 'ply',
    });
  });

  it('throws a typed error when the prediction fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'pred_2',
          status: 'failed',
          error: 'out of memory',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const provider = createReplicateSplatProvider('test-token');
    await expect(
      provider.generate(
        {
          sourceUrl: 'https://cdn.example.com/source.png',
          mode: 'splat-from-image',
        },
        { model: 'jd7h/splatter-image' }
      )
    ).rejects.toThrow(/out of memory/);
  });
});
