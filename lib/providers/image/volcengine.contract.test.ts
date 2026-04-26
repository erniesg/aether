import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVolcengineProvider } from './volcengine';
import { ImageGenError } from './types';

const ENDPOINT =
  'https://ark.cn-beijing.volces.com/api/v3/images/generations';

function jsonResponse(body: unknown, init: Partial<ResponseInit> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('volcengine (Seedream) adapter · contract', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isAvailable is false and generate throws when API key missing', async () => {
    const provider = createVolcengineProvider(undefined);
    expect(provider.isAvailable()).toBe(false);
    const err = await provider
      .generate({ prompt: 'hi' }, { model: 'doubao-seedream-3-0-t2i-250415' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(String(err)).toMatch(/VOLCENGINE_ARK_API_KEY not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the Ark endpoint with bearer header and Seedream body shape', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ url: 'https://volc.cdn/out.png' }] })
    );
    const provider = createVolcengineProvider('ark_test');
    const result = await provider.generate(
      { prompt: 'a tiger', aspectRatio: '16:9', seed: 7 },
      { model: 'doubao-seedream-3-0-t2i-250415' }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(ENDPOINT);
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ark_test');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe('doubao-seedream-3-0-t2i-250415');
    expect(body.prompt).toBe('a tiger');
    expect(body.size).toBe('2048x1152');
    expect(body.seed).toBe(7);
    expect(body.response_format).toBe('url');
    expect(body.watermark).toBe(false);
    expect(body.guidance_scale).toBe(3);

    expect(result.provider).toBe('volcengine');
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.url).toBe('https://volc.cdn/out.png');
    expect(result.images[0]?.width).toBe(2048);
    expect(result.images[0]?.height).toBe(1152);
  });

  it('returns a data URL when Ark returns b64_json only', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ b64_json: 'YWJj' }] })
    );
    const provider = createVolcengineProvider('ark_test');
    const result = await provider.generate(
      { prompt: 'b64' },
      { model: 'doubao-seedream-3-0-t2i-250415' }
    );
    expect(result.images[0]?.url).toBe('data:image/png;base64,YWJj');
    expect(result.images[0]?.dataUrl).toBe('data:image/png;base64,YWJj');
  });

  it("applies composition textStrategy='none' — populates native negative_prompt field", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ url: 'https://volc.cdn/clean.png' }] })
    );
    const provider = createVolcengineProvider('ark_test');
    await provider.generate(
      { prompt: 'sunset cityscape', composition: { textStrategy: 'none' } },
      { model: 'doubao-seedream-3-0-t2i-250415' }
    );

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.prompt).toBe('sunset cityscape');
    expect(typeof body.negative_prompt).toBe('string');
    expect(body.negative_prompt.toLowerCase()).toContain('text');
    expect(body.negative_prompt.toLowerCase()).toContain('typography');
  });

  it('throws ImageGenError on non-200 response with status + body', async () => {
    fetchMock.mockResolvedValue(new Response('unauthorized', { status: 401 }));
    const provider = createVolcengineProvider('ark_test');
    const err = await provider
      .generate({ prompt: 'x' }, { model: 'doubao-seedream-3-0-t2i-250415' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(String(err)).toMatch(/401/);
    expect(String(err)).toMatch(/unauthorized/);
  });

  it('throws when data array is empty', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    const provider = createVolcengineProvider('ark_test');
    await expect(
      provider.generate({ prompt: 'x' }, { model: 'doubao-seedream-3-0-t2i-250415' })
    ).rejects.toThrow(/no images returned/);
  });
});
