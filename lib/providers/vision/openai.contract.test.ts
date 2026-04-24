import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAIVisionProvider } from './openai';
import { VisionError } from './types';

const RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';

function jsonResponse(body: unknown, init: Partial<ResponseInit> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('openai vision adapter · contract', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isAvailable is false and analyze throws when API key missing', async () => {
    const provider = createOpenAIVisionProvider(undefined);
    expect(provider.isAvailable()).toBe(false);
    const err = await provider
      .analyze({ sourceUrl: 'data:image/png;base64,aaa' }, { model: 'gpt-4.1-mini' })
      .catch((error) => error);

    expect(err).toBeInstanceOf(VisionError);
    expect(String(err)).toMatch(/OPENAI_API_KEY not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a structured image-analysis request and normalizes inventory output', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        output_text: JSON.stringify({
          summary: 'A marble bust with exposed brain, robotic hand, wireframe hand, and floating glitch blocks.',
          elements: [
            {
              id: 'head',
              label: 'marble bust head',
              prompt: 'marble bust head',
              prominence: 'primary',
            },
            {
              id: 'robot-hand',
              label: 'robotic hand',
              prompt: 'robotic hand',
              prominence: 'secondary',
            },
          ],
        }),
      })
    );

    const provider = createOpenAIVisionProvider('sk-test');
    const result = await provider.analyze(
      { sourceUrl: 'data:image/png;base64,aaa', maxElements: 5 },
      { model: 'gpt-4.1-mini' }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(RESPONSES_ENDPOINT);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-test',
      'Content-Type': 'application/json',
    });

    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe('gpt-4.1-mini');
    expect(body.input).toHaveLength(2);
    expect(body.input[1].content[1]).toMatchObject({
      type: 'input_image',
      image_url: 'data:image/png;base64,aaa',
      detail: 'high',
    });
    expect(body.text.format.type).toBe('json_schema');

    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-4.1-mini');
    expect(result.inventory.summary).toMatch(/marble bust/i);
    expect(result.inventory.elements).toEqual([
      {
        id: 'head',
        label: 'marble bust head',
        prompt: 'marble bust head',
        prominence: 'primary',
      },
      {
        id: 'robot-hand',
        label: 'robotic hand',
        prompt: 'robotic hand',
        prominence: 'secondary',
      },
    ]);
  });

  it('throws VisionError on non-200 response with status and text', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad request', { status: 400 }));
    const provider = createOpenAIVisionProvider('sk-test');
    const err = await provider
      .analyze({ sourceUrl: 'data:image/png;base64,aaa' }, { model: 'gpt-4.1-mini' })
      .catch((error) => error);

    expect(err).toBeInstanceOf(VisionError);
    expect(String(err)).toMatch(/400/);
    expect(String(err)).toMatch(/bad request/);
  });
});
