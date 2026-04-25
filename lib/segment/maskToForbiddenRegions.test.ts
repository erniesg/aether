/**
 * Unit tests for `segmentationToForbiddenRegions`.
 * Pure function — no I/O, no mocks required.
 */
import { describe, expect, it } from 'vitest';
import {
  segmentationToForbiddenRegions,
  type SegmentMaskJson,
} from './maskToForbiddenRegions';

const BASE_MASK: SegmentMaskJson = {
  width: 1000,
  height: 800,
  masks: [],
};

describe('segmentationToForbiddenRegions', () => {
  it('returns empty array when masks list is empty', () => {
    const result = segmentationToForbiddenRegions(BASE_MASK);
    expect(result).toEqual([]);
  });

  it('converts pixel-space bbox to normalized 0..1 coordinates', () => {
    const mask: SegmentMaskJson = {
      width: 1000,
      height: 800,
      masks: [
        { kind: 'face', bbox: { x: 100, y: 200, w: 300, h: 400 }, confidence: 0.95 },
      ],
    };
    const [region] = segmentationToForbiddenRegions(mask);
    expect(region.kind).toBe('face');
    expect(region.confidence).toBeCloseTo(0.95);
    expect(region.bbox.x).toBeCloseTo(0.1);   // 100 / 1000
    expect(region.bbox.y).toBeCloseTo(0.25);  // 200 / 800
    expect(region.bbox.w).toBeCloseTo(0.3);   // 300 / 1000
    expect(region.bbox.h).toBeCloseTo(0.5);   // 400 / 800
  });

  it('handles multiple masks and preserves kind + confidence', () => {
    const mask: SegmentMaskJson = {
      width: 500,
      height: 500,
      masks: [
        { kind: 'face',    bbox: { x: 0,   y: 0,   w: 100, h: 100 }, confidence: 0.9 },
        { kind: 'product', bbox: { x: 200, y: 200, w: 100, h: 100 }, confidence: 0.7 },
        { kind: 'logo',    bbox: { x: 400, y: 400, w: 50,  h: 50  }, confidence: 0.8 },
      ],
    };
    const regions = segmentationToForbiddenRegions(mask);
    expect(regions).toHaveLength(3);
    expect(regions[0].kind).toBe('face');
    expect(regions[1].kind).toBe('product');
    expect(regions[2].kind).toBe('logo');
  });

  it('clamps normalized bbox to [0, 1] if pixel values are out of bounds', () => {
    const mask: SegmentMaskJson = {
      width: 100,
      height: 100,
      masks: [
        { kind: 'other', bbox: { x: -10, y: -10, w: 200, h: 200 }, confidence: 0.5 },
      ],
    };
    const [region] = segmentationToForbiddenRegions(mask);
    expect(region.bbox.x).toBeGreaterThanOrEqual(0);
    expect(region.bbox.y).toBeGreaterThanOrEqual(0);
    expect(region.bbox.x + region.bbox.w).toBeLessThanOrEqual(1);
    expect(region.bbox.y + region.bbox.h).toBeLessThanOrEqual(1);
  });

  it('treats a mask with zero dimensions as having no forbidden regions', () => {
    const mask: SegmentMaskJson = {
      width: 0,
      height: 0,
      masks: [
        { kind: 'face', bbox: { x: 0, y: 0, w: 0, h: 0 }, confidence: 0.9 },
      ],
    };
    // Zero-dimension source → can't normalize safely → should return empty
    const result = segmentationToForbiddenRegions(mask);
    expect(result).toEqual([]);
  });
});
