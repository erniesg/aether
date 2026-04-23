import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReplicateSegmentationProvider } from './replicate';

describe('sam2 replicate adapter · contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes birefnet cutout output into mask and alpha urls', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pred_1',
            status: 'succeeded',
            output: {
              combined_mask: 'https://cdn.example.com/cutout.png',
              individual_masks: [
                'https://cdn.example.com/region-1.png',
                'https://cdn.example.com/region-2.png',
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const provider = createReplicateSegmentationProvider('test-token');
    const result = await provider.segment(
      {
        sourceUrl: 'https://cdn.example.com/source.png',
        mode: 'removebg',
        size: { w: 800, h: 600 },
      },
      { model: 'men1scus/birefnet' }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.replicate.com/v1/predictions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
        body: JSON.stringify({
          version: 'f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7',
          input: {
            image: 'https://cdn.example.com/source.png',
          },
        }),
      })
    );
    expect(result).toMatchObject({
      provider: 'sam2',
      model: 'men1scus/birefnet',
      maskUrl: 'https://cdn.example.com/cutout.png',
      alphaCutoutUrl: 'https://cdn.example.com/cutout.png',
      width: 800,
      height: 600,
      regions: [
        {
          id: 'region-1',
          maskUrl: 'https://cdn.example.com/region-1.png',
          alphaCutoutUrl: 'https://cdn.example.com/region-1.png',
        },
        {
          id: 'region-2',
          maskUrl: 'https://cdn.example.com/region-2.png',
          alphaCutoutUrl: 'https://cdn.example.com/region-2.png',
        },
      ],
    });
  });
});
