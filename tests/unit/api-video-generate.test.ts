import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('/api/video/generate', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns provider metadata for deterministic local motion generation', async () => {
    const { GET } = await import('@/app/api/video/generate/route');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      providers: expect.arrayContaining([
        expect.objectContaining({
          id: 'hyperframes',
          supportsSceneSpec: true,
          supportsAudioSync: true,
          available: true,
        }),
      ]),
    });
  });

  it('returns an artifact-first text-mask composition with an embedded audio track', async () => {
    const { POST } = await import('@/app/api/video/generate/route');
    const response = await POST(
      new Request('http://localhost/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene: {
            kind: 'text-mask',
            text: 'AETHER\\nHACKATHON',
            media: {
              kind: 'video',
              url: 'https://cdn.test/cinematic-intro.mp4',
            },
          },
          durationSec: 4,
          aspectRatio: '16:9',
        }),
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json).toMatchObject({
      ok: true,
      provider: {
        id: 'hyperframes',
        model: 'hyperframes-html-v1',
      },
      artifact: {
        kind: 'html-composition',
        mimeType: 'text/html',
        audioIncluded: true,
      },
      result: {
        sceneSpec: {
          kind: 'text-mask',
          durationSec: 4,
          assets: expect.arrayContaining([
            expect.objectContaining({ kind: 'video' }),
            expect.objectContaining({ kind: 'audio' }),
          ]),
        },
      },
    });
    expect(json.artifact.html).toContain('data-composition-id="hackathon-intro"');
    expect(json.artifact.html).toContain('<audio');
    expect(json.artifact.html).toContain('data-start="0"');
    expect(json.artifact.url).toContain('data:text/html');
  });

  it('returns a hosted Replicate video URL under mocked Seedance responses', async () => {
    process.env.REPLICATE_API_TOKEN = 'r8_test';
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'pred1',
          status: 'succeeded',
          output: ['https://cdn.replicate.delivery/seedance.mp4'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const { POST } = await import('@/app/api/video/generate/route');
    const response = await POST(
      new Request('http://localhost/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'replicate',
          prompt: 'Introduce Ernie as an AI Engineer based in Singapore.',
          scene: {
            kind: 'text-mask',
            text: 'ERNIE\\nSINGAPORE',
            media: {
              kind: 'image',
              url: 'data:image/png;base64,aaa',
            },
          },
          durationSec: 4,
          aspectRatio: '16:9',
        }),
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      provider: {
        id: 'replicate',
        model: 'bytedance/seedance-2.0',
      },
      artifact: {
        kind: 'hosted-video',
        mimeType: 'video/mp4',
        url: 'https://cdn.replicate.delivery/seedance.mp4',
        audioIncluded: true,
      },
    });
    expect(json.artifact.html).toContain('<video');
    expect(json.artifact.html).toContain('https://cdn.replicate.delivery/seedance.mp4');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://api.replicate.com/v1/models/bytedance/seedance-2.0/predictions'
    );
    const body = JSON.parse(init?.body as string);
    expect(body.input).toMatchObject({
      prompt: 'Introduce Ernie as an AI Engineer based in Singapore.',
      duration: 4,
      aspect_ratio: '16:9',
      generate_audio: true,
      reference_images: ['data:image/png;base64,aaa'],
    });
  });

  it('falls back to HyperFrames when Replicate is requested but unavailable', async () => {
    delete process.env.REPLICATE_API_TOKEN;

    const { POST } = await import('@/app/api/video/generate/route');
    const response = await POST(
      new Request('http://localhost/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'replicate',
          scene: {
            kind: 'text-mask',
            text: 'AETHER\\nHACKATHON',
          },
          durationSec: 4,
          aspectRatio: '16:9',
        }),
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.provider).toMatchObject({
      id: 'hyperframes',
      model: 'hyperframes-html-v1',
      fallbackFrom: 'replicate',
    });
    expect(json.artifact.url).toContain('data:text/html');
  });
});
