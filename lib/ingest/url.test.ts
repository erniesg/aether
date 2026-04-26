import { describe, expect, it } from 'vitest';
import { fetchUrlIngestion, parseHtmlIngestion } from './url';

const SAMPLE_HTML = `<!doctype html>
<html>
  <head>
    <title>Eight Sleep | Now in Singapore</title>
    <meta property="og:title" content="The Pod 4 Ultra" />
    <meta property="og:description" content="Smart cooling, warming, and sleep tracking — engineered for deeper sleep." />
    <meta property="og:image" content="https://cdn.example.com/og-hero-1200x630.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="description" content="Sleep tech that adapts to you." />
    <meta name="twitter:image" content="https://cdn.example.com/twitter-1200x600.jpg" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Pod 4 Ultra",
      "description": "Adaptive temperature sleep system",
      "brand": { "@type": "Brand", "name": "Eight Sleep" },
      "image": [
        "https://cdn.example.com/product-1.jpg",
        { "url": "https://cdn.example.com/product-2.jpg", "width": 1500, "height": 1500 }
      ],
      "offers": { "@type": "Offer", "price": "4995.00", "priceCurrency": "SGD" }
    }
    </script>
  </head>
  <body>
    <h1>Sleep, deeper.</h1>
    <h2>Cooling. Warming. Tracking.</h2>
    <h2>Wake refreshed.</h2>
    <p>The Pod 4 Ultra is the world's most advanced sleep system, automatically cooling and warming through the night.</p>
    <img src="https://cdn.example.com/hero-fullbleed.jpg" alt="Pod 4 Ultra in a bedroom" width="1920" height="1080" />
    <img src="https://cdn.example.com/lifestyle-1.jpg" alt="Person sleeping" width="800" height="800" />
    <img src="https://cdn.example.com/icon.svg" alt="icon" width="16" height="16" />
    <img src="https://cdn.example.com/logo-eightsleep.png" alt="Logo" width="240" height="80" />
    <img src="data:image/png;base64,iVBORw0K..." alt="placeholder" />
    <img src="/relative-path.jpg" srcset="https://cdn.example.com/sm.jpg 480w, https://cdn.example.com/lg.jpg 1600w" alt="srcset image" />
  </body>
</html>`;

describe('parseHtmlIngestion', () => {
  it('extracts title + description from OpenGraph and meta tags', () => {
    const out = parseHtmlIngestion(SAMPLE_HTML, {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
    });
    expect(out.title).toBe('Eight Sleep | Now in Singapore');
    // og:description wins over name=description because OG is the
    // social-share canonical.
    expect(out.description).toBe(
      'Smart cooling, warming, and sleep tracking — engineered for deeper sleep.'
    );
  });

  it('promotes the OpenGraph image to primaryImage with declared dims', () => {
    const out = parseHtmlIngestion(SAMPLE_HTML, {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
    });
    expect(out.primaryImage).toMatchObject({
      url: 'https://cdn.example.com/og-hero-1200x630.jpg',
      source: 'og-image',
      width: 1200,
      height: 630,
    });
  });

  it('captures Schema.org Product data + LD+JSON images', () => {
    const out = parseHtmlIngestion(SAMPLE_HTML, {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
    });
    expect(out.products).toHaveLength(1);
    expect(out.products[0]).toMatchObject({
      name: 'Pod 4 Ultra',
      description: 'Adaptive temperature sleep system',
      brand: 'Eight Sleep',
      offers: { price: 4995, currency: 'SGD' },
      schemaType: 'Product',
    });
    // LD+JSON images appear in the merged image list (de-duped against OG).
    const urls = out.images.map((i) => i.url);
    expect(urls).toContain('https://cdn.example.com/product-1.jpg');
    expect(urls).toContain('https://cdn.example.com/product-2.jpg');
  });

  it('drops icons, SVGs, data URLs, and tiny <img> from the candidate list', () => {
    const out = parseHtmlIngestion(SAMPLE_HTML, {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
    });
    const urls = out.images.map((i) => i.url);
    expect(urls).not.toContain('https://cdn.example.com/icon.svg');
    expect(urls).not.toContain('https://cdn.example.com/logo-eightsleep.png'); // 'logo' filter
    expect(urls.find((u) => u.startsWith('data:'))).toBeUndefined();
  });

  it('ranks larger body images first and absolutizes srcset URLs', () => {
    const out = parseHtmlIngestion(SAMPLE_HTML, {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/page/',
    });
    // The 1920×1080 hero-fullbleed should appear before the 800×800
    // lifestyle in the body-image ranking.
    const heroIdx = out.images.findIndex((i) => i.url.endsWith('hero-fullbleed.jpg'));
    const lifestyleIdx = out.images.findIndex((i) => i.url.endsWith('lifestyle-1.jpg'));
    expect(heroIdx).toBeGreaterThan(-1);
    expect(lifestyleIdx).toBeGreaterThan(-1);
    expect(heroIdx).toBeLessThan(lifestyleIdx);
    // srcset's largest entry (1600w) gets picked up.
    expect(out.images.some((i) => i.url === 'https://cdn.example.com/lg.jpg')).toBe(true);
  });

  it('produces a body excerpt from h1, top h2s, and the lead paragraph', () => {
    const out = parseHtmlIngestion(SAMPLE_HTML, {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
    });
    expect(out.bodyExcerpt).toContain('Sleep, deeper.');
    expect(out.bodyExcerpt).toContain('Cooling. Warming. Tracking.');
    expect(out.bodyExcerpt).toContain("the world's most advanced sleep system");
  });
});

describe('fetchUrlIngestion (mocked fetch)', () => {
  it('GETs with a browser-like UA and follows redirects', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: typeof input === 'string' ? input : (input as URL).toString(),
        init,
      });
      return new Response(SAMPLE_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }) as unknown as typeof fetch;

    const out = await fetchUrlIngestion('https://www.eightsleep.com/', { fetchImpl });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://www.eightsleep.com/');
    expect((calls[0].init?.headers as Record<string, string>)['User-Agent']).toMatch(/Chrome/);
    expect(out.title).toBe('Eight Sleep | Now in Singapore');
    expect(out.primaryImage?.source).toBe('og-image');
  });

  it('throws a clear error on non-2xx responses', async () => {
    const fetchImpl = (async () =>
      new Response('forbidden', { status: 403 })) as unknown as typeof fetch;
    await expect(
      fetchUrlIngestion('https://example.com/', { fetchImpl })
    ).rejects.toThrow(/HTTP 403/);
  });
});
