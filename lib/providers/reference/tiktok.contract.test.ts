import { describe, expect, it, vi } from 'vitest';
import { createTikTokProvider } from './tiktok';
import { ReferenceIngestError } from './types';

const VIDEO_HTML = `<!doctype html>
<html><head>
  <link rel="canonical" href="https://www.tiktok.com/@solstice.skin/video/7123456789012345" />
  <meta property="og:type" content="video.other" />
  <meta property="og:title" content="sunset routine — day 3" />
  <meta property="og:description" content="@solstice.skin on TikTok" />
  <meta property="og:image" content="https://p16-sign.tiktokcdn-us.com/obj/thumb-123.jpeg" />
  <meta property="og:site_name" content="TikTok" />
</head><body></body></html>`;

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

describe('tiktok adapter · contract', () => {
  const provider = createTikTokProvider();

  it('canHandle matches tiktok.com, vm.tiktok.com, vt.tiktok.com', () => {
    expect(
      provider.canHandle('https://www.tiktok.com/@solstice.skin/video/7123456789012345')
    ).toBe(true);
    expect(provider.canHandle('https://vm.tiktok.com/AbcDEF/')).toBe(true);
    expect(provider.canHandle('https://vt.tiktok.com/xyz/')).toBe(true);
    expect(provider.canHandle('https://example.com/tiktok')).toBe(false);
  });

  it('fetches a video share URL and returns a video ReferenceRecord', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(VIDEO_HTML));
    const record = await provider.fetch('https://vm.tiktok.com/AbcDEF/', { fetcher });

    expect(record.kind).toBe('video');
    expect(record.previewUrl).toBe(
      'https://p16-sign.tiktokcdn-us.com/obj/thumb-123.jpeg'
    );
    expect(record.fullUrl).toBe(
      'https://www.tiktok.com/@solstice.skin/video/7123456789012345'
    );
    expect(record.attribution.source).toBe('tiktok');
    expect(record.attribution.author).toBe('@solstice.skin');
    expect(record.id).toMatch(/^ref_tt_/);
  });

  it('throws ReferenceIngestError when og:image is missing', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse('<html><head></head></html>'));
    await expect(
      provider.fetch('https://www.tiktok.com/@x/video/1', { fetcher })
    ).rejects.toBeInstanceOf(ReferenceIngestError);
  });
});
