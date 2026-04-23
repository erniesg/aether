import { afterEach, describe, expect, it, vi } from 'vitest';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

const mocks = vi.hoisted(() => ({
  edit: vi.fn(),
  resolveEditableProvider: vi.fn(() => ({
    id: 'openai',
    displayName: 'OpenAI Images',
    listModels: () => ['gpt-image-1'],
    isAvailable: () => true,
    edit: mocks.edit,
  })),
}));

vi.mock('@/lib/providers/image/registry', () => ({
  resolveEditableProvider: mocks.resolveEditableProvider,
}));

describe('/api/segment/plate', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('generates a clean plate from a source image and mask', async () => {
    mocks.edit.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-image-1',
      latencyMs: 420,
      images: [
        {
          url: TINY_PNG,
          mimeType: 'image/png',
          width: 1024,
          height: 1024,
        },
      ],
      raw: { ok: true },
    });

    const { POST } = await import('@/app/api/segment/plate/route');
    const response = await POST(
      new Request('http://localhost/api/segment/plate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: TINY_PNG,
          maskUrl: TINY_PNG,
          width: 1024,
          height: 1024,
        }),
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.provider).toEqual({ id: 'openai', model: 'gpt-image-1' });
    expect(json.plate).toEqual(
      expect.objectContaining({
        dataUrl: TINY_PNG,
        mimeType: 'image/png',
        width: 1024,
        height: 1024,
      })
    );
    expect(mocks.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringMatching(/background/i),
        sourceUrl: TINY_PNG,
        maskUrl: TINY_PNG,
        size: { w: 1024, h: 1024 },
      }),
      { model: 'gpt-image-1' }
    );
  });

  it('rejects requests without source and mask urls', async () => {
    const { POST } = await import('@/app/api/segment/plate/route');
    const response = await POST(
      new Request('http://localhost/api/segment/plate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: 'sourceUrl is required',
    });
  });
});
