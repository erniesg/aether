import { describe, expect, it } from 'vitest';
import { localFallback, parseShapeToolInput } from './shape';
import type { BrandRawExtract } from './types';

const baseExtract: BrandRawExtract = {
  hexes: ['#0f1013', '#e8e4d6', '#c48b5e', '#7c9885', '#2e4057', '#0f1013'],
  families: ['Canela Deck', 'Inter', 'JetBrains Mono'],
  voiceSamples: [
    'Slow, certain skincare.',
    'Barrier-first formulas for golden-hour mornings.',
    'Slow, certain skincare.',
    'Made quiet.',
  ],
  logoCandidates: ['https://solsticeskin.com/logo.svg'],
  productImageCandidates: [{ url: 'https://solsticeskin.com/hero.jpg', alt: 'hero duo' }],
  contextLines: ['title: Solstice Skin'],
};

describe('brand · shape localFallback', () => {
  it('dedupes colours, assigns role hints, and caps palette at 6', () => {
    const snap = localFallback(baseExtract, { kind: 'url', url: 'https://solsticeskin.com' });
    expect(snap.palette.map((p) => p.hex)).toEqual([
      '#0f1013',
      '#e8e4d6',
      '#c48b5e',
      '#7c9885',
      '#2e4057',
    ]);
    expect(snap.palette[0]!.role).toBe('primary');
    expect(snap.palette[1]!.role).toBe('accent');
    expect(snap.palette[2]!.role).toBe('neutral');
    expect(snap.palette[3]!.role).toBe('bg');
  });

  it('assigns display/body/mono to the first three font families', () => {
    const snap = localFallback(baseExtract, { kind: 'url' });
    expect(snap.typography).toEqual([
      { family: 'Canela Deck', role: 'display' },
      { family: 'Inter', role: 'body' },
      { family: 'JetBrains Mono', role: 'mono' },
    ]);
  });

  it('dedupes voice samples and keeps up to three', () => {
    const snap = localFallback(baseExtract, { kind: 'url' });
    expect(snap.voice.samples).toEqual([
      'Slow, certain skincare.',
      'Barrier-first formulas for golden-hour mornings.',
      'Made quiet.',
    ]);
  });

  it('produces a high-confidence snapshot when palette + type + voice all landed', () => {
    const snap = localFallback(baseExtract, { kind: 'url' });
    expect(snap.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('produces a review-worthy snapshot when the scrape is thin', () => {
    const thin: BrandRawExtract = {
      hexes: ['#0f1013'],
      families: [],
      voiceSamples: [],
      logoCandidates: [],
      productImageCandidates: [],
      contextLines: [],
    };
    const snap = localFallback(thin, { kind: 'files' });
    expect(snap.confidence).toBeLessThan(0.5);
  });
});

describe('brand · parseShapeToolInput', () => {
  it('accepts a well-formed tool call payload', () => {
    const snap = parseShapeToolInput(
      {
        palette: [
          { hex: '#0F1013', role: 'primary' },
          { hex: '#E8E4D6' },
        ],
        typography: [{ family: 'Canela Deck', role: 'display' }],
        voice: {
          samples: ['Slow, certain skincare.'],
          tone: ['quiet', 'certain'],
        },
        logos: [{ url: 'https://solsticeskin.com/logo.svg', background: 'light' }],
        productImages: [{ url: 'https://solsticeskin.com/hero.jpg', alt: 'hero duo' }],
        confidence: 0.72,
      },
      { kind: 'url', url: 'https://solsticeskin.com' }
    );
    expect(snap.palette).toEqual([
      { hex: '#0f1013', role: 'primary' },
      { hex: '#e8e4d6' },
    ]);
    expect(snap.typography).toEqual([{ family: 'Canela Deck', role: 'display' }]);
    expect(snap.voice).toEqual({
      samples: ['Slow, certain skincare.'],
      tone: ['quiet', 'certain'],
    });
    expect(snap.logos).toEqual([
      { url: 'https://solsticeskin.com/logo.svg', background: 'light' },
    ]);
    expect(snap.productImages).toEqual([
      { url: 'https://solsticeskin.com/hero.jpg', alt: 'hero duo' },
    ]);
    expect(snap.confidence).toBe(0.72);
    expect(snap.source).toEqual({ kind: 'url', url: 'https://solsticeskin.com' });
  });

  it('clamps confidence into 0..1', () => {
    const snap = parseShapeToolInput(
      { palette: [], typography: [], voice: { samples: [] }, confidence: 1.7 },
      { kind: 'files' }
    );
    expect(snap.confidence).toBe(1);
  });

  it('drops malformed palette entries', () => {
    const snap = parseShapeToolInput(
      {
        palette: [{ hex: 'not-a-colour' }, { hex: '#fff', role: 'primary' }, null, 42],
        typography: [],
        voice: { samples: [] },
        confidence: 0.3,
      },
      { kind: 'files' }
    );
    expect(snap.palette).toEqual([{ hex: '#ffffff', role: 'primary' }]);
  });
});
