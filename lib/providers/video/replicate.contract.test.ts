import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReplicateVideoProvider } from './replicate';
import { VideoGenError, VideoProviderUnavailableError } from './types';

function jsonResponse(body: unknown, init: Partial<ResponseInit> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('replicate video adapter · contract', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalSetTimeout = globalThis.setTimeout;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    const fastSetTimeout = ((handler: TimerHandler) => {
      if (typeof handler === 'function') (handler as () => void)();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    vi.stubGlobal('setTimeout', fastSetTimeout);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.setTimeout = originalSetTimeout;
  });

  it('is unavailable and does not call Replicate without REPLICATE_API_TOKEN', async () => {
    const provider = createReplicateVideoProvider(undefined);
    expect(provider.isAvailable()).toBe(false);
    const err = await provider
      .generate({ prompt: 'hi', durationSec: 4 }, { model: 'bytedance/seedance-2.0' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(VideoProviderUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a Seedance 2.0 prediction with multimodal refs', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'pred1',
        status: 'succeeded',
        output: ['https://cdn.replicate.delivery/out.mp4'],
      })
    );

    const provider = createReplicateVideoProvider('r8_test');
    const result = await provider.generate(
      {
        prompt: 'Introduce Ernie as an AI Engineer in Singapore.',
        durationSec: 5,
        aspectRatio: '16:9',
        size: { w: 1280, h: 720 },
        fps: 24,
        sceneSpec: {
          kind: 'text-mask',
          version: 1,
          durationSec: 5,
          fps: 24,
          size: { w: 1280, h: 720 },
          aspectRatio: '16:9',
          assets: [
            { id: 'image-1', kind: 'image', url: 'data:image/png;base64,aaa' },
            { id: 'video-1', kind: 'video', url: 'https://cdn.test/ref.mp4' },
            { id: 'audio-1', kind: 'audio', url: 'https://cdn.test/ref.wav' },
          ],
          payload: {},
        },
      },
      { model: 'bytedance/seedance-2.0' }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://api.replicate.com/v1/models/bytedance/seedance-2.0/predictions'
    );
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer r8_test');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Prefer).toBe('wait=60');

    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({
      input: expect.objectContaining({
        prompt: 'Introduce Ernie as an AI Engineer in Singapore.',
        duration: 5,
        resolution: '720p',
        aspect_ratio: '16:9',
        generate_audio: true,
        reference_images: ['data:image/png;base64,aaa'],
        reference_videos: ['https://cdn.test/ref.mp4'],
        reference_audios: ['https://cdn.test/ref.wav'],
      }),
    });
    expect(result).toMatchObject({
      provider: 'replicate',
      model: 'bytedance/seedance-2.0',
      videoUrl: 'https://cdn.replicate.delivery/out.mp4',
      durationSec: 5,
      fps: 24,
      width: 1280,
      height: 720,
    });
  });

  it('polls a prediction until it succeeds', async () => {
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
          status: 'succeeded',
          output: { video: 'https://cdn.replicate.delivery/final.mp4' },
        })
      );

    const provider = createReplicateVideoProvider('r8_test');
    const result = await provider.generate(
      { prompt: 'waves', durationSec: 4 },
      { model: 'bytedance/seedance-2.0' }
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://api.replicate.com/v1/predictions/pred2'
    );
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      'https://api.replicate.com/v1/predictions/pred2'
    );
    expect(result.videoUrl).toBe('https://cdn.replicate.delivery/final.mp4');
  });

  it('throws VideoGenError for failed or empty predictions', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'pred3', status: 'failed', error: 'bad prompt' })
    );
    const provider = createReplicateVideoProvider('r8_test');
    const err = await provider
      .generate({ prompt: 'x', durationSec: 4 }, { model: 'bytedance/seedance-2.0' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(VideoGenError);
    expect(String(err)).toMatch(/bad prompt/);
  });
});
