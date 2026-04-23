import { describe, expect, it } from 'vitest';
import {
  extractFromFiles,
  extractFromHtml,
  extractFromRepo,
  extractFontFamiliesFromCss,
  extractHexColorsFromText,
  normalizeHex,
  rgbStringToHex,
} from './extract';

describe('brand · extract colour helpers', () => {
  it('normalizeHex expands 3-digit and lowercases 6-digit hexes', () => {
    expect(normalizeHex('#FFF')).toBe('#ffffff');
    expect(normalizeHex('fa3')).toBe('#ffaa33');
    expect(normalizeHex('#0F1013')).toBe('#0f1013');
    expect(normalizeHex('not-a-colour')).toBe(null);
  });

  it('normalizeHex drops the alpha channel from 8-digit hexes', () => {
    expect(normalizeHex('#0F1013FF')).toBe('#0f1013');
  });

  it('rgbStringToHex parses rgb() and rgba()', () => {
    expect(rgbStringToHex('rgb(15, 16, 19)')).toBe('#0f1013');
    expect(rgbStringToHex('rgba(196, 139, 94, 0.8)')).toBe('#c48b5e');
    expect(rgbStringToHex('hsl(200, 50%, 50%)')).toBe(null);
  });

  it('extractHexColorsFromText collects hex + rgb literals', () => {
    const css = `
      :root { --ink: #0F1013; --bone: #E8E4D6; --accent: rgb(196, 139, 94); }
      .stub { color: #7C9885; background: rgba(46,64,87,0.4); }
    `;
    const hexes = extractHexColorsFromText(css);
    expect(hexes).toEqual(
      expect.arrayContaining(['#0f1013', '#e8e4d6', '#c48b5e', '#7c9885', '#2e4057'])
    );
  });
});

describe('brand · extract typography helpers', () => {
  it('extractFontFamiliesFromCss picks quoted + bare families and drops generics', () => {
    const css = `
      body { font-family: "Canela Deck", "Inter", Helvetica, sans-serif; }
      .mono { font-family: "JetBrains Mono", monospace; }
    `;
    const families = extractFontFamiliesFromCss(css);
    expect(families).toEqual(['Canela Deck', 'Inter', 'Helvetica', 'JetBrains Mono']);
  });

  it('extractFontFamiliesFromCss picks up Google Fonts links', () => {
    const html = `
      <link href="https://fonts.googleapis.com/css2?family=Canela+Deck:wght@400;600&display=swap" />
      <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" />
    `;
    const families = extractFontFamiliesFromCss(html);
    expect(families).toEqual(expect.arrayContaining(['Canela Deck', 'Inter']));
  });
});

describe('brand · extractFromHtml', () => {
  const HTML = `
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
          :root { --ink: #0F1013; --bone: #E8E4D6; --sun: #C48B5E; }
          body { font-family: 'Canela Deck', serif; }
        </style>
      </head>
      <body>
        <img src="/logo.svg" alt="Solstice logo" />
        <img src="/spring-duo.jpg" alt="Spring Reset Duo bottle pair" />
        <h1>Slow, certain skincare.</h1>
        <p>Barrier-first formulas for golden-hour mornings. Made quiet.</p>
      </body>
    </html>
  `;

  it('pulls palette, typography, voice, logos, and product images', () => {
    const extract = extractFromHtml(HTML, 'https://solsticeskin.com/');
    expect(extract.hexes).toEqual(
      expect.arrayContaining(['#0f1013', '#e8e4d6', '#c48b5e'])
    );
    expect(extract.families).toEqual(expect.arrayContaining(['Canela Deck']));
    expect(extract.voiceSamples.some((s) => s.includes('Slow, certain skincare'))).toBe(true);
    expect(extract.voiceSamples.some((s) => s.includes('golden-hour mornings'))).toBe(true);
    expect(extract.logoCandidates).toEqual(
      expect.arrayContaining(['https://solsticeskin.com/logo.svg'])
    );
    expect(extract.logoCandidates).toEqual(
      expect.arrayContaining(['https://solsticeskin.com/mark.svg'])
    );
    expect(
      extract.productImageCandidates.some((p) => p.url.endsWith('/spring-duo.jpg'))
    ).toBe(true);
    expect(
      extract.contextLines.some((l) => l.startsWith('title:'))
    ).toBe(true);
  });

  it('does not misclassify product-image alt text as a logo', () => {
    const extract = extractFromHtml(HTML, 'https://solsticeskin.com/');
    expect(
      extract.productImageCandidates.some((p) => p.url.endsWith('/logo.svg'))
    ).toBe(false);
  });
});

describe('brand · extractFromRepo', () => {
  it('picks colours + font families from tailwind.config + theme sources', () => {
    const tailwindConfig = `
      /** @type {import('tailwindcss').Config} */
      module.exports = {
        theme: {
          extend: {
            colors: {
              ink: '#0F1013',
              bone: '#E8E4D6',
              sun: '#C48B5E',
            },
            fontFamily: {
              display: ['Canela Deck', 'serif'],
              body: ['Inter', 'sans-serif'],
              mono: ['JetBrains Mono', 'monospace'],
            }
          }
        }
      }
    `;
    const readme = `
      # Solstice Launch Kit

      Slow, certain skincare for golden-hour mornings. This kit ships the
      brand site, the product pages, and the drop-day reels — all built on
      the same token set so the pack stays coherent.

      ## Structure

      - tokens (palette + type)
      - components
      - tldraw scenes
    `;
    const extract = extractFromRepo(
      { readme, tailwindConfig },
      'https://github.com/solstice/solstice-launch-kit'
    );
    expect(extract.hexes).toEqual(
      expect.arrayContaining(['#0f1013', '#e8e4d6', '#c48b5e'])
    );
    expect(extract.families).toEqual(
      expect.arrayContaining(['Canela Deck', 'Inter', 'JetBrains Mono'])
    );
    expect(extract.voiceSamples.some((s) => s.toLowerCase().includes('golden-hour'))).toBe(true);
    expect(extract.contextLines).toEqual(
      expect.arrayContaining(['repo: https://github.com/solstice/solstice-launch-kit'])
    );
  });
});

describe('brand · extractFromFiles', () => {
  it('pulls colours + families from text and classifies image candidates by alt/url', () => {
    const extract = extractFromFiles({
      texts: [
        `Brand palette: #0F1013, #E8E4D6, #C48B5E.\nDisplay: "Canela Deck", Body: "Inter".`,
        `Slow-morning rituals. Certain, quiet product language.`,
      ],
      images: [
        { url: 'https://cdn.example.com/logo.svg', alt: 'Solstice logo' },
        { url: 'https://cdn.example.com/packshot.jpg', alt: 'Amber bottle packshot' },
      ],
    });
    expect(extract.hexes).toEqual(
      expect.arrayContaining(['#0f1013', '#e8e4d6', '#c48b5e'])
    );
    expect(extract.families).toEqual(expect.arrayContaining(['Canela Deck', 'Inter']));
    expect(extract.voiceSamples.some((s) => s.toLowerCase().includes('slow-morning'))).toBe(true);
    expect(extract.logoCandidates).toEqual(['https://cdn.example.com/logo.svg']);
    expect(extract.productImageCandidates).toEqual([
      { url: 'https://cdn.example.com/packshot.jpg', alt: 'Amber bottle packshot' },
    ]);
  });
});
