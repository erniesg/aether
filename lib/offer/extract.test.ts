import { describe, expect, it } from 'vitest';
import {
  clipboardUrl,
  extractClaimsFromHtml,
  extractFromClipboard,
  extractFromFiles,
  extractFromHtml,
  extractHeroImagesFromHtml,
  extractJsonLdOffer,
  extractPriceTiersFromHtml,
  extractProofFromHtml,
} from './extract';

describe('offer · extractClaimsFromHtml', () => {
  it('picks up bullet list items and sub-headers as claim candidates', () => {
    const html = `
      <h2>Why creators love it</h2>
      <ul>
        <li>Ships in 2-4 business days</li>
        <li>Fragrance-free and barrier-first</li>
        <li>Made in small batches</li>
      </ul>
      <h3>Bundled with</h3>
    `;
    const claims = extractClaimsFromHtml(html);
    expect(claims).toEqual(
      expect.arrayContaining([
        'Ships in 2-4 business days',
        'Fragrance-free and barrier-first',
        'Made in small batches',
        'Why creators love it',
      ])
    );
  });

  it('preserves compound-word hyphens (golden-hour, 2-4)', () => {
    const html = `
      <ul>
        <li>Golden-hour packshots, every drop</li>
        <li>2-4 day turnarounds</li>
      </ul>
    `;
    const claims = extractClaimsFromHtml(html);
    expect(claims).toEqual(
      expect.arrayContaining([
        'Golden-hour packshots, every drop',
        '2-4 day turnarounds',
      ])
    );
    for (const c of claims) {
      expect(c).not.toMatch(/goldenhour/);
    }
  });
});

describe('offer · extractProofFromHtml', () => {
  it('picks up blockquote testimonials and stat-like lines', () => {
    const html = `
      <blockquote>Changed my morning routine.</blockquote>
      <span>4.8★ across 3,214 reviews</span>
      <cite>— Mia, Melbourne</cite>
    `;
    const proof = extractProofFromHtml(html);
    expect(proof.some((p) => p.includes('Changed my morning routine'))).toBe(true);
    expect(proof.some((p) => /4\.8★/.test(p) || /3,214 reviews/i.test(p))).toBe(true);
  });
});

describe('offer · extractPriceTiersFromHtml', () => {
  it('parses schema.org offers JSON-LD', () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Spring Reset Duo",
        "offers": {
          "@type": "Offer",
          "price": "58.00",
          "priceCurrency": "USD",
          "validFrom": "2026-04-30",
          "validThrough": "2026-05-31"
        }
      }
      </script>
    `;
    const tiers = extractPriceTiersFromHtml(html);
    expect(tiers.length).toBeGreaterThan(0);
    expect(tiers[0]!.price).toMatch(/USD\s?58\.00/);
  });

  it('parses prose prices like $29/mo', () => {
    const html = `
      <p>Solo: $29/mo, Team: $99 / month.</p>
    `;
    const tiers = extractPriceTiersFromHtml(html);
    expect(tiers.some((t) => t.price === '$29' && t.period === 'mo')).toBe(true);
    expect(tiers.some((t) => t.price === '$99')).toBe(true);
  });
});

describe('offer · extractJsonLdOffer', () => {
  it('pulls name, description, hero image, and launch window from schema.org Product', () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Spring Reset Duo",
        "description": "Barrier repair plus golden-hour glow.",
        "image": ["https://cdn.example.com/duo.jpg"],
        "offers": {
          "@type": "Offer",
          "price": "58.00",
          "priceCurrency": "USD",
          "validFrom": "2026-04-30",
          "validThrough": "2026-05-31"
        }
      }
      </script>
    `;
    const out = extractJsonLdOffer(html);
    expect(out.name).toBe('Spring Reset Duo');
    expect(out.tagline).toMatch(/Barrier repair/);
    expect(out.heroImageCandidates?.[0]?.url).toBe('https://cdn.example.com/duo.jpg');
    expect(out.launchWindow).toEqual({ startAt: '2026-04-30', endAt: '2026-05-31' });
  });

  it('tolerates malformed JSON-LD without throwing', () => {
    const html = `<script type="application/ld+json">{ not: valid }</script>`;
    expect(() => extractJsonLdOffer(html)).not.toThrow();
  });
});

