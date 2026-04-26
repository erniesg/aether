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

// Extended fixture with brand palette, fonts, and logo signals
const BRAND_HTML = `<!doctype html>
<html>
  <head>
    <title>Acme Brand Co.</title>
    <meta property="og:description" content="Great products." />
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
    <link rel="icon" type="image/svg+xml" href="/icons/logo.svg" />
    <link rel="icon" href="/favicon.ico" />
    <meta property="og:logo" content="https://cdn.acme.com/og-logo.png" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Playfair+Display:ital,wght@0,400;1,700" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Mono" />
    <style>
      :root {
        --brand-primary: #1a1a2e;
        --color-secondary: #e94560;
        --accent: #0f3460;
        --background: #f5f5f5;
        --fg: #333333;
        --border-color: #cccccc;
        --spacing-md: 16px;
      }
      body { font-family: 'Inter', sans-serif; }
      h1 { font-family: "Playfair Display", serif; }
      .btn { font-family: 'Inter', sans-serif; background-color: #1a1a2e; color: #f5f5f5; }
    </style>
  </head>
  <body>
    <header style="background: #1a1a2e; color: #ffffff;">
      <img src="/logo.png" alt="Acme logo" width="160" height="40" />
      <nav style="color: #e94560;">Navigation</nav>
      <button style="background: #0f3460; color: #f5f5f5;">Shop Now</button>
    </header>
    <h1>Welcome to Acme</h1>
    <p>Great products for everyone.</p>
  </body>
</html>`;

// Fixture with only inline-style palette signals (no :root, no Google Fonts)
const INLINE_PALETTE_HTML = `<!doctype html>
<html>
  <head>
    <title>Inline Colors Test</title>
    <meta property="og:description" content="Inline palette." />
    <style>
      .brand { color: #ff6b35; background: #004e89; }
      .accent { color: #ff6b35; }
      .other { color: #1a936f; }
    </style>
  </head>
  <body>
    <header style="background: #004e89; color: #ff6b35;">
      <button style="background: #ff6b35;">CTA</button>
      <button style="background: #ff6b35;">CTA2</button>
      <nav style="background: #1a936f;">nav</nav>
    </header>
    <h1>Test</h1>
  </body>
</html>`;

