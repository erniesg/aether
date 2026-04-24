import { describe, expect, it, vi } from 'vitest';
import { createInstagramProvider } from './instagram';
import { ReferenceIngestError } from './types';

const POST_HTML = `<!doctype html>
<html><head>
  <link rel="canonical" href="https://www.instagram.com/p/Cabc123/" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="solsticeskin on Instagram: ‘look 3’" />
  <meta property="og:description" content="12 likes, 1 comments — @solsticeskin" />
  <meta property="og:image" content="https://scontent.cdninstagram.com/v/t51/post.jpg" />
  <meta property="og:site_name" content="Instagram" />
</head><body></body></html>`;

const REEL_HTML = `<!doctype html>
<html><head>
  <link rel="canonical" href="https://www.instagram.com/reel/CxyzReel/" />
  <meta property="og:type" content="video.other" />
  <meta property="og:title" content="@creator on Instagram" />
  <meta property="og:image" content="https://scontent.cdninstagram.com/v/t51/reel-thumb.jpg" />
</head><body></body></html>`;

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

describe('instagram adapter · contract', () => {
  const provider = createInstagramProvider();

  it('canHandle matches /p/, /reel/, /tv/ paths on instagram.com only', () => {
    expect(provider.canHandle('https://www.instagram.com/p/Cabc/')).toBe(true);
    expect(provider.canHandle('https://instagram.com/reel/Cxyz/')).toBe(true);
    expect(provider.canHandle('https://www.instagram.com/tv/Cabc/')).toBe(true);
    expect(provider.canHandle('https://www.instagram.com/solsticeskin/')).toBe(false);
    expect(provider.canHandle('https://example.com/p/abc/')).toBe(false);
  });

  it('parses a post into an image ReferenceRecord with handle attribution', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(POST_HTML));
    const record = await provider.fetch('https://www.instagram.com/p/Cabc123/', { fetcher });

    expect(record.kind).toBe('image');
    expect(record.previewUrl).toBe('https://scontent.cdninstagram.com/v/t51/post.jpg');
    expect(record.fullUrl).toBe('https://www.instagram.com/p/Cabc123/');
    expect(record.attribution.source).toBe('instagram');
    expect(record.attribution.author).toBe('@solsticeskin');
    expect(record.id).toMatch(/^ref_ig_/);
  });

  it('detects reels as video kind', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(REEL_HTML));
    const record = await provider.fetch('https://www.instagram.com/reel/CxyzReel/', { fetcher });
    expect(record.kind).toBe('video');
    expect(record.attribution.author).toBe('@creator');
  });

  it('throws ReferenceIngestError when og:image is missing', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse('<html><head></head><body></body></html>'));
    await expect(
      provider.fetch('https://www.instagram.com/p/empty/', { fetcher })
    ).rejects.toBeInstanceOf(ReferenceIngestError);
  });
});
