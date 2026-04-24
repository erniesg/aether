import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReplicateProvider } from './replicate';
import { ImageGenError } from './types';

function jsonResponse(body: unknown, init: Partial<ResponseInit> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('replicate adapter · contract', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalSetTimeout = globalThis.setTimeout;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    // Replace setTimeout *only* on globalThis so the in-adapter `setTimeout(r,
    // 1500)` resolves immediately, keeping the poll test sub-second. Vitest's
    // own scheduler uses its own setTimeout reference which we don't touch.
    const fastSetTimeout = ((handler: TimerHandler) => {
      if (typeof handler === 'function') (handler as () => void)();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    vi.stubGlobal('setTimeout', fastSetTimeout);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // Defensive: restore real setTimeout in case anything held a reference.
    globalThis.setTimeout = originalSetTimeout;
  });

  it('isAvailable is false and generate throws when API token missing', async () => {
    const provider = createReplicateProvider(undefined);
    expect(provider.isAvailable()).toBe(false);
    const err = await provider
      .generate({ prompt: 'hi' }, { model: 'black-forest-labs/flux-1.1-pro' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(String(err)).toMatch(/REPLICATE_API_TOKEN not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates prediction at the model-slug endpoint with correct headers + body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'pred1',
        status: 'succeeded',
        output: 'https://cdn.replicate.delivery/out.webp',
      })
    );
    const provider = createReplicateProvider('r8_test');
    const result = await provider.generate(
      { prompt: 'sunset', aspectRatio: '16:9', seed: 42 },
      { model: 'black-forest-labs/flux-1.1-pro' }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions'
    );
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer r8_test');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Prefer).toBe('wait=60');

    const body = JSON.parse(init?.body as string);
    expect(body.input.prompt).toBe('sunset');
    expect(body.input.aspect_ratio).toBe('16:9');
    expect(body.input.seed).toBe(42);

    expect(result.provider).toBe('replicate');
    expect(result.images).toEqual([
      expect.objectContaining({
        url: 'https://cdn.replicate.delivery/out.webp',
        mimeType: 'image/webp',
      }),
    ]);
  });

  it('polls an initially-starting prediction until it succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'pred2',
          status: 'starting',
          urls: { get: 'https://api.replicate.com/v1/predictions/pred2' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'pred2',
          status: 'processing',
          urls: { get: 'https://api.replicate.com/v1/predictions/pred2' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'pred2',
          status: 'processing',
          urls: { get: 'https://api.replicate.com/v1/predictions/pred2' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'pred2',
          status: 'succeeded',
          output: ['https://cdn.replicate.delivery/a.webp'],
        })
      );

    const provider = createReplicateProvider('r8_test');
    const result = await provider.generate(
      { prompt: 'waves' },
      { model: 'black-forest-labs/flux-1.1-pro' }
    );

    // 1 POST + 3 polls.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const call of fetchMock.mock.calls.slice(1)) {
      expect(String(call[0])).toBe(
        'https://api.replicate.com/v1/predictions/pred2'
      );
      const pollInit = call[1] as RequestInit | undefined;
      const pollHeaders = pollInit?.headers as Record<string, string>;
      expect(pollHeaders.Authorization).toBe('Bearer r8_test');
    }
    expect(result.images[0]?.url).toBe('https://cdn.replicate.delivery/a.webp');
  });

  it('maps Seedream 5 Lite refs and batch options to its model schema', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'seedream1',
        status: 'succeeded',
        output: ['https://cdn.replicate.delivery/seedream.png'],
      })
    );
    const provider = createReplicateProvider('r8_test');
    const result = await provider.generate(
      {
        prompt: 'brand social set',
        refs: [{ url: 'data:image/png;base64,cmVm' }],
        aspectRatio: '9:16',
        size: { w: 1080, h: 1920 },
        n: 3,
      },
      { model: 'bytedance/seedream-5-lite' }
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://api.replicate.com/v1/models/bytedance/seedream-5-lite/predictions'
    );
    const body = JSON.parse(init?.body as string);
    expect(body.input).toMatchObject({
      prompt: 'brand social set',
      image_input: ['data:image/png;base64,cmVm'],
      size: '2K',
      aspect_ratio: '9:16',
      sequential_image_generation: 'auto',
      max_images: 3,
      output_format: 'png',
    });
    expect(result.images[0]).toMatchObject({
      url: 'https://cdn.replicate.delivery/seedream.png',
      mimeType: 'image/png',
      width: 1080,
      height: 1920,
    });
  });

  it('throws ImageGenError when create returns non-200', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('bad input', { status: 422 })
    );
    const provider = createReplicateProvider('r8_test');
    const err = await provider
      .generate({ prompt: 'x' }, { model: 'black-forest-labs/flux-1.1-pro' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(String(err)).toMatch(/422/);
    expect(String(err)).toMatch(/bad input/);
  });

  it('throws if the prediction ends in failed state', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'pred3',
        status: 'failed',
        error: 'CUDA out of memory',
      })
    );
    const provider = createReplicateProvider('r8_test');
    const err = await provider
      .generate({ prompt: 'x' }, { model: 'black-forest-labs/flux-1.1-pro' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(String(err)).toMatch(/CUDA out of memory/);
  });

  it('throws if succeeded but no output urls returned', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'pred4', status: 'succeeded', output: null })
    );
    const provider = createReplicateProvider('r8_test');
    await expect(
      provider.generate({ prompt: 'x' }, { model: 'black-forest-labs/flux-1.1-pro' })
    ).rejects.toThrow(/no output urls/);
  });
});
