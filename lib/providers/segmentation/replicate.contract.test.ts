import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReplicateSegmentationProvider } from './replicate';

describe('sam2 replicate adapter · contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes combined_mask output', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pred_1',
            status: 'succeeded',
            output: {
              combined_mask: 'https://cdn.example.com/mask.png',
              individual_masks: ['https://cdn.example.com/m1.png'],
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
      { model: 'meta/sam-2' }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.replicate.com/v1/models/meta/sam-2/predictions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
    expect(result).toMatchObject({
      provider: 'sam2',
      model: 'meta/sam-2',
      maskUrl: 'https://cdn.example.com/mask.png',
      width: 800,
      height: 600,
    });
  });
});
