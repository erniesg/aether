import { describe, expect, it, vi } from 'vitest';
import { createGenericProvider } from './generic';

const OG_HTML = `<!doctype html>
<html><head>
  <title>Notes · Solstice Studio</title>
  <link rel="canonical" href="https://studio.example.com/notes/golden-hour" />
  <meta property="og:title" content="Golden hour notes" />
  <meta property="og:image" content="https://studio.example.com/hero.png" />
  <meta property="og:site_name" content="Solstice Studio" />
</head><body></body></html>`;

const BARE_HTML = `<!doctype html>
<html><head><title>Just a page</title></head><body>only text</body></html>`;

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

describe('generic adapter · contract', () => {
  const provider = createGenericProvider();

  it('canHandle accepts any http(s) URL; rejects non-url / other schemes', () => {
    expect(provider.canHandle('https://example.com')).toBe(true);
    expect(provider.canHandle('http://example.com/path?q=1')).toBe(true);
    expect(provider.canHandle('ftp://example.com')).toBe(false);
    expect(provider.canHandle('notaurl')).toBe(false);
  });

  it('returns an image ReferenceRecord when og:image is present', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(OG_HTML));
    const record = await provider.fetch('https://studio.example.com/notes/golden-hour', {
      fetcher,
    });

    expect(record.kind).toBe('image');
    expect(record.previewUrl).toBe('https://studio.example.com/hero.png');
    expect(record.fullUrl).toBe('https://studio.example.com/notes/golden-hour');
    expect(record.attribution.source).toBe('generic');
    expect(record.attribution.author).toBe('Solstice Studio');
    expect(record.id).toMatch(/^ref_/);
  });

  it('falls back to an embed-kind link-only record when no og:image is present', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(BARE_HTML));
    const record = await provider.fetch('https://plain.example.com/', { fetcher });

    expect(record.kind).toBe('embed');
    expect(record.previewUrl).toBe('https://plain.example.com/');
    expect(record.fullUrl).toBe('https://plain.example.com/');
    expect(record.attribution.source).toBe('generic');
  });
});
