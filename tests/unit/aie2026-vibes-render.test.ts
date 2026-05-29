import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { renderHtml } from '@/workers/aie2026-vibes';

const AIE2026_SHARE_TEXT =
  '1,000+ builders, 4.7M public views, and three days of AI work in public.\n\n' +
  'Singapore did not just host an AI conference. It showed what a builder scene looks like.\n\n' +
  'See the AI Engineer Singapore 2026 recap.';

describe('aie2026 public vibes page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the creator-facing share panel with short links and event tracking but no counts', () => {
    const html = renderHtml();

    expect(html).toContain('data-testid="vibes-public-share"');
    expect(html).toContain('share recap');
    expect(html).toContain('og:title');
    expect(html).toContain('twitter:card');
    expect(html).not.toContain('shareVerified');
    expect(html).not.toContain('share-verified');
    expect(html).not.toContain('>private<');
    expect(html).toContain('id="shareCopyUrl"');
    expect(html).toContain('class="share-copy-button"');
    expect(html).not.toContain('id="shareTracking"');
    expect(html).not.toContain('id="shareUrl"');
    expect(html).not.toContain('class="share-url"');
    expect(html).not.toContain('id="shareActions"');
    expect(html).not.toContain('id="shareVisits"');
    expect(html).not.toContain('id="sharePosts"');
    expect(html).toContain('id="shareCopyCurrent"');
    expect(html).toContain("SHARE_SHORT_URL_PLACEHOLDER='https://s.berlayar.ai/xxxx'");
    expect(html).toContain('shortSharePreviewUrl');
    expect(html).toContain('platform-icon-linkedin');
    expect(html).toContain('platform-icon-facebook');
    expect(html).toContain('platform-icon-whatsapp');
    expect(html).toContain("new URL('https://www.linkedin.com/feed/')");
    expect(html).toContain("u.searchParams.set('shareUrl',url)");
    expect(html).toContain("u.searchParams.set('quote',sharePostCopy())");
    expect(html).not.toContain("u.searchParams.set('hashtag'");
    expect(html).toContain("if(platform==='facebook')return shareFacebookPlatform()");
    expect(html).toContain('location.href=href');
    expect(html).toContain('Post copy copied. Facebook will open next.');
    expect(html).toContain('paste it into Facebook');
    expect(html).toContain('1,000+ builders, 4.7M public views');
    expect(html).toContain('Singapore did not just host an AI conference');
    expect(html).toContain('See the AI Engineer Singapore 2026 recap.');
    expect(html).toContain('SHARE_HASHTAG_TEXT');
    expect(html).toContain("SHARE_IMAGE_PATH='/vibes/aie2026/share-card.jpg'");
    expect(html).toContain('imageUrl:new URL(SHARE_IMAGE_PATH,location.origin).toString()');
    expect(html).toContain('https://aether.berlayar.ai/vibes/aie2026/share-card.jpg');
    expect(html).toContain('https://aether.berlayar.ai/vibes/aie2026/x-card.jpg');
    expect(html).toContain('<meta name="twitter:image" content="https://aether.berlayar.ai/vibes/aie2026/x-card.jpg" />');
    expect(html).toContain('<meta name="twitter:image:src" content="https://aether.berlayar.ai/vibes/aie2026/x-card.jpg" />');
    expect(html).toContain('<meta name="twitter:site" content="@erniesg" />');
    expect(html).toContain('<meta property="og:image:type" content="image/jpeg" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="675" />');
    expect(html).toContain('AI Engineer Singapore public recap');
    expect(html).toContain('aie2026_eventrecap.png');
    expect(html).toContain('mediaItems||[]');
    expect(html).toContain('AI Engineer Singapore recap visual');
    expect(html).toContain('id="mediaViewerDownload"');
    expect(html).toContain('downloadFileName');
    expect(html).toContain("if(image){stage.innerHTML='<img");
    expect(html).toContain('if(isRenderableMedia(m))openMedia(key)');
    expect(html).not.toContain('event-recap-ai-engineer-singapore%2Fmedia%2Flinkedin%2F7283684d73974e93.jpg');
    expect(html).not.toContain('bc9adb5a8f2eb284a80423af.jpg');
    expect(html).toContain('aether_share');
    expect(html).toContain('share_link_visit');
    expect(html).toContain('platform_clicked');
    expect(html).toContain('copy_link');
    expect(html).not.toContain('/vibes/aie2026/share/summary');
    expect(html).toContain('/vibes/aie2026/share/link');
    expect(html).toContain('/vibes/aie2026/share/event');
  });

  it('adds source media fallback URLs to local media endpoints in the public shell', () => {
    const html = renderHtml();

    expect(html).toContain("url.searchParams.set('path',m.path)");
    expect(html).toContain("url.searchParams.set('fallback',m.url)");
  });

  it('falls back to the original X video URL when the local R2 video is missing', async () => {
    const path = 'event-recap-ai-engineer-singapore/media/x/fabf7324c68f3864.mp4';
    const fallback =
      'https://video.twimg.com/amplify_video/2055912562123059200/vid/avc1/2160x3840/hJnN5YlV2e8y6lM-.mp4';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      expect(request.url).toBe(fallback);
      expect(request.headers.get('range')).toBe('bytes=0-1023');
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: {
          'accept-ranges': 'bytes',
          'content-length': '3',
          'content-range': 'bytes 0-2/3',
          'content-type': 'video/mp4',
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(
      new Request(
        `https://aether-stg.berlayar.ai/vibes/aie2026/media?path=${encodeURIComponent(path)}&fallback=${encodeURIComponent(fallback)}`,
        { headers: { range: 'bytes=0-1023' } }
      ),
      {
        AETHER_ASSETS: { get: vi.fn(async () => null) },
      }
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-range')).toBe('bytes 0-2/3');
    expect(await response.arrayBuffer()).toHaveProperty('byteLength', 3);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('proxies standalone share link creation to the canonical share API and normalizes visible short URLs', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      expect(request.url).toBe('https://aether-stg.berlayar.ai/api/share/link');
      expect(request.method).toBe('POST');
      await expect(request.json()).resolves.toMatchObject({
        target: {
          canonicalPath: '/vibes/aie2026/',
          objectId: 'aie2026',
        },
        platform: 'copy',
      });
      return Response.json({
        ok: true,
        link: {
          code: 'tota',
          shortUrl: 'https://s-stg.berlayar.ai/tota?utm_source=copy&utm_medium=share',
          canonicalUrl: 'https://aether-stg.berlayar.ai/vibes/aie2026/',
          platform: 'copy',
          targetId: 'target_aie2026',
          linkId: 'link_tota',
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(
      new Request('https://aether-stg.berlayar.ai/vibes/aie2026/share/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target: {
            objectType: 'vibes_page',
            objectId: 'aie2026',
            canonicalPath: '/vibes/aie2026/',
            title: 'AI Engineer Singapore vibes',
          },
          platform: 'copy',
          shareText: AIE2026_SHARE_TEXT,
        }),
      }),
      {
        AETHER_BASE_URL: 'https://aether-stg.berlayar.ai',
        AETHER_ASSETS: { get: vi.fn() },
      }
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      link: {
        code: 'tota',
        shortUrl: 'https://s-stg.berlayar.ai/tota',
      },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('falls back to plain four-letter short links when the canonical share API is unavailable', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => new Response('<html>not found</html>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(
      new Request('https://aether-stg.berlayar.ai/vibes/aie2026/share/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target: {
            objectType: 'vibes_page',
            objectId: 'aie2026',
            canonicalPath: '/vibes/aie2026/',
            title: 'AI Engineer Singapore vibes',
          },
          platform: 'copy',
        }),
      }),
      {
        AETHER_ENV: 'staging',
        AETHER_BASE_URL: 'https://aether-stg.berlayar.ai',
        AETHER_ASSETS: { get: vi.fn() },
      }
    );

    const json = await response.json() as { link: { code: string; shortUrl: string } };
    expect(json.link.code).toMatch(/^[a-z]{4}$/);
    expect(json.link.shortUrl).toBe(`https://s-stg.berlayar.ai/${json.link.code}`);
    expect(json.link.shortUrl).not.toContain('/aie2026/');
  });

  it('redirects plain short links back to the staging recap with only internal share attribution', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await worker.fetch(
      new Request('https://s-stg.berlayar.ai/tota?utm_source=facebook&utm_medium=share'),
      {
        AETHER_ENV: 'staging',
        AETHER_BASE_URL: 'https://aether-stg.berlayar.ai',
        AETHER_ASSETS: { get: vi.fn() },
      }
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://aether-stg.berlayar.ai/vibes/aie2026/?aether_share=tota'
    );
  });

  it('serves the optimized share card as a stable JPEG URL for link previews', async () => {
    const response = await worker.fetch(
      new Request('https://aether-stg.berlayar.ai/vibes/aie2026/share-card.jpg'),
      {
        AETHER_ASSETS: { get: vi.fn(async () => null) },
        AETHER_DATA: {
          get: vi.fn(async (key: string) =>
            key === 'event-recap-ai-engineer-singapore/media/aie2026_eventrecap_social.jpg'
              ? {
                  body: new ReadableStream({
                    start(controller) {
                      controller.enqueue(new Uint8Array([1, 2, 3]));
                      controller.close();
                    },
                  }),
                  httpMetadata: { contentType: 'image/jpeg' },
                }
              : null
          ),
        },
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toContain('max-age=604800');
    expect(await response.arrayBuffer()).toHaveProperty('byteLength', 3);
  });

  it('serves explicit robots allow rules for social crawlers', async () => {
    const response = await worker.fetch(
      new Request('https://s-stg.berlayar.ai/robots.txt', {
        headers: { 'user-agent': 'Twitterbot/1.0' },
      }),
      {
        AETHER_ASSETS: { get: vi.fn() },
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toBe('User-agent: *\nAllow: /\n');
  });

  it('serves a 2:1 X card image from the same recap artwork', async () => {
    const response = await worker.fetch(
      new Request('https://aether-stg.berlayar.ai/vibes/aie2026/x-card.jpg'),
      {
        AETHER_ASSETS: { get: vi.fn(async () => null) },
        AETHER_DATA: {
          get: vi.fn(async (key: string) =>
            key === 'event-recap-ai-engineer-singapore/media/aie2026_eventrecap_x_card.jpg'
              ? {
                  body: new ReadableStream({
                    start(controller) {
                      controller.enqueue(new Uint8Array([4, 5, 6]));
                      controller.close();
                    },
                  }),
                  httpMetadata: { contentType: 'image/jpeg' },
                }
              : null
          ),
        },
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(await response.arrayBuffer()).toHaveProperty('byteLength', 3);
  });

  it('serves the short URL as preview metadata for social crawlers', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await worker.fetch(
      new Request('https://s-stg.berlayar.ai/tota', {
        headers: {
          'user-agent': 'LinkedInBot/1.0',
        },
      }),
      {
        AETHER_ENV: 'staging',
        AETHER_BASE_URL: 'https://aether-stg.berlayar.ai',
        AETHER_ASSETS: { get: vi.fn() },
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('x-robots-tag')).toBe('all');
    expect(response.headers.get('cache-control')).toContain('no-transform');
    const html = await response.text();
    expect(html).toContain('<meta property="og:url" content="https://s-stg.berlayar.ai/tota" />');
    expect(html).toContain('<link rel="canonical" href="https://aether-stg.berlayar.ai/vibes/aie2026/" />');
    expect(html).toContain('AI Engineer Singapore public recap');
    expect(html).toContain('Singapore did not just host an AI conference');
    expect(html).toContain('See the AI Engineer Singapore 2026 recap');
    expect(html).toContain('<meta property="og:image" content="https://aether-stg.berlayar.ai/vibes/aie2026/share-card.jpg" />');
    expect(html).toContain('<meta name="twitter:image" content="https://aether-stg.berlayar.ai/vibes/aie2026/x-card.jpg" />');
    expect(html).toContain('<meta name="twitter:image:src" content="https://aether-stg.berlayar.ai/vibes/aie2026/x-card.jpg" />');
    expect(html).toContain('<meta property="og:image:type" content="image/jpeg" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="675" />');
    expect(html).not.toContain('<body>');
  });

  it('serves the canonical recap URL as head-only metadata for social crawlers', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await worker.fetch(
      new Request('https://aether-stg.berlayar.ai/vibes/aie2026/', {
        headers: {
          'user-agent': 'Twitterbot/1.0',
        },
      }),
      {
        AETHER_ENV: 'staging',
        AETHER_BASE_URL: 'https://aether-stg.berlayar.ai',
        AETHER_ASSETS: { get: vi.fn() },
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-robots-tag')).toBe('all');
    const html = await response.text();
    expect(html).toContain('<meta property="og:url" content="https://aether-stg.berlayar.ai/vibes/aie2026/" />');
    expect(html).toContain('<meta name="twitter:image" content="https://aether-stg.berlayar.ai/vibes/aie2026/x-card.jpg" />');
    expect(html).not.toContain('data-testid="vibes-public-share"');
    expect(html).not.toContain('<body>');
  });
});
