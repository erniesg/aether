import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderUnavailableError } from '@/lib/providers/image/types';

const mocks = vi.hoisted(() => ({
  resolveEditProvider: vi.fn(),
}));

vi.mock('@/lib/providers/image/registry', () => ({
  resolveEditProvider: mocks.resolveEditProvider,
}));

function editRequest(body: unknown): Request {
  return new Request('http://localhost/api/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/edit', () => {
  beforeEach(() => {
    mocks.resolveEditProvider.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 400 when sourceUrl is missing', async () => {
    const { POST } = await import('@/app/api/edit/route');
    const res = await POST(editRequest({ prompt: 'fill' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/sourceUrl/);
  });

  it('returns 400 when prompt is missing', async () => {
    const { POST } = await import('@/app/api/edit/route');
    const res = await POST(editRequest({ sourceUrl: 'https://cdn.example/src.png' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/prompt/);
  });

  it('routes to the edit provider and returns the first image', async () => {
    const edit = vi.fn().mockResolvedValue({
      provider: 'replicate',
      model: 'black-forest-labs/flux-fill-pro',
      latencyMs: 1200,
      images: [
        { url: 'https://replicate.delivery/bg.png', mimeType: 'image/webp', width: 1024, height: 1024 },
      ],
    });
    mocks.resolveEditProvider.mockReturnValue({
      id: 'replicate',
      displayName: 'Replicate',
      isAvailable: () => true,
      listModels: () => ['black-forest-labs/flux-fill-pro'],
      generate: vi.fn(),
      edit,
    });

    const { POST } = await import('@/app/api/edit/route');
    const res = await POST(
      editRequest({
        sourceUrl: 'https://cdn.example/src.png',
        maskUrl: 'data:image/png;base64,bWFzaw==',
        prompt: 'remove the subject and fill the background',
        width: 1024,
        height: 1024,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.image.url).toBe('https://replicate.delivery/bg.png');
    expect(json.provider).toEqual({ id: 'replicate', model: 'black-forest-labs/flux-fill-pro' });

    expect(edit).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://cdn.example/src.png',
        maskUrl: 'data:image/png;base64,bWFzaw==',
        prompt: 'remove the subject and fill the background',
        size: { w: 1024, h: 1024 },
      }),
      expect.objectContaining({ model: expect.any(String) })
    );
  });

  it('returns 503 when no edit-capable provider is available', async () => {
    mocks.resolveEditProvider.mockImplementation(() => {
      throw new ProviderUnavailableError('any', 'no edit-capable provider');
    });
    const { POST } = await import('@/app/api/edit/route');
    const res = await POST(
      editRequest({ sourceUrl: 'https://cdn.example/src.png', prompt: 'fill' })
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe('provider_unavailable');
  });
});
