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

  it("applies composition textStrategy='none' — populates input.negative_prompt", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'pred-no-text',
        status: 'succeeded',
        output: 'https://cdn.replicate.delivery/clean.webp',
      })
    );
    const provider = createReplicateProvider('r8_test');
    await provider.generate(
      { prompt: 'sunset cityscape', composition: { textStrategy: 'none' } },
      { model: 'black-forest-labs/flux-1.1-pro' }
    );

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.input.prompt).toBe('sunset cityscape');
    expect(typeof body.input.negative_prompt).toBe('string');
    expect(body.input.negative_prompt.toLowerCase()).toContain('text');
    expect(body.input.negative_prompt.toLowerCase()).toContain('typography');
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

describe('replicate adapter · edit contract', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists a fill-capable model', () => {
    const provider = createReplicateProvider('r8_test');
    expect(provider.listModels()).toContain('black-forest-labs/flux-fill-pro');
  });

  it('edit throws when token missing, without calling fetch', async () => {
    const provider = createReplicateProvider(undefined);
    const err = await provider
      .edit!(
        { prompt: 'fill', sourceUrl: 'https://cdn.example/src.png' },
        { model: 'black-forest-labs/flux-fill-pro' }
      )
      .catch((e) => e);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes image + mask URLs straight through (white = edit region)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'pred-edit',
        status: 'succeeded',
        output: 'https://replicate.delivery/out.png',
      })
    );
    const provider = createReplicateProvider('r8_test');
    const result = await provider.edit!(
      {
        prompt: 'remove the subject and fill the background naturally',
        sourceUrl: 'https://cdn.example/src.png',
        maskUrl: 'https://cdn.example/mask.png',
      },
      { model: 'black-forest-labs/flux-fill-pro' }
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-fill-pro/predictions'
    );
    const body = JSON.parse(init?.body as string);
    expect(body.input.image).toBe('https://cdn.example/src.png');
    expect(body.input.mask).toBe('https://cdn.example/mask.png');
    expect(body.input.prompt).toMatch(/fill the background/);

    expect(result.provider).toBe('replicate');
    expect(result.images[0]?.url).toBe('https://replicate.delivery/out.png');
  });

  it('edit surfaces a failed prediction as ImageGenError', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'pred-edit', status: 'failed', error: 'NSFW detected' })
    );
    const provider = createReplicateProvider('r8_test');
    await expect(
      provider.edit!(
        { prompt: 'fill', sourceUrl: 'https://cdn.example/src.png' },
        { model: 'black-forest-labs/flux-fill-pro' }
      )
    ).rejects.toThrow(/NSFW detected/);
  });
});
