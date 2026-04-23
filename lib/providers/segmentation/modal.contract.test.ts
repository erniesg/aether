import { afterEach, describe, expect, it, vi } from 'vitest';
import { createModalSam3Provider } from './modal';

describe('sam3 modal adapter · contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes a modal JSON response', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            mask_url: 'https://sam3.example.com/mask.png',
            alpha_cutout_url: 'https://sam3.example.com/cutout.png',
            background_plate_url: 'https://sam3.example.com/plate.png',
            bbox: { x: 10, y: 20, w: 300, h: 420 },
            regions: [
              {
                id: 'region-1',
                mask_url: 'https://sam3.example.com/region-1-mask.png',
                bbox: { x: 12, y: 24, w: 48, h: 60 },
                score: 0.94,
              },
            ],
            width: 1024,
            height: 1280,
            model: 'sam3.1',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const provider = createModalSam3Provider(
      'https://sam3.example.com/segment',
      'sam3-token'
    );
    const result = await provider.segment(
      {
        sourceUrl: 'https://cdn.example.com/source.png',
        mode: 'cutout',
        prompt: 'person holding the bottle',
        size: { w: 1024, h: 1280 },
      },
      { model: 'sam3.1' }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://sam3.example.com/segment',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sam3-token',
        }),
      })
    );
    expect(result).toMatchObject({
      provider: 'sam3',
      model: 'sam3.1',
      maskUrl: 'https://sam3.example.com/mask.png',
      alphaCutoutUrl: 'https://sam3.example.com/cutout.png',
      backgroundPlateUrl: 'https://sam3.example.com/plate.png',
      bbox: { x: 10, y: 20, w: 300, h: 420 },
      width: 1024,
      height: 1280,
      regions: [
        {
          id: 'region-1',
          maskUrl: 'https://sam3.example.com/region-1-mask.png',
          bbox: { x: 12, y: 24, w: 48, h: 60 },
          score: 0.94,
        },
      ],
    });
  });
});
