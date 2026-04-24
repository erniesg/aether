import { describe, expect, it } from 'vitest';
import { buildGuidanceReferencePixels } from './guidanceReference';

function pixel(px: Uint8ClampedArray, w: number, x: number, y: number) {
  const i = (y * w + x) * 4;
  return { r: px[i]!, g: px[i + 1]!, b: px[i + 2]!, a: px[i + 3]! };
}

describe('buildGuidanceReferencePixels', () => {
  it('returns a neutral-gray buffer when no regions and no focus are given', () => {
    const px = buildGuidanceReferencePixels({
      width: 10,
      height: 10,
      avoidanceRegions: [],
    });
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const p = pixel(px, 10, x, y);
        expect(p.r).toBe(200);
        expect(p.a).toBe(255);
      }
    }
  });

  it('paints the focus area white and leaves the rest neutral', () => {
    const px = buildGuidanceReferencePixels({
      width: 20,
      height: 20,
      avoidanceRegions: [],
      focusArea: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
    });
    // Inside focus → white
    expect(pixel(px, 20, 10, 10).r).toBe(255);
    // Outside focus → neutral
    expect(pixel(px, 20, 1, 1).r).toBe(200);
  });

  it('paints avoidance regions tinted red over the neutral', () => {
    const px = buildGuidanceReferencePixels({
      width: 20,
      height: 20,
      avoidanceRegions: [{ rect: { x: 0, y: 0, w: 1, h: 0.2 } }],
    });
    // Inside avoidance (top band)
    const top = pixel(px, 20, 10, 2);
    expect(top.r).toBeGreaterThan(top.g);
    expect(top.r).toBeGreaterThan(top.b);
    // Below the band → neutral
    const mid = pixel(px, 20, 10, 10);
    expect(mid.r).toBe(200);
  });

  it('avoidance paint overrides focus where they overlap (avoidance is the stronger signal)', () => {
    const px = buildGuidanceReferencePixels({
      width: 20,
      height: 20,
      focusArea: { x: 0, y: 0, w: 1, h: 1 },
      avoidanceRegions: [{ rect: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 } }],
    });
    const overlap = pixel(px, 20, 10, 10);
    expect(overlap.r).toBeGreaterThan(overlap.g);
    expect(overlap.r).toBeGreaterThan(overlap.b);
  });

  it('clips rects that extend outside the canvas without throwing', () => {
    const px = buildGuidanceReferencePixels({
      width: 10,
      height: 10,
      avoidanceRegions: [{ rect: { x: -0.3, y: 0.5, w: 0.6, h: 0.8 } }],
    });
    expect(px.length).toBe(10 * 10 * 4);
  });
});