describe('offer · extractHeroImagesFromHtml', () => {
  it('collects og:image + <img> candidates, drops obvious logo / icon / pixel matches', () => {
    const html = `
      <meta property="og:image" content="/hero/amber-duo.jpg" />
      <img src="/logo.svg" alt="Solstice logo" />
      <img src="/tracker.gif" alt="tracking pixel" />
      <img src="/spring-duo.jpg" alt="Spring Reset Duo bottle pair" />
    `;
    const heroes = extractHeroImagesFromHtml(html, 'https://solsticeskin.com/');
    expect(heroes.some((h) => h.url === 'https://solsticeskin.com/hero/amber-duo.jpg')).toBe(true);
    expect(heroes.some((h) => h.url.endsWith('/spring-duo.jpg'))).toBe(true);
    expect(heroes.some((h) => h.url.endsWith('/logo.svg'))).toBe(false);
    expect(heroes.some((h) => h.url.endsWith('/tracker.gif'))).toBe(false);
  });
});

describe('offer · extractFromHtml', () => {
  const HTML = `
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
            "validFrom": "2026-04-30"
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

  it('pulls name, tagline, claims, prices, proof, hero images, and launch window', () => {
    const extract = extractFromHtml(HTML, 'https://solsticeskin.com/');
    expect(extract.name).toBe('Spring Reset Duo');
    expect(extract.tagline).toMatch(/golden-hour glow/);
    expect(extract.claims).toEqual(
      expect.arrayContaining(['Ceramide cleanse', 'Niacinamide glow'])
    );
    expect(extract.claims.some((c) => c.includes('Fragrance-free'))).toBe(true);
    expect(extract.priceCandidates.some((t) => /58\.00/.test(t.price))).toBe(true);
    expect(extract.proofCandidates.some((p) => p.includes('morning routine'))).toBe(true);
    expect(extract.heroImageCandidates.some((h) => h.url.includes('duo'))).toBe(true);
    expect(extract.launchWindow?.startAt).toBe('2026-04-30');
  });
});

describe('offer · extractFromFiles', () => {
  it('pulls name (H1), tagline, bullet claims, and quoted proof from a plain-text bundle', () => {
    const extract = extractFromFiles({
      texts: [
        `# Spring Reset Duo\n\nTagline: Barrier repair plus golden-hour glow.\n\n- Ceramide cleanse\n- Niacinamide glow\n- Fragrance-free\n\n"Changed my morning routine." — Mia\n\nLaunches: 2026-04-30`,
      ],
      images: [
        { url: 'https://cdn.example.com/duo.jpg', alt: 'amber bottle pair' },
        { url: 'https://cdn.example.com/logo.svg', alt: 'Solstice logo' },
      ],
    });
    expect(extract.name).toBe('Spring Reset Duo');
    expect(extract.tagline).toMatch(/golden-hour glow/);
    expect(extract.claims).toEqual(
      expect.arrayContaining(['Ceramide cleanse', 'Niacinamide glow', 'Fragrance-free'])
    );
    expect(extract.proofCandidates.some((p) => p.includes('morning routine'))).toBe(true);
    expect(extract.launchWindow?.startAt).toBe('2026-04-30');
    expect(extract.heroImageCandidates).toEqual([
      { url: 'https://cdn.example.com/duo.jpg', alt: 'amber bottle pair' },
    ]);
  });

  it('preserves compound-word hyphens when stripping markdown', () => {
    const extract = extractFromFiles({
      texts: [`- Golden-hour glow\n- Barrier-first formulas`],
    });
    expect(extract.claims).toEqual(['Golden-hour glow', 'Barrier-first formulas']);
  });
});

describe('offer · extractFromClipboard', () => {
  it('parses HTML clipboard contents via the HTML path', () => {
    const extract = extractFromClipboard({
      html: `<h1>Spring Reset Duo</h1><ul><li>Ceramide cleanse</li></ul>`,
    });
    expect(extract.name).toBe('Spring Reset Duo');
    expect(extract.claims).toEqual(expect.arrayContaining(['Ceramide cleanse']));
  });

  it('parses plain-text clipboard contents via the files path', () => {
    const extract = extractFromClipboard({
      text: `# Spring Reset Duo\n\n- Ceramide cleanse\n- Niacinamide glow`,
    });
    expect(extract.name).toBe('Spring Reset Duo');
    expect(extract.claims).toEqual(expect.arrayContaining(['Ceramide cleanse', 'Niacinamide glow']));
  });
});

describe('offer · clipboardUrl', () => {
  it('recognises a single-URL paste in text or url fields', () => {
    expect(clipboardUrl({ text: 'https://solsticeskin.com/duo' })).toBe(
      'https://solsticeskin.com/duo'
    );
    expect(clipboardUrl({ url: 'https://solsticeskin.com/duo  ' })).toBe(
      'https://solsticeskin.com/duo'
    );
  });

  it('returns null when the clipboard is prose containing a URL', () => {
    expect(
      clipboardUrl({ text: 'check out https://solsticeskin.com/duo it is great' })
    ).toBeNull();
  });
});