// Fixture preferring header-img logo (no icon links)
const HEADER_LOGO_HTML = `<!doctype html>
<html>
  <head>
    <title>Header Logo Test</title>
    <meta property="og:description" content="Header logo." />
  </head>
  <body>
    <header>
      <img src="/assets/brand-logo.png" alt="Company Logo" width="200" height="60" />
    </header>
    <h1>Hello</h1>
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

// ---------------------------------------------------------------------------
// Brand palette extraction
// ---------------------------------------------------------------------------
describe('brandPalette extraction', () => {
  it('parses :root CSS custom property tokens into named palette fields', () => {
    const out = parseHtmlIngestion(BRAND_HTML, {
      requestedUrl: 'https://acme.com/',
      finalUrl: 'https://acme.com/',
    });
    expect(out.brandPalette).toBeDefined();
    // --brand-primary maps to primary
    expect(out.brandPalette?.primary).toBe('#1a1a2e');
    // --color-secondary maps to secondary
    expect(out.brandPalette?.secondary).toBe('#e94560');
    // --accent maps to accent
    expect(out.brandPalette?.accent).toBe('#0f3460');
    // --background maps to background
    expect(out.brandPalette?.background).toBe('#f5f5f5');
    // --fg maps to foreground
    expect(out.brandPalette?.foreground).toBe('#333333');
  });

  it('populates brandPalette.all with de-duped hex colors ordered by frequency', () => {
    // In BRAND_HTML, #1a1a2e appears in :root + header inline + .btn background
    // so it should be first in `all`.
    const out = parseHtmlIngestion(BRAND_HTML, {
      requestedUrl: 'https://acme.com/',
      finalUrl: 'https://acme.com/',
    });
    const all = out.brandPalette?.all ?? [];
    expect(all.length).toBeGreaterThan(0);
    // No duplicates
    expect(new Set(all).size).toBe(all.length);
    // Cap at 12
    expect(all.length).toBeLessThanOrEqual(12);
    // The most-referenced color in BRAND_HTML is #1a1a2e
    expect(all[0]).toBe('#1a1a2e');
  });

  it('ranks inline header/button colors by frequency (no :root vars)', () => {
    const out = parseHtmlIngestion(INLINE_PALETTE_HTML, {
      requestedUrl: 'https://test.com/',
      finalUrl: 'https://test.com/',
    });
    const all = out.brandPalette?.all ?? [];
    expect(all.length).toBeGreaterThan(0);
    // #ff6b35 appears most in inline styles (header color, 2x button background, .accent color)
    expect(all[0]).toBe('#ff6b35');
  });

  it('does not include non-color CSS tokens in all[]', () => {
    const out = parseHtmlIngestion(BRAND_HTML, {
      requestedUrl: 'https://acme.com/',
      finalUrl: 'https://acme.com/',
    });
    const all = out.brandPalette?.all ?? [];
    // CSS spacing / non-hex tokens must not appear
    for (const c of all) {
      expect(c).toMatch(/^#[0-9a-f]{3,8}$/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Fonts extraction
// ---------------------------------------------------------------------------
describe('fonts extraction', () => {
  it('parses Google Fonts link tags and returns clean family names', () => {
    const out = parseHtmlIngestion(BRAND_HTML, {
      requestedUrl: 'https://acme.com/',
      finalUrl: 'https://acme.com/',
    });
    expect(out.fonts).toBeDefined();
    expect(out.fonts).toContain('Inter');
    expect(out.fonts).toContain('Playfair Display');
    expect(out.fonts).toContain('Roboto Mono');
  });

  it('parses font-family declarations from inline <style> blocks', () => {
    const out = parseHtmlIngestion(BRAND_HTML, {
      requestedUrl: 'https://acme.com/',
      finalUrl: 'https://acme.com/',
    });
    // 'Inter' and 'Playfair Display' come from both GFonts links AND style declarations —
    // after dedup, they should each appear exactly once.
    const fonts = out.fonts ?? [];
    const interCount = fonts.filter((f) => f === 'Inter').length;
    expect(interCount).toBe(1);
  });

  it('returns at most 6 fonts in order of first occurrence', () => {
    // Build HTML with 8 different google font families
    const manyFontsHtml = `<!doctype html><html><head>
      <title>Many Fonts</title>
      <meta property="og:description" content="Fonts test." />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans&family=Lato&family=Montserrat&family=Oswald&family=Source+Sans+Pro&family=Raleway&family=PT+Sans&family=Nunito" />
    </head><body><h1>hi</h1></body></html>`;
    const out = parseHtmlIngestion(manyFontsHtml, {
      requestedUrl: 'https://test.com/',
      finalUrl: 'https://test.com/',
    });
    expect((out.fonts ?? []).length).toBeLessThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// Logo extraction
// ---------------------------------------------------------------------------
describe('logo extraction', () => {
  it('prefers apple-touch-icon over other logo sources', () => {
    const out = parseHtmlIngestion(BRAND_HTML, {
      requestedUrl: 'https://acme.com/',
      finalUrl: 'https://acme.com/',
    });
    expect(out.logo).toBeDefined();
    expect(out.logo?.source).toBe('apple-touch-icon');
    expect(out.logo?.url).toBe('https://acme.com/icons/apple-touch-icon.png');
  });

  it('falls back to og:logo when no icon links are present', () => {
    const ogLogoHtml = `<!doctype html><html><head>
      <title>OG Logo Test</title>
      <meta property="og:description" content="OG logo." />
      <meta property="og:logo" content="https://cdn.brand.com/logo-og.png" />
    </head><body><h1>hi</h1></body></html>`;
    const out = parseHtmlIngestion(ogLogoHtml, {
      requestedUrl: 'https://brand.com/',
      finalUrl: 'https://brand.com/',
    });
    expect(out.logo?.source).toBe('og-logo');
    expect(out.logo?.url).toBe('https://cdn.brand.com/logo-og.png');
  });

  it('falls back to header <img alt~="logo"> when no icon links or og:logo', () => {
    const out = parseHtmlIngestion(HEADER_LOGO_HTML, {
      requestedUrl: 'https://headerlogo.com/',
      finalUrl: 'https://headerlogo.com/',
    });
    expect(out.logo?.source).toBe('header-img');
    expect(out.logo?.url).toBe('https://headerlogo.com/assets/brand-logo.png');
  });

  it('absolutizes relative logo URLs against finalUrl', () => {
    const out = parseHtmlIngestion(BRAND_HTML, {
      requestedUrl: 'https://acme.com/',
      finalUrl: 'https://acme.com/',
    });
    // apple-touch-icon href="/icons/apple-touch-icon.png" → absolute
    expect(out.logo?.url).toMatch(/^https:\/\//);
  });
});
