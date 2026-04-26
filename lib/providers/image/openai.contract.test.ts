import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAIProvider } from './openai';
import { ImageGenError } from './types';

const GENERATIONS_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const EDITS_ENDPOINT = 'https://api.openai.com/v1/images/edits';

function jsonResponse(body: unknown, init: Partial<ResponseInit> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('openai adapter · contract', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isAvailable is false and generate throws when API key missing', async () => {
    const provider = createOpenAIProvider(undefined);
    expect(provider.isAvailable()).toBe(false);
    const err = await provider
      .generate({ prompt: 'hi' }, { model: 'gpt-image-1' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(String(err)).toMatch(/OPENAI_API_KEY not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the images endpoint with auth + correct body, parses response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ url: 'https://example.com/x.png' }] })
    );
    const provider = createOpenAIProvider('sk-test');
    const result = await provider.generate(
      { prompt: 'a cat', aspectRatio: '1:1' },
      { model: 'gpt-image-1' }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(GENERATIONS_ENDPOINT);
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe('gpt-image-1');
    expect(body.prompt).toBe('a cat');
    expect(body.n).toBe(1);
    expect(body.size).toBe('1024x1024');
    expect(body.quality).toBe('high');

    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-image-1');
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      url: 'https://example.com/x.png',
      width: 1024,
      height: 1024,
      mimeType: 'image/png',
    });
    expect(typeof result.latencyMs).toBe('number');
  });

  it('returns a data URL when provider returns b64_json only', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ b64_json: 'aGVsbG8=' }] })
    );
    const provider = createOpenAIProvider('sk-test');
    const result = await provider.generate(
      { prompt: 'a dog' },
      { model: 'gpt-image-1' }
    );
    expect(result.images[0]?.url).toBe('data:image/png;base64,aGVsbG8=');
    expect(result.images[0]?.dataUrl).toBe('data:image/png;base64,aGVsbG8=');
  });

  it('maps portrait aspect ratios to OpenAI-supported portrait size', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ url: 'https://example.com/p.png' }] })
    );
    const provider = createOpenAIProvider('sk-test');
    const result = await provider.generate(
      { prompt: 'a poster', aspectRatio: '4:5' },
      { model: 'gpt-image-1' }
    );

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.size).toBe('1024x1536');
    expect(result.images[0]).toMatchObject({ width: 1024, height: 1536 });
  });

  it('maps landscape aspect ratios to OpenAI-supported landscape size', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ url: 'https://example.com/l.png' }] })
    );
    const provider = createOpenAIProvider('sk-test');
    const result = await provider.generate(
      { prompt: 'a banner', aspectRatio: '16:9' },
      { model: 'gpt-image-1' }
    );

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.size).toBe('1536x1024');
    expect(result.images[0]).toMatchObject({ width: 1536, height: 1024 });
  });

  it('throws ImageGenError on non-200 response with status + body text', async () => {
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
    const provider = createOpenAIProvider('sk-test');
    const err = await provider
      .generate({ prompt: 'a fish' }, { model: 'gpt-image-1' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(String(err)).toMatch(/429/);
    expect(String(err)).toMatch(/rate limited/);
  });

  it('wraps fetch aborts as ImageGenError instead of leaking a raw AbortError', async () => {
    fetchMock.mockRejectedValueOnce(
      new DOMException('This operation was aborted', 'AbortError')
    );
    const provider = createOpenAIProvider('sk-test');
    const err = await provider
      .generate({ prompt: 'slow image' }, { model: 'gpt-image-1' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ImageGenError);
    // Default timeout is 240s; OPENAI_IMAGE_TIMEOUT_MS env can override.
    expect(String(err)).toMatch(/timed out after \d+s/);
  });

  it('throws ImageGenError when response has no images', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    const provider = createOpenAIProvider('sk-test');
    await expect(
      provider.generate({ prompt: 'empty' }, { model: 'gpt-image-1' })
    ).rejects.toThrow(/no images returned/);
  });

  it('ignores non-data-url refs and stays on the plain generations endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ url: 'https://example.com/y.png' }] })
    );
    const provider = createOpenAIProvider('sk-test');
    const result = await provider.generate(
      {
        prompt: 'a bottle',
        refs: [{ url: 'https://example.com/ref.png' }],
        aspectRatio: '4:5',
      },
      { model: 'gpt-image-1' }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(GENERATIONS_ENDPOINT);
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-test',
      'Content-Type': 'application/json',
    });
    expect(result.images[0]?.url).toBe('https://example.com/y.png');
  });

  it('uses the edits endpoint when refs are base64 data URLs', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ url: 'https://example.com/edit.png' }] })
    );
    const provider = createOpenAIProvider('sk-test');
    const result = await provider.generate(
      {
        prompt: 'a collage',
        refs: [{ url: 'data:image/png;base64,aGVsbG8=' }],
        aspectRatio: '1:1',
      },
      { model: 'gpt-image-1' }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(EDITS_ENDPOINT);
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-test',
    });
    expect(init?.body).toBeInstanceOf(FormData);
    expect(result.images[0]?.url).toBe('https://example.com/edit.png');
  });

  it("applies composition textStrategy='none' — appends a natural-language text-suppression clause", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ url: 'https://example.com/no-text.png' }] })
    );
    const provider = createOpenAIProvider('sk-test');
    await provider.generate(
      { prompt: 'sunset cityscape', composition: { textStrategy: 'none' } },
      { model: 'gpt-image-1' }
    );

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.prompt.toLowerCase()).toContain('sunset cityscape');
    expect(body.prompt.toLowerCase()).toContain('no text');
    expect(body.prompt.toLowerCase()).toContain('no typography');
    expect(body.prompt.toLowerCase()).toContain('pure imagery only');
  });

  it('accepts large data-url refs without regex backtracking or stack overflow', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ url: 'https://example.com/large-edit.png' }] })
    );
    const provider = createOpenAIProvider('sk-test');
    const largePayload = Buffer.from('a'.repeat(300_000)).toString('base64');
    const result = await provider.generate(
      {
        prompt: 'a collage',
        refs: [{ url: `data:image/png;base64,${largePayload}` }],
        aspectRatio: '1:1',
      },
      { model: 'gpt-image-1' }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(EDITS_ENDPOINT);
    expect(init?.body).toBeInstanceOf(FormData);
    expect(result.images[0]?.url).toBe('https://example.com/large-edit.png');
  });
});
