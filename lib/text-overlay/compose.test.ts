import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  buildFormatSvg,
  cropAndResize,
  composeVariantSet,
  COMPOSE_FORMATS,
  COMPOSE_LOCALES,
} from './compose';
import type { ProposedTextOverlay } from '@/lib/agent/text-apply';
import { asBCP47LocaleCode } from '@/lib/text-overlay/types';

// ProposedTextOverlay.content is keyed by branded BCP47LocaleCode. Build a
// content map from raw locale strings so the test fixtures stay readable.
function makeContent(map: Record<string, string>): Record<
  ReturnType<typeof asBCP47LocaleCode>,
  string
> {
  const out = {} as Record<ReturnType<typeof asBCP47LocaleCode>, string>;
  for (const [k, v] of Object.entries(map)) {
    out[asBCP47LocaleCode(k)] = v;
  }
  return out;
}

/**
 * Synthetic hero: a 1024² PNG with a coloured horizontal band so the crop
 * geometry tests can verify which slice of the source survived per format.
 * Top half mid-grey, bottom half deep blue.
 */
async function makeSyntheticHero(): Promise<Buffer> {
  const halfH = 512;
  const top = await sharp({
    create: {
      width: 1024,
      height: halfH,
      channels: 3,
      background: { r: 100, g: 100, b: 100 },
    },
  })
    .png()
    .toBuffer();
  const bottom = await sharp({
    create: {
      width: 1024,
      height: halfH,
      channels: 3,
      background: { r: 20, g: 40, b: 120 },
    },
  })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite([
      { input: top, top: 0, left: 0 },
      { input: bottom, top: halfH, left: 0 },
    ])
    .png()
    .toBuffer();
}

const SAMPLE_OVERLAYS: ProposedTextOverlay[] = [
  {
    zone: {
      purpose: 'headline',
      bbox: { x: 0.05, y: 0.05, w: 0.9, h: 0.18 },
      mustSurviveAllCrops: true,
    },
    content: makeContent({
      'en-SG': 'Sleep deeper than the city',
      'zh-Hans-SG': '沉睡，比城市更深',
      'ms-SG': 'Tidur lebih dalam dari kota',
      'ta-SG': 'நகரத்தை விட ஆழ்ந்த உறக்கம்',
    }),
    textAlign: 'center',
  },
  {
    zone: {
      purpose: 'caption',
      bbox: { x: 0.05, y: 0.78, w: 0.9, h: 0.17 },
      mustSurviveAllCrops: true,
    },
    content: makeContent({
      'en-SG': 'Pod 4 Ultra cools, warms, tracks every breath.',
      'zh-Hans-SG': 'Pod 4 Ultra 自动调温，记录每次呼吸。',
      'ms-SG': 'Pod 4 Ultra menyejuk, memanas, menjejak setiap nafas.',
      'ta-SG': 'Pod 4 Ultra குளிர்விக்கும், சூடேற்றும்.',
    }),
    textAlign: 'center',
  },
];

describe('buildFormatSvg', () => {
  it('emits an SVG with both headline and caption text nodes when both supplied', () => {
    const svg = buildFormatSvg({
      format: COMPOSE_FORMATS[0],
      locale: 'en-SG',
      headline: 'Sleep deeper',
      caption: 'Tracks every breath.',
    });
    expect(svg).toContain('Sleep deeper');
    expect(svg).toContain('Tracks every breath');
    expect(svg).toMatch(/<text[^>]*>/);
  });

  it('escapes XML-special chars defensively', () => {
    const svg = buildFormatSvg({
      format: COMPOSE_FORMATS[0],
      locale: 'en-SG',
      headline: '5 < 10 & "quoted"',
    });
    expect(svg).toContain('5 &lt; 10 &amp;');
    expect(svg).toContain('&quot;quoted&quot;');
  });

  it('uses CJK-aware font stack for zh-Hans-SG', () => {
    const svg = buildFormatSvg({
      format: COMPOSE_FORMATS[1],
      locale: 'zh-Hans-SG',
      headline: '沉睡',
    });
    expect(svg).toContain('PingFang SC');
  });

  it('uses Tamil font stack for ta-SG', () => {
    const svg = buildFormatSvg({
      format: COMPOSE_FORMATS[2],
      locale: 'ta-SG',
      headline: 'நகரம்',
    });
    expect(svg).toContain('Tamil MN');
  });
});

