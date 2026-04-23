import { describe, expect, it, vi } from 'vitest';
import { ingestOffer } from './ingest';

const HTML_FIXTURE = `
  <!doctype html>
  <html lang="en">
    <head>
      <title>Spring Reset Duo — Solstice Skin</title>
      <meta name="description" content="Barrier repair plus golden-hour glow." />
      <meta property="og:image" content="/hero/amber-duo.jpg" />
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Spring Reset Duo",
        "description": "Barrier repair plus golden-hour glow.",
        "image": "https://cdn.example.com/duo.jpg",
        "offers": {
          "@type": "Offer",
          "price": "58.00",
          "priceCurrency": "USD",
          "validFrom": "2026-04-30",
          "validThrough": "2026-05-31"
        }
      }
      </script>
    </head>
    <body>
      <h1>Spring Reset Duo</h1>
      <ul>
        <li>Ceramide cleanse</li>
        <li>Niacinamide glow</li>
        <li>Fragrance-free, golden-hour finish</li>
      </ul>
      <blockquote>Changed my morning routine.</blockquote>
    </body>
  </html>
`;

function buildResponse(body: string, ok = true, status = 200): Response {
  return new Response(body, {
    status: ok ? status : status,
    headers: { 'Content-Type': 'text/html' },
  });
}

describe('offer · ingest · url mode', () => {
  it('fetches the URL, parses the HTML, and returns an OfferSnapshot', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => buildResponse(HTML_FIXTURE));
    const snap = await ingestOffer(
      { kind: 'url', source: 'https://solsticeskin.com/duo' },
      { fetcher: fetcher as unknown as typeof fetch, bypassAgent: true }
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]![0])).toBe('https://solsticeskin.com/duo');

    expect(snap.source).toEqual({ kind: 'url', url: 'https://solsticeskin.com/duo' });
    expect(snap.name).toBe('Spring Reset Duo');
    expect(snap.tagline).toMatch(/golden-hour/);
    expect(snap.claims).toEqual(
      expect.arrayContaining(['Ceramide cleanse', 'Niacinamide glow'])
    );
    expect(snap.launchWindow?.startAt).toBe('2026-04-30');
    expect(snap.heroImages.some((h) => h.url.includes('duo'))).toBe(true);
    expect(snap.confidence).toBeGreaterThan(0);
  });

  it('rejects a non-ok response with a 4xx-shaped error', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 404 }));
    await expect(
      ingestOffer(
        { kind: 'url', source: 'https://missing.example.com' },
        { fetcher: fetcher as unknown as typeof fetch, bypassAgent: true }
      )
    ).rejects.toThrow(/fetch failed/);
  });

  it('rejects an empty URL source', async () => {
    await expect(
      ingestOffer({ kind: 'url', source: '' }, { bypassAgent: true })
    ).rejects.toThrow(/non-empty source/);
  });
});

describe('offer · ingest · files mode', () => {
  it('turns a pre-resolved files payload into an OfferSnapshot', async () => {
    const snap = await ingestOffer(
      {
        kind: 'files',
        source: {
          texts: [
            `# Spring Reset Duo\n\nTagline: Barrier repair plus golden-hour glow.\n\n- Ceramide cleanse\n- Niacinamide glow\n- Fragrance-free\n\n"Changed my morning routine." — Mia`,
          ],
          images: [
            { url: 'https://cdn.example.com/duo.jpg', alt: 'amber bottle pair' },
            { url: 'https://cdn.example.com/logo.svg', alt: 'Solstice logo' },
          ],
        },
      },
      { bypassAgent: true }
    );
    expect(snap.source).toEqual({ kind: 'files' });
    expect(snap.name).toBe('Spring Reset Duo');
    expect(snap.tagline).toMatch(/golden-hour/);
    expect(snap.claims).toEqual(
      expect.arrayContaining(['Ceramide cleanse', 'Niacinamide glow', 'Fragrance-free'])
    );
    // Hero images drop the logo candidate.
    expect(snap.heroImages.map((h) => h.url)).toEqual(['https://cdn.example.com/duo.jpg']);
  });

  it('rejects a non-object files source', async () => {
    await expect(
      ingestOffer(
        { kind: 'files', source: 'not-a-payload' as unknown as string },
        { bypassAgent: true }
      )
    ).rejects.toThrow(/source object/);
  });
});

describe('offer · ingest · clipboard mode', () => {
  it('re-routes a single-URL clipboard payload through the URL path', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => buildResponse(HTML_FIXTURE));
    const snap = await ingestOffer(
      { kind: 'clipboard', source: { text: 'https://solsticeskin.com/duo' } },
      { fetcher: fetcher as unknown as typeof fetch, bypassAgent: true }
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(snap.source).toEqual({ kind: 'clipboard', url: 'https://solsticeskin.com/duo' });
    expect(snap.name).toBe('Spring Reset Duo');
  });

  it('parses rich-text HTML clipboard contents directly', async () => {
    const snap = await ingestOffer(
      {
        kind: 'clipboard',
        source: {
          html: `<h1>Spring Reset Duo</h1><ul><li>Ceramide cleanse</li><li>Niacinamide glow</li></ul>`,
        },
      },
      { bypassAgent: true }
    );
    expect(snap.source).toEqual({ kind: 'clipboard' });
    expect(snap.name).toBe('Spring Reset Duo');
    expect(snap.claims).toEqual(
      expect.arrayContaining(['Ceramide cleanse', 'Niacinamide glow'])
    );
  });

  it('parses plain-text clipboard contents via the files path', async () => {
    const snap = await ingestOffer(
      {
        kind: 'clipboard',
        source: {
          text: `# Spring Reset Duo\n\n- Ceramide cleanse\n- Niacinamide glow`,
        },
      },
      { bypassAgent: true }
    );
    expect(snap.source).toEqual({ kind: 'clipboard' });
    expect(snap.name).toBe('Spring Reset Duo');
  });

  it('accepts a bare string as the clipboard source', async () => {
    const snap = await ingestOffer(
      {
        kind: 'clipboard',
        source: '# Spring Reset Duo\n\n- Ceramide cleanse',
      },
      { bypassAgent: true }
    );
    expect(snap.name).toBe('Spring Reset Duo');
  });
});
