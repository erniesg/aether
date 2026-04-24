import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGeminiProvider } from './gemini';
import { ImageGenError } from './types';

function jsonResponse(body: unknown, init: Partial<ResponseInit> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('gemini (imagen) adapter · contract', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isAvailable is false and generate throws when API key missing', async () => {
    const provider = createGeminiProvider(undefined);
    expect(provider.isAvailable()).toBe(false);
    const err = await provider
      .generate({ prompt: 'hi' }, { model: 'imagen-4.0-generate-001' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(String(err)).toMatch(/GOOGLE_GEMINI_API_KEY not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the Imagen predict endpoint and parses a base64 image', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        predictions: [
          { bytesBase64Encoded: 'aGVsbG8=', mimeType: 'image/png' },
        ],
      })
    );
    const provider = createGeminiProvider('key-abc');
    const result = await provider.generate(
      { prompt: 'a teapot', aspectRatio: '1:1' },
      { model: 'imagen-4.0-generate-001' }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/v1beta/models/');
    expect(String(url)).toContain('imagen-4.0-generate-001:predict');
    expect(String(url)).toContain('key=key-abc');
    const body = JSON.parse(init?.body as string);
    expect(body.instances).toEqual([{ prompt: 'a teapot' }]);
    expect(body.parameters.aspectRatio).toBe('1:1');
    expect(body.parameters.sampleCount).toBe(1);
    expect(body.parameters.outputMimeType).toBe('image/png');

    expect(result.provider).toBe('gemini');
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.url).toBe('data:image/png;base64,aGVsbG8=');
    expect(result.images[0]?.dataUrl).toBe('data:image/png;base64,aGVsbG8=');
  });

  describe('aspect-ratio remap', () => {
    async function captureAspect(ratio: string): Promise<string> {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          predictions: [{ bytesBase64Encoded: 'YQ==', mimeType: 'image/png' }],
        })
      );
      const provider = createGeminiProvider('key');
      await provider.generate(
        { prompt: 'x', aspectRatio: ratio as never },
        { model: 'imagen-4.0-generate-001' }
      );
      const [, init] = fetchMock.mock.calls.at(-1)!;
      const body = JSON.parse(init?.body as string);
      return body.parameters.aspectRatio;
    }

    it('4:5 → 3:4', async () => {
      expect(await captureAspect('4:5')).toBe('3:4');
    });

    it('2:3 → 3:4', async () => {
      expect(await captureAspect('2:3')).toBe('3:4');
    });

    it('3:2 → 4:3', async () => {
      expect(await captureAspect('3:2')).toBe('4:3');
    });

    it('passes through supported ratios unchanged', async () => {
      expect(await captureAspect('16:9')).toBe('16:9');
      expect(await captureAspect('9:16')).toBe('9:16');
      expect(await captureAspect('4:3')).toBe('4:3');
      expect(await captureAspect('3:4')).toBe('3:4');
      expect(await captureAspect('1:1')).toBe('1:1');
    });

    it('unknown ratios default to 1:1', async () => {
      expect(await captureAspect('custom')).toBe('1:1');
    });
  });

  it('throws ImageGenError on non-200 response', async () => {
    fetchMock.mockResolvedValue(new Response('forbidden', { status: 403 }));
    const provider = createGeminiProvider('key');
    const err = await provider
      .generate({ prompt: 'x' }, { model: 'imagen-4.0-generate-001' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(String(err)).toMatch(/403/);
    expect(String(err)).toMatch(/forbidden/);
  });

  it('throws when predictions array is empty', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ predictions: [] }));
    const provider = createGeminiProvider('key');
    await expect(
      provider.generate({ prompt: 'x' }, { model: 'imagen-4.0-generate-001' })
    ).rejects.toThrow(/no predictions returned/);
  });

  describe('edit (gemini-2.5-flash-image-preview)', () => {
    it('exposes an edit method when the key is present', () => {
      const provider = createGeminiProvider('key');
      expect(typeof provider.edit).toBe('function');
    });

    it('posts to :generateContent with inlineData + text parts', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: 'ZWRpdGVk',
                      mimeType: 'image/png',
                    },
                  },
                ],
              },
            },
          ],
        })
      );
      const provider = createGeminiProvider('key-abc');
      const result = await provider.edit!(
        {
          prompt: 'add a red hat',
          sourceUrl: 'data:image/png;base64,c291cmNl',
        },
        { model: 'gemini-2.5-flash-image-preview' }
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toContain('gemini-2.5-flash-image-preview:generateContent');
      expect(String(url)).toContain('key=key-abc');
      const body = JSON.parse(init?.body as string);
      expect(body.contents).toHaveLength(1);
      const parts = body.contents[0].parts;
      expect(parts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ text: 'add a red hat' }),
          expect.objectContaining({
            inlineData: expect.objectContaining({
              mimeType: 'image/png',
              data: 'c291cmNl',
            }),
          }),
        ])
      );

      expect(result.provider).toBe('gemini');
      expect(result.images[0]?.url).toBe('data:image/png;base64,ZWRpdGVk');
      expect(result.images[0]?.mimeType).toBe('image/png');
    });

    it('rejects imagen models for edit', async () => {
      const provider = createGeminiProvider('key');
      await expect(
        provider.edit!(
          { prompt: 'x', sourceUrl: 'data:image/png;base64,Zm9v' },
          { model: 'imagen-4.0-generate-001' }
        )
      ).rejects.toThrow(/image-to-image/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects when sourceUrl is missing', async () => {
      const provider = createGeminiProvider('key');
      await expect(
        provider.edit!(
          { prompt: 'x' } as never,
          { model: 'gemini-2.5-flash-image-preview' }
        )
      ).rejects.toThrow(/sourceUrl/);
    });

    it('rejects sourceUrl schemes that are neither http(s) nor data:image', async () => {
      const provider = createGeminiProvider('key');
      await expect(
        provider.edit!(
          { prompt: 'x', sourceUrl: 'blob:local' } as never,
          { model: 'gemini-2.5-flash-image-preview' }
        )
      ).rejects.toThrow();
    });
  });
});
