import { describe, expect, it, vi } from 'vitest';
import { ingestBrand } from './ingest';

const HTML_FIXTURE = `
  <!doctype html>
  <html lang="en">
    <head>
      <title>Solstice Skin — Slow-Morning Skincare</title>
      <meta name="description" content="Slow, certain skincare for golden-hour mornings." />
      <meta property="og:image" content="/hero/amber-duo.jpg" />
      <meta name="theme-color" content="#0F1013" />
      <link rel="icon" href="/mark.svg" />
      <link href="https://fonts.googleapis.com/css2?family=Canela+Deck" rel="stylesheet" />
      <style>
        :root { --ink: #0F1013; --bone: #E8E4D6; --sun: #C48B5E; --leaf: #7C9885; }
        body { font-family: 'Canela Deck', serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }
      </style>
    </head>
    <body>
      <img src="/logo.svg" alt="Solstice logo" />
      <img src="/spring-duo.jpg" alt="Spring Reset Duo bottle pair" />
      <h1>Slow, certain skincare.</h1>
      <p>Barrier-first formulas for golden-hour mornings.</p>
    </body>
  </html>
`;

function buildResponse(body: string, ok = true, status = 200): Response {
  return new Response(body, {
    status: ok ? status : status,
    headers: { 'Content-Type': 'text/html' },
  });
}

describe('brand · ingest · url mode', () => {
  it('fetches the URL, parses the HTML, and returns a BrandSnapshot', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => buildResponse(HTML_FIXTURE));
    const snap = await ingestBrand(
      { kind: 'url', source: 'https://solsticeskin.com/' },
      { fetcher: fetcher as unknown as typeof fetch, bypassAgent: true }
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]![0])).toBe('https://solsticeskin.com/');

    expect(snap.source).toEqual({ kind: 'url', url: 'https://solsticeskin.com/' });
    expect(snap.palette.map((p) => p.hex)).toEqual(
      expect.arrayContaining(['#0f1013', '#e8e4d6', '#c48b5e', '#7c9885'])
    );
    expect(snap.typography.map((t) => t.family)).toEqual(
      expect.arrayContaining(['Canela Deck'])
    );
    expect(snap.voice.samples.some((s) => s.includes('Slow, certain skincare'))).toBe(true);
    expect(
      snap.logos.some((l) => l.url === 'https://solsticeskin.com/logo.svg')
    ).toBe(true);
    expect(snap.confidence).toBeGreaterThan(0);
  });

  it('rejects a non-ok response with a 4xx-shaped error', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 404 }));
    await expect(
      ingestBrand(
        { kind: 'url', source: 'https://missing.example.com' },
        { fetcher: fetcher as unknown as typeof fetch, bypassAgent: true }
      )
    ).rejects.toThrow(/fetch failed/);
  });

  it('rejects an empty URL source', async () => {
    await expect(
      ingestBrand({ kind: 'url', source: '' }, { bypassAgent: true })
    ).rejects.toThrow(/non-empty source/);
  });
});

describe('brand · ingest · repo mode', () => {
  it('fetches README + tailwind.config + theme files via raw.githubusercontent.com', async () => {
    const files: Record<string, string | null> = {
      'README.md': `# Solstice\n\nSlow, certain skincare for golden-hour mornings. Built for the hackathon.\n`,
      'tailwind.config.ts': `
        export default {
          theme: {
            extend: {
              colors: { ink: '#0F1013', bone: '#E8E4D6', sun: '#C48B5E' },
              fontFamily: {
                display: ['Canela Deck', 'serif'],
                body: ['Inter', 'sans-serif'],
              }
            }
          }
        }
      `,
    };

    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const [path, body] of Object.entries(files)) {
        if (url.endsWith('/' + path) && body !== null) return buildResponse(body);
      }
      return new Response('', { status: 404 });
    });

    const snap = await ingestBrand(
      { kind: 'repo', source: 'https://github.com/solstice/solstice-launch-kit' },
      { fetcher: fetcher as unknown as typeof fetch, bypassAgent: true }
    );

    expect(fetcher).toHaveBeenCalled();
    const urls = fetcher.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => u.startsWith('https://raw.githubusercontent.com/solstice/solstice-launch-kit/HEAD/'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/tailwind.config.ts'))).toBe(true);

    expect(snap.source).toEqual({
      kind: 'repo',
      url: 'https://github.com/solstice/solstice-launch-kit',
    });
    expect(snap.palette.map((p) => p.hex)).toEqual(
      expect.arrayContaining(['#0f1013', '#e8e4d6', '#c48b5e'])
    );
    expect(snap.typography.map((t) => t.family)).toEqual(
      expect.arrayContaining(['Canela Deck', 'Inter'])
    );
    expect(snap.voice.samples.some((s) => s.toLowerCase().includes('golden-hour'))).toBe(true);
  });

  it('rejects non-github URLs', async () => {
    await expect(
      ingestBrand(
        { kind: 'repo', source: 'https://gitlab.com/foo/bar' },
        { bypassAgent: true }
      )
    ).rejects.toThrow(/github\.com/);
  });
});

describe('brand · ingest · files mode', () => {
  it('turns a pre-resolved files payload into a BrandSnapshot', async () => {
    const snap = await ingestBrand(
      {
        kind: 'files',
        source: {
          texts: [
            `Palette: #0F1013, #E8E4D6, #C48B5E.\nDisplay: "Canela Deck". Body: "Inter".`,
            `Slow-morning skincare. Certain, quiet language.`,
          ],
          images: [
            { url: 'https://cdn.example.com/logo.svg', alt: 'Solstice logo' },
            { url: 'https://cdn.example.com/packshot.jpg', alt: 'Amber bottle packshot' },
          ],
        },
      },
      { bypassAgent: true }
    );
    expect(snap.source).toEqual({ kind: 'files' });
    expect(snap.palette.map((p) => p.hex)).toEqual(
      expect.arrayContaining(['#0f1013', '#e8e4d6', '#c48b5e'])
    );
    expect(snap.typography.map((t) => t.family)).toEqual(
      expect.arrayContaining(['Canela Deck', 'Inter'])
    );
    expect(snap.logos.map((l) => l.url)).toEqual(['https://cdn.example.com/logo.svg']);
    expect(snap.productImages.map((p) => p.url)).toEqual([
      'https://cdn.example.com/packshot.jpg',
    ]);
  });

  it('rejects a non-object files source', async () => {
    await expect(
      ingestBrand(
        { kind: 'files', source: 'not-a-payload' as unknown as string },
        { bypassAgent: true }
      )
    ).rejects.toThrow(/source object/);
  });
});
