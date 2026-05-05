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

function imageResponse(body = 'image-bytes', type = 'image/png'): Response {
  return new Response(Buffer.from(body), {
    status: 200,
    headers: { 'Content-Type': type },
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
    expect(result.model).toBe('black-forest-labs/flux-1.1-pro');
    expect(result.images).toEqual([
      expect.objectContaining({
        url: 'https://cdn.replicate.delivery/out.webp',
        mimeType: 'image/webp',
      }),
    ]);
  });

  it('defaults to Replicate-hosted Seedream 5 Lite and passes reference images', async () => {
    fetchMock
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'pred-seedream',
          status: 'succeeded',
          output: ['https://cdn.replicate.delivery/seedream.png'],
        })
      );
    const provider = createReplicateProvider('r8_test');
    const result = await provider.generate(
      {
        prompt: 'launch campaign visual',
        aspectRatio: '4:5',
        refs: [{ url: 'https://assets.example/ref-a.png' }],
      },
      { model: '' }
    );

    const [refUrl, refInit] = fetchMock.mock.calls[0]!;
    expect(refUrl).toBe('https://assets.example/ref-a.png');
    expect((refInit?.headers as Record<string, string>).Accept).toBe('image/*');
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(
      'https://api.replicate.com/v1/models/bytedance/seedream-5-lite/predictions'
    );
    const body = JSON.parse(init?.body as string);
    expect(body.input).toMatchObject({
      prompt: expect.stringContaining('launch campaign visual'),
      size: '2K',
      aspect_ratio: '3:4',
      sequential_image_generation: 'disabled',
      max_images: 1,
      output_format: 'png',
    });
    expect(body.input.image_input).toEqual([
      expect.stringMatching(/^data:image\/png;base64,/),
    ]);
    expect(result.model).toBe('bytedance/seedream-5-lite');
    expect(result.images[0]).toMatchObject({
      url: 'https://cdn.replicate.delivery/seedream.png',
      mimeType: 'image/png',
    });
  });

  it('aliases nano banana pro and uses its image_input schema', async () => {
    fetchMock
      .mockResolvedValueOnce(imageResponse('jpeg-bytes', 'image/jpeg'))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'pred-nano-pro',
          status: 'succeeded',
          output: 'https://cdn.replicate.delivery/nano.jpg',
        })
      );
    const provider = createReplicateProvider('r8_test');
    await provider.generate(
      {
        prompt: 'product poster',
        aspectRatio: '9:16',
        refs: [{ url: 'https://assets.example/product.png' }],
        composition: { textStrategy: 'none' },
      },
      { model: 'nano banana pro' }
    );

    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(
      'https://api.replicate.com/v1/models/google/nano-banana-pro/predictions'
    );
    const body = JSON.parse(init?.body as string);
    expect(body.input).toMatchObject({
      aspect_ratio: '9:16',
      resolution: '2K',
      output_format: 'jpg',
      safety_filter_level: 'block_only_high',
    });
    expect(body.input.image_input).toEqual([
      expect.stringMatching(/^data:image\/jpeg;base64,/),
    ]);
    expect(body.input.prompt).toContain('Avoid:');
  });

  it('uses input_images for Replicate-hosted GPT Image 2', async () => {
    fetchMock
      .mockResolvedValueOnce(imageResponse('webp-bytes', 'image/webp'))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'pred-gpt-image-2',
          status: 'succeeded',
          output: ['https://cdn.replicate.delivery/gpt.webp'],
        })
      );
    const provider = createReplicateProvider('r8_test');
    await provider.generate(
      {
        prompt: 'brand scene',
        aspectRatio: '16:9',
        refs: [{ url: 'https://assets.example/ref.webp' }],
        n: 2,
      },
      { model: 'gpt-image-2' }
    );

    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(
      'https://api.replicate.com/v1/models/openai/gpt-image-2/predictions'
    );
    const body = JSON.parse(init?.body as string);
    expect(body.input).toMatchObject({
      aspect_ratio: '3:2',
      number_of_images: 2,
      quality: 'auto',
      output_format: 'webp',
      moderation: 'auto',
    });
    expect(body.input.input_images).toEqual([
      expect.stringMatching(/^data:image\/webp;base64,/),
    ]);
  });

  it('drops localhost references before sending a cloud Replicate request', async () => {
    fetchMock
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'pred-local-ref',
          status: 'succeeded',
          output: ['https://cdn.replicate.delivery/out.png'],
        })
      );
    const provider = createReplicateProvider('r8_test');
    await provider.generate(
      {
        prompt: 'product scene',
        refs: [
          { url: 'http://127.0.0.1:3210/api/storage/local-ref' },
          { url: 'https://assets.example/ref.png' },
        ],
      },
      { model: 'bytedance/seedream-5-lite' }
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://assets.example/ref.png');
    const [, init] = fetchMock.mock.calls[1]!;
    const body = JSON.parse(init?.body as string);
    expect(body.input.image_input).toEqual([
      expect.stringMatching(/^data:image\/png;base64,/),
    ]);
  });

  it('skips remote references that fail server-side fetch and still generates', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'pred-skipped-ref',
          status: 'succeeded',
          output: ['https://cdn.replicate.delivery/out.png'],
        })
      );
    const provider = createReplicateProvider('r8_test');
    await provider.generate(
      {
        prompt: 'product scene',
        refs: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/b/b6/Sleepingpoduni.png' }],
      },
      { model: 'bytedance/seedream-5-lite' }
    );

    const [, init] = fetchMock.mock.calls[1]!;
    const body = JSON.parse(init?.body as string);
    expect(body.input.image_input).toEqual([]);
  });

  it('retries without references when Replicate rejects reference input validation', async () => {
    fetchMock
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        new Response(
          'Input validation error: 403 Client Error: Forbidden for url: https://assets.example/ref.png',
          { status: 422 }
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'pred-retry-no-ref',
          status: 'succeeded',
          output: ['https://cdn.replicate.delivery/out.png'],
        })
      );
    const provider = createReplicateProvider('r8_test');
    await provider.generate(
      {
        prompt: 'product scene',
        refs: [{ url: 'https://assets.example/ref.png' }],
      },
      { model: 'bytedance/seedream-5-lite' }
    );

    const firstBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    const retryBody = JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string);
    expect(firstBody.input.image_input).toEqual([
      expect.stringMatching(/^data:image\/png;base64,/),
    ]);
    expect(retryBody.input.image_input).toEqual([]);
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
