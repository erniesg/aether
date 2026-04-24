import { describe, expect, it } from 'vitest';
import { buildMaskPixels, type MaskStroke } from './maskRaster';

function pixelAt(
  pixels: Uint8ClampedArray,
  w: number,
  x: number,
  y: number
): { r: number; g: number; b: number; a: number } {
  const idx = (y * w + x) * 4;
  return { r: pixels[idx]!, g: pixels[idx + 1]!, b: pixels[idx + 2]!, a: pixels[idx + 3]! };
}

describe('buildMaskPixels', () => {
  it('produces a fully opaque white mask when there are no strokes (openai convention)', () => {
    const pixels = buildMaskPixels([], 10, 10, 'openai');
    expect(pixels.length).toBe(10 * 10 * 4);
    for (let i = 0; i < 10 * 10; i++) {
      const p = pixelAt(pixels, 10, i % 10, Math.floor(i / 10));
      expect(p).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    }
  });

  it('produces a fully transparent mask when there are no strokes (gemini convention)', () => {
    const pixels = buildMaskPixels([], 10, 10, 'gemini');
    for (let i = 0; i < 10 * 10; i++) {
      const p = pixelAt(pixels, 10, i % 10, Math.floor(i / 10));
      expect(p).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    }
  });

  it('brushes a single disc at a point (openai: alpha goes to 0)', () => {
    const stroke: MaskStroke = {
      points: [{ x: 0.5, y: 0.5 }],
      radius: 0.2,
    };
    const pixels = buildMaskPixels([stroke], 20, 20, 'openai');
    // Center pixel must be erased (alpha 0) …
    expect(pixelAt(pixels, 20, 10, 10).a).toBe(0);
    // … and a corner pixel must stay opaque preserve.
    expect(pixelAt(pixels, 20, 0, 0).a).toBe(255);
  });

  it('connects two points into a continuous stroke without gaps', () => {
    const stroke: MaskStroke = {
      points: [
        { x: 0.1, y: 0.5 },
        { x: 0.9, y: 0.5 },
      ],
      radius: 0.02,
    };
    const pixels = buildMaskPixels([stroke], 100, 100, 'openai');
    // sample 50 positions along the line; every one must be inside the stroke
    for (let i = 1; i <= 50; i++) {
      const t = i / 51;
      const x = Math.round((0.1 + t * (0.9 - 0.1)) * 100);
      const p = pixelAt(pixels, 100, x, 50);
      expect(p.a).toBe(0);
    }
  });

  it('scales the brush radius against the shorter image side', () => {
    const stroke: MaskStroke = {
      points: [{ x: 0.5, y: 0.5 }],
      radius: 0.1, // fraction of min(w, h)
    };
    // 400×100 → short side 100 → radius 10 px. Pixel-centers are offset by
    // 0.5 during rasterization, so "pixel N" sits (N - 199.5) away from cx=200.
    const pixels = buildMaskPixels([stroke], 400, 100, 'openai');
    // 9.5 px from center: inside the radius-10 disc.
    expect(pixelAt(pixels, 400, 209, 50).a).toBe(0);
    // 11.5 px from center: outside.
    expect(pixelAt(pixels, 400, 211, 50).a).toBe(255);
  });

  it('clips strokes that go outside the image bounds', () => {
    const stroke: MaskStroke = {
      points: [
        { x: -0.2, y: 0.5 },
        { x: 0.1, y: 0.5 },
      ],
      radius: 0.05,
    };
    const pixels = buildMaskPixels([stroke], 50, 50, 'openai');
    // Some pixels inside the image should have been brushed.
    let inside = 0;
    for (let x = 0; x < 15; x++) inside += pixelAt(pixels, 50, x, 25).a === 0 ? 1 : 0;
    expect(inside).toBeGreaterThan(0);
    // Should never throw and always return the expected length.
    expect(pixels.length).toBe(50 * 50 * 4);
  });
});
