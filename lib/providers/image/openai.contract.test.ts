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

  it('passes 4:5 dims through directly (gpt-image-2 honours custom sizes)', async () => {
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
    // dimsFromAspect('4:5') = 1024×1280, both multiples of 16, exact 4:5.
    expect(body.size).toBe('1024x1280');
    expect(result.images[0]).toMatchObject({ width: 1024, height: 1280 });
  });

  it('passes 9:16 dims through directly (no longer collapsed to 2:3)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ url: 'https://example.com/v.png' }] })
    );
    const provider = createOpenAIProvider('sk-test');
    const result = await provider.generate(
      { prompt: 'a vertical', aspectRatio: '9:16' },
      { model: 'gpt-image-2' }
    );

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    // dimsFromAspect('9:16') = 1152×2048, both multiples of 16, exactly 9:16.
    expect(body.size).toBe('1152x2048');
    expect(result.images[0]).toMatchObject({ width: 1152, height: 2048 });
  });

  it('passes 16:9 dims through directly (no longer collapsed to 3:2)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ url: 'https://example.com/l.png' }] })
    );
    const provider = createOpenAIProvider('sk-test');
    const result = await provider.generate(
      { prompt: 'a banner', aspectRatio: '16:9' },
      { model: 'gpt-image-2' }
    );

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    // dimsFromAspect('16:9') = 2048×1152, multiples of 16, exactly 16:9.
    expect(body.size).toBe('2048x1152');
    expect(result.images[0]).toMatchObject({ width: 2048, height: 1152 });
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

  it('https refs are server-side fetched and routed to /v1/images/edits', async () => {
    // Behaviour change (2026-04-27): the previous adapter silently dropped
    // any non-data: ref and fell back to /generations, so heroAnchor +
    // brand refs from the auto-mode lap (Convex storage URLs) never
    // reached /edits. Now any URL ref is fetched server-side and attached
    // as multipart bytes — matches OpenAI's /edits API which doesn't pull
    // URLs.
    const refBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    fetchMock
      // Step 1: ref fetch GET https://example.com/ref.png returns bytes.
      .mockResolvedValueOnce(
        new Response(refBytes.buffer.slice(refBytes.byteOffset, refBytes.byteOffset + refBytes.byteLength), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }) as never
      )
      // Step 2: edits endpoint returns the result.
      .mockResolvedValueOnce(
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // First call: GET the ref bytes.
    const [refUrl, refInit] = fetchMock.mock.calls[0]!;
    expect(String(refUrl)).toBe('https://example.com/ref.png');
    expect(refInit?.method ?? 'GET').toBe('GET');
    // Second call: POST /edits with multipart body.
    const [editsUrl, editsInit] = fetchMock.mock.calls[1]!;
    expect(editsUrl).toBe(EDITS_ENDPOINT);
    expect(editsInit?.body).toBeInstanceOf(FormData);
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