describe('cropAndResize', () => {
  it('produces an exact-aspect crop for portrait 9:16', async () => {
    const hero = await makeSyntheticHero();
    const cropped = await cropAndResize(hero, COMPOSE_FORMATS[2]); // 9x16: 1080×1920
    const meta = await sharp(cropped).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });

  it('produces an exact-aspect crop for landscape 16:9', async () => {
    const hero = await makeSyntheticHero();
    const cropped = await cropAndResize(hero, COMPOSE_FORMATS[3]); // 16x9: 1920×1080
    const meta = await sharp(cropped).metadata();
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(1080);
  });

  it('passes 1:1 source through to 1:1 target', async () => {
    const hero = await makeSyntheticHero();
    const cropped = await cropAndResize(hero, COMPOSE_FORMATS[0]); // 1x1: 1024²
    const meta = await sharp(cropped).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
  });
});

describe('composeVariantSet', () => {
  it('produces 16 tiles (4 formats × 4 locales) and one atlas', async () => {
    const hero = await makeSyntheticHero();
    const out = await composeVariantSet({
      heroBytes: hero,
      textOverlays: SAMPLE_OVERLAYS,
    });

    // 4 formats × 4 locales = 16 keys.
    expect(out.tiles.size).toBe(16);
    for (const format of COMPOSE_FORMATS) {
      for (const locale of COMPOSE_LOCALES) {
        const key = `${format.id}-${locale}`;
        const buf = out.tiles.get(key);
        expect(buf, `tile ${key} missing`).toBeInstanceOf(Buffer);
        expect(buf!.length).toBeGreaterThan(0);
      }
    }

    // Atlas: cols × atlasCellWidth (uniform col width). Row image height
    // is per-format aspect — 9x16 rows tall, 16x9 rows short — so the
    // total atlas height is the sum of every row's cell height, NOT
    // 4 × atlasCellHeight (that was the old uniform-square layout).
    const atlasMeta = await sharp(out.atlas).metadata();
    expect(atlasMeta.width).toBe(
      out.atlasCellWidth * COMPOSE_LOCALES.length
    );
    expect(atlasMeta.width).toBe(out.atlasWidth);
    expect(atlasMeta.height).toBe(out.atlasHeight);
    const expectedH = COMPOSE_FORMATS.reduce(
      (sum, f) => sum + out.atlasRowHeights[f.id],
      0
    );
    expect(atlasMeta.height).toBe(expectedH);
    expect(out.atlasCellWidth).toBe(out.atlasTileSize);
    // 9x16 row must be the tallest, 16x9 the shortest — that's what makes
    // the atlas show each format at its native aspect.
    expect(out.atlasRowHeights['9x16']).toBeGreaterThan(
      out.atlasRowHeights['1x1']
    );
    expect(out.atlasRowHeights['16x9']).toBeLessThan(
      out.atlasRowHeights['1x1']
    );
  });

  it('falls back to fallbackCaptions when textOverlays is absent', async () => {
    const hero = await makeSyntheticHero();
    const out = await composeVariantSet({
      heroBytes: hero,
      fallbackCaptions: {
        'en-SG': 'IKEA SG sustainable furniture',
        'zh-Hans-SG': '宜家新加坡可持续家具',
        'ms-SG': 'Perabot mampan IKEA SG',
        'ta-SG': 'IKEA SG நீடித்த தளபாடங்கள்',
      },
    });
    expect(out.tiles.size).toBe(16);
    expect(out.atlas.length).toBeGreaterThan(0);
  });

  it('falls back to en-SG when a target locale is missing from textOverlays', async () => {
    const hero = await makeSyntheticHero();
    const partial: ProposedTextOverlay[] = [
      {
        zone: SAMPLE_OVERLAYS[0].zone,
        content: makeContent({ 'en-SG': 'English only' }),
        textAlign: 'center',
      },
    ];
    // Should not throw. Tiles for ms-SG / ta-SG / zh-Hans-SG should still
    // compose (using en-SG fallback).
    const out = await composeVariantSet({
      heroBytes: hero,
      textOverlays: partial,
    });
    expect(out.tiles.size).toBe(16);
  });

  it('runs all 16 tile composes concurrently (timing sanity check)', async () => {
    const hero = await makeSyntheticHero();
    const t0 = Date.now();
    await composeVariantSet({
      heroBytes: hero,
      textOverlays: SAMPLE_OVERLAYS,
    });
    const elapsed = Date.now() - t0;
    // 16 tiles, each ~50-150ms sequentially would be 800-2400ms; with
    // Promise.all we expect well under that on modern hardware. Generous
    // upper bound to keep CI stable.
    expect(elapsed).toBeLessThan(8000);
  }, 12000);
});
