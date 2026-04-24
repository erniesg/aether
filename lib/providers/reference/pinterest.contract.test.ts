import { describe, expect, it, vi } from 'vitest';
import { createPinterestProvider } from './pinterest';
import { ReferenceIngestError } from './types';

const PIN_HTML = `<!doctype html>
<html>
<head>
  <title>Sunset couture — look 3 | Solstice Studio | Pinterest</title>
  <link rel="canonical" href="https://www.pinterest.com/pin/123456789/" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="Solstice Studio on Pinterest: Sunset couture — look 3" />
  <meta property="og:description" content="Found by Solstice Studio on Pinterest" />
  <meta property="og:image" content="https://i.pinimg.com/originals/ab/cd/ef/pin-preview.jpg" />
  <meta property="og:site_name" content="Pinterest" />
</head>
<body></body>
</html>`;

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

describe('pinterest adapter · contract', () => {
  const provider = createPinterestProvider();

  it('canHandle matches pinterest.com and pin.it shortlinks', () => {
    expect(provider.canHandle('https://www.pinterest.com/pin/123/')).toBe(true);
    expect(provider.canHandle('https://pinterest.com/pin/123/')).toBe(true);
    expect(provider.canHandle('https://uk.pinterest.com/pin/123/')).toBe(true);
    expect(provider.canHandle('https://pin.it/abc123')).toBe(true);
    expect(provider.canHandle('https://example.com/pin/123')).toBe(false);
    expect(provider.canHandle('not-a-url')).toBe(false);
  });

  it('fetch parses og:image + author + canonical into a ReferenceRecord', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(PIN_HTML));
    const record = await provider.fetch('https://pin.it/abc123', { fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(record.kind).toBe('image');
    expect(record.previewUrl).toBe(
      'https://i.pinimg.com/originals/ab/cd/ef/pin-preview.jpg'
    );
    expect(record.fullUrl).toBe('https://www.pinterest.com/pin/123456789/');
    expect(record.attribution.source).toBe('pinterest');
    expect(record.attribution.author).toBe('Solstice Studio');
    expect(record.attribution.url).toBe(
      'https://www.pinterest.com/pin/123456789/'
    );
    expect(typeof record.capturedAt).toBe('string');
    expect(Number.isNaN(Date.parse(record.capturedAt))).toBe(false);
    expect(record.id).toMatch(/^ref_pin_/);
  });

  it('throws ReferenceIngestError when og:image is missing', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse('<html><head></head><body></body></html>'));
    await expect(
      provider.fetch('https://www.pinterest.com/pin/987/', { fetcher })
    ).rejects.toBeInstanceOf(ReferenceIngestError);
  });

  it('propagates fetch failures as errors', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('nope', { status: 404, statusText: 'Not Found' }));
    await expect(
      provider.fetch('https://www.pinterest.com/pin/404/', { fetcher })
    ).rejects.toThrow(/fetch failed: 404/);
  });
});
