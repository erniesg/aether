import { describe, expect, it } from 'vitest';
import { cropHeroToFormats } from './cropToFormat';
import type { SafeZone } from '@/lib/types/semantic-component';

const HERO_2K = { width: 2048, height: 2048 };

const FORMATS = [
  { id: 'ig-post', w: 1080, h: 1350 }, // 4:5
  { id: 'story', w: 1080, h: 1920 }, // 9:16
  { id: 'reel-cover', w: 1080, h: 1920 }, // 9:16
  { id: 'linkedin', w: 1200, h: 627 }, // ~1.91:1 (landscape banner)
];

describe('cropHeroToFormats', () => {
  it('produces one crop entry per format', () => {
    const out = cropHeroToFormats({ heroAsset: HERO_2K, formats: FORMATS });
    expect(out).toHaveLength(FORMATS.length);
    expect(out.map((c) => c.formatId)).toEqual([
      'ig-post',
      'story',
      'reel-cover',
      'linkedin',
    ]);
  });

  it('falls back to centered crop when no safe zones supplied', () => {
    const out = cropHeroToFormats({ heroAsset: HERO_2K, formats: FORMATS });
    for (const c of out) {
      expect(c.fit).toBe('centered-fallback');
      expect(c.clippedZones).toEqual([]);
      // Crop should be centered: midpoint of topLeft/bottomRight ≈ 0.5
      const midX = (c.crop.topLeft.x + c.crop.bottomRight.x) / 2;
      const midY = (c.crop.topLeft.y + c.crop.bottomRight.y) / 2;
      expect(midX).toBeCloseTo(0.5, 4);
      expect(midY).toBeCloseTo(0.5, 4);
    }
  });

  it('produces the correct crop aspect ratio for each format', () => {
    const out = cropHeroToFormats({ heroAsset: HERO_2K, formats: FORMATS });
    for (const c of out) {
      const cropW = (c.crop.bottomRight.x - c.crop.topLeft.x) * HERO_2K.width;
      const cropH = (c.crop.bottomRight.y - c.crop.topLeft.y) * HERO_2K.height;
      const cropAspect = cropW / cropH;
      const formatAspect = c.format.w / c.format.h;
      expect(cropAspect).toBeCloseTo(formatAspect, 3);
    }
  });

  it('preserves a centered safe zone in every format crop (fitted)', () => {
    // 50% × 50% block centered — sized to survive even the narrowest target
    // aspect (9:16 = 56.25% width when cropped from a 1:1 hero).
    const safeZones: SafeZone[] = [
      { purpose: 'hero', bbox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
    ];
    const out = cropHeroToFormats({
      heroAsset: HERO_2K,
      formats: FORMATS,
      safeZones,
    });
    for (const c of out) {
      expect(c.fit).toBe('fitted');
      expect(c.clippedZones).toEqual([]);
    }
  });

  it('respects mustSurviveAllCrops=false zones (treats them as ignorable)', () => {
    const safeZones: SafeZone[] = [
      // hero must survive
      { purpose: 'hero', bbox: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 } },
      // headline at the very top — okay to clip
      {
        purpose: 'headline',
        bbox: { x: 0, y: 0, w: 1, h: 0.15 },
        mustSurviveAllCrops: false,
      },
    ];
    const out = cropHeroToFormats({
      heroAsset: HERO_2K,
      formats: [{ id: 'square-tight', w: 600, h: 600 }],
      safeZones,
    });
    expect(out[0].fit).toBe('fitted');
    expect(out[0].clippedZones).toEqual([]);
  });

  it('reports clippedZones (fit="partial") when geometry cannot fit a must-survive zone', () => {
    // A safe zone that spans nearly the full frame — guaranteed to be clipped
    // by any narrow-aspect crop.
    const safeZones: SafeZone[] = [
      { purpose: 'hero', bbox: { x: 0, y: 0, w: 1, h: 1 } },
    ];
    const out = cropHeroToFormats({
      heroAsset: HERO_2K,
      formats: [{ id: 'banner', w: 1200, h: 200 }],
      safeZones,
    });
    expect(out[0].fit).toBe('partial');
    expect(out[0].clippedZones).toHaveLength(1);
    expect(out[0].clippedZones[0].purpose).toBe('hero');
  });

  it('shifts the crop window toward the safe-zone bounding box', () => {
    // Subject is in the upper-left of the hero. A 9:16 (vertical) crop on a
    // square hero should shift LEFT to keep the subject in.
    const safeZones: SafeZone[] = [
      { purpose: 'hero', bbox: { x: 0.05, y: 0.1, w: 0.3, h: 0.4 } },
    ];
    const out = cropHeroToFormats({
      heroAsset: HERO_2K,
      formats: [{ id: 'story', w: 1080, h: 1920 }],
      safeZones,
    });
    expect(out[0].fit).toBe('fitted');
    // The crop's left edge should sit at x=0 (clamped) since the subject is
    // far to the left — center-on-bbox would have placed cropX < 0.
    expect(out[0].crop.topLeft.x).toBeCloseTo(0, 4);
  });

  it('returns crop coordinates in [0,1] regardless of subject placement', () => {
    const safeZones: SafeZone[] = [
      { purpose: 'hero', bbox: { x: 0.95, y: 0.95, w: 0.04, h: 0.04 } },
    ];
    const out = cropHeroToFormats({
      heroAsset: HERO_2K,
      formats: FORMATS,
      safeZones,
    });
    for (const c of out) {
      expect(c.crop.topLeft.x).toBeGreaterThanOrEqual(0);
      expect(c.crop.topLeft.y).toBeGreaterThanOrEqual(0);
      expect(c.crop.bottomRight.x).toBeLessThanOrEqual(1.000001);
      expect(c.crop.bottomRight.y).toBeLessThanOrEqual(1.000001);
    }
  });

  it('throws on a zero-dimension hero', () => {
    expect(() =>
      cropHeroToFormats({ heroAsset: { width: 0, height: 100 }, formats: FORMATS })
    ).toThrow();
  });

  it('throws on a zero-dimension format', () => {
    expect(() =>
      cropHeroToFormats({
        heroAsset: HERO_2K,
        formats: [{ id: 'bogus', w: 0, h: 1080 }],
      })
    ).toThrow();
  });

  it('returns each format’s exact pixel w/h on the result', () => {
    const out = cropHeroToFormats({ heroAsset: HERO_2K, formats: FORMATS });
    expect(out.find((c) => c.formatId === 'ig-post')?.w).toBe(1080);
    expect(out.find((c) => c.formatId === 'ig-post')?.h).toBe(1350);
    expect(out.find((c) => c.formatId === 'linkedin')?.w).toBe(1200);
    expect(out.find((c) => c.formatId === 'linkedin')?.h).toBe(627);
  });

  it('handles a non-square hero (3:2 landscape) with portrait + landscape formats', () => {
    const hero = { width: 3000, height: 2000 };
    const out = cropHeroToFormats({
      heroAsset: hero,
      formats: [
        { id: 'square', w: 1080, h: 1080 },
        { id: 'wide', w: 2400, h: 1000 },
      ],
    });
    // Square crop on 3:2 hero: crop height = full 2000, width = 2000 → ratio 1:1
    const sq = out.find((c) => c.formatId === 'square')!;
    const sqWidth = (sq.crop.bottomRight.x - sq.crop.topLeft.x) * hero.width;
    const sqHeight = (sq.crop.bottomRight.y - sq.crop.topLeft.y) * hero.height;
    expect(sqWidth / sqHeight).toBeCloseTo(1, 3);
    // Wide (2400×1000 = 2.4:1) is wider than hero (3:2 = 1.5:1) → crop width
    // = full 3000, crop height = 3000 / 2.4 = 1250.
    const wide = out.find((c) => c.formatId === 'wide')!;
    const wideWidth = (wide.crop.bottomRight.x - wide.crop.topLeft.x) * hero.width;
    const wideHeight = (wide.crop.bottomRight.y - wide.crop.topLeft.y) * hero.height;
    expect(wideWidth).toBeCloseTo(3000, 0);
    expect(wideHeight).toBeCloseTo(1250, 0);
  });
});
