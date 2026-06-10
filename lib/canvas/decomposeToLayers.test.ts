import { describe, expect, it, vi } from 'vitest';
import { decomposeToLayers } from './decomposeToLayers';

const SEGMENT_OK = {
  ok: true,
  provider: { id: 'sam3', model: 'sam3.1' },
  preview: {
    sourceDataUrl: 'data:image/png;base64,c3Jj',
    maskDataUrl: 'data:image/png;base64,bWFzaw==',
    cutoutDataUrl: 'data:image/png;base64,Y3V0b3V0',
    width: 1024,
    height: 1280,
    bbox: { x: 100, y: 200, w: 400, h: 600 },
  },
};

const EDIT_OK = {
  ok: true,
  provider: { id: 'replicate', model: 'black-forest-labs/flux-fill-pro' },
  image: { url: 'https://replicate.delivery/bg.png', mimeType: 'image/webp', width: 1024, height: 1280 },
  latencyMs: 900,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('decomposeToLayers', () => {
  it('segments the subject then infills the background behind it', async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValueOnce(jsonResponse(SEGMENT_OK));
    fetcher.mockResolvedValueOnce(jsonResponse(EDIT_OK));

    const result = await decomposeToLayers(
      {
        sourceUrl: 'https://cdn.example/hero.png',
        subjectPrompt: 'the product bottle',
        width: 1024,
        height: 1280,
      },
      { fetcher }
    );

    // 1st call: cutout segmentation
    const [segUrl, segInit] = fetcher.mock.calls[0]!;
    expect(String(segUrl)).toBe('/api/segment');
    const segBody = JSON.parse(segInit?.body as string);
    expect(segBody.mode).toBe('cutout');
    expect(segBody.sourceUrl).toBe('https://cdn.example/hero.png');
    expect(segBody.prompt).toBe('the product bottle');

    // 2nd call: infill with the subject mask (white = edit region)
    const [editUrl, editInit] = fetcher.mock.calls[1]!;
    expect(String(editUrl)).toBe('/api/edit');
    const editBody = JSON.parse(editInit?.body as string);
    expect(editBody.sourceUrl).toBe('https://cdn.example/hero.png');
    expect(editBody.maskUrl).toBe('data:image/png;base64,bWFzaw==');
    expect(editBody.prompt).toMatch(/fill/i);

    expect(result.subject.url).toBe('data:image/png;base64,Y3V0b3V0');
    expect(result.subject.bbox).toEqual({ x: 100, y: 200, w: 400, h: 600 });
    expect(result.background.url).toBe('https://replicate.delivery/bg.png');
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1280);
    expect(result.providers.segmentation.id).toBe('sam3');
    expect(result.providers.edit.id).toBe('replicate');
  });

  it('throws with the segment error when segmentation fails', async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: 'sam3 endpoint unreachable' }, 502)
    );
    await expect(
      decomposeToLayers({ sourceUrl: 'https://cdn.example/hero.png' }, { fetcher })
    ).rejects.toThrow(/sam3 endpoint unreachable/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('throws with the edit error when infill fails', async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValueOnce(jsonResponse(SEGMENT_OK));
    fetcher.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: 'no edit-capable provider', code: 'provider_unavailable' }, 503)
    );
    await expect(
      decomposeToLayers({ sourceUrl: 'https://cdn.example/hero.png' }, { fetcher })
    ).rejects.toThrow(/no edit-capable provider/);
  });
});
