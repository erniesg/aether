import { describe, expect, it } from 'vitest';
import {
  aspectSpread,
  explainRenderMode,
  pickRenderMode,
  type FormatAspect,
} from './render-mode';

const SQUARE: FormatAspect = { w: 1080, h: 1080 };
const IG_POST: FormatAspect = { w: 1080, h: 1350 }; // 4:5 → 0.8
const STORY: FormatAspect = { w: 1080, h: 1920 }; // 9:16 → 0.5625
const REEL_COVER: FormatAspect = { w: 1080, h: 1920 };
const LINKEDIN: FormatAspect = { w: 1200, h: 627 }; // ≈1.913
const BANNER_WIDE: FormatAspect = { w: 1500, h: 500 }; // 3:1 → 3

describe('pickRenderMode', () => {
  it('returns crop on an empty format set', () => {
    expect(pickRenderMode([])).toBe('crop');
  });

  it('returns crop on a single format (nothing to fan out to)', () => {
    expect(pickRenderMode([SQUARE])).toBe('crop');
  });

  it('returns crop when aspect spread is tight (≤ 2)', () => {
    // IG Post (0.8) + Story (0.5625) → 1.42, well under 2
    expect(pickRenderMode([IG_POST, STORY])).toBe('crop');
  });

  it('returns crop when spread is exactly the threshold', () => {
    // Aspects 1:1 and 1:2 → spread exactly 2
    expect(pickRenderMode([SQUARE, { w: 1080, h: 2160 }])).toBe('crop');
  });

  it('returns fanout when aspect spread exceeds threshold', () => {
    // IG Post (0.8) + LinkedIn (1.913) → 2.39, breaks tight bound
    expect(pickRenderMode([IG_POST, LINKEDIN])).toBe('fanout');
  });

  it('returns fanout for the typical demo set (4 mixed formats)', () => {
    // IG + Story + Reel + LinkedIn → spread ≈ 3.4
    expect(pickRenderMode([IG_POST, STORY, REEL_COVER, LINKEDIN])).toBe('fanout');
  });

  it('returns fanout for square + ultrawide banner', () => {
    expect(pickRenderMode([SQUARE, BANNER_WIDE])).toBe('fanout');
  });

  it('respects an explicit override of crop, even with wide spread', () => {
    expect(pickRenderMode([IG_POST, STORY, LINKEDIN], 'crop')).toBe('crop');
  });

  it('respects an explicit override of fanout, even with tight spread', () => {
    expect(pickRenderMode([SQUARE, IG_POST], 'fanout')).toBe('fanout');
  });

  it('passes through with explicit "auto" the same as default', () => {
    expect(pickRenderMode([IG_POST, STORY])).toBe(pickRenderMode([IG_POST, STORY], 'auto'));
  });

  it('respects a custom spreadThreshold', () => {
    // IG Post (0.8) + Story (0.5625) → 1.42; with strict threshold 1.3 → fanout
    expect(pickRenderMode([IG_POST, STORY], 'auto', { spreadThreshold: 1.3 })).toBe('fanout');
    // And same set with relaxed threshold 1.5 → crop
    expect(pickRenderMode([IG_POST, STORY], 'auto', { spreadThreshold: 1.5 })).toBe('crop');
  });

  it('throws on zero or negative dimensions instead of dividing by zero', () => {
    expect(() => pickRenderMode([{ w: 0, h: 100 }, SQUARE])).toThrow(/positive finite/);
    expect(() => pickRenderMode([{ w: 100, h: -1 }, SQUARE])).toThrow(/positive finite/);
  });

  it('throws on non-finite dimensions (NaN, Infinity)', () => {
    expect(() => pickRenderMode([{ w: Number.NaN, h: 100 }, SQUARE])).toThrow(
      /positive finite/
    );
    expect(() => pickRenderMode([{ w: Number.POSITIVE_INFINITY, h: 100 }, SQUARE])).toThrow(
      /positive finite/
    );
  });
});

describe('aspectSpread', () => {
  it('returns 1 on an empty format set (no spread to measure)', () => {
    expect(aspectSpread([])).toBe(1);
  });

  it('returns 1 for a single format', () => {
    expect(aspectSpread([SQUARE])).toBe(1);
    expect(aspectSpread([STORY])).toBe(1);
  });

  it('computes max/min ratio across two formats', () => {
    // 1:1 (1.0) and 9:16 (0.5625) → 1.0/0.5625 = 1.777…
    expect(aspectSpread([SQUARE, STORY])).toBeCloseTo(1.7778, 3);
  });

  it('returns 1 when all formats share the same aspect ratio', () => {
    expect(aspectSpread([STORY, REEL_COVER])).toBe(1);
  });

  it('handles a four-format demo set', () => {
    // min = 0.5625 (story/reel), max = 1.913 (LinkedIn) → 3.40
    expect(aspectSpread([IG_POST, STORY, REEL_COVER, LINKEDIN])).toBeCloseTo(3.4, 1);
  });
});

describe('explainRenderMode', () => {
  it('reports override-crop when caller pins crop', () => {
    const out = explainRenderMode([IG_POST, LINKEDIN], 'crop');
    expect(out).toMatchObject({ mode: 'crop', reason: 'override-crop' });
  });

  it('reports override-fanout when caller pins fanout', () => {
    const out = explainRenderMode([SQUARE], 'fanout');
    expect(out).toMatchObject({ mode: 'fanout', reason: 'override-fanout' });
  });

  it('reports single-format on a one-format set', () => {
    expect(explainRenderMode([SQUARE]).reason).toBe('single-format');
    expect(explainRenderMode([SQUARE]).mode).toBe('crop');
  });

  it('reports tight-spread-cropped when auto chooses crop', () => {
    const out = explainRenderMode([IG_POST, STORY]);
    expect(out.reason).toBe('tight-spread-cropped');
    expect(out.mode).toBe('crop');
    expect(out.spread).toBeCloseTo(1.42, 1);
    expect(out.threshold).toBe(2);
  });

  it('reports wide-spread-fanned-out when auto chooses fanout', () => {
    const out = explainRenderMode([IG_POST, STORY, LINKEDIN]);
    expect(out.reason).toBe('wide-spread-fanned-out');
    expect(out.mode).toBe('fanout');
    expect(out.spread).toBeGreaterThan(2);
  });

  it('threads a custom threshold through', () => {
    const out = explainRenderMode([IG_POST, STORY], 'auto', { spreadThreshold: 1.3 });
    expect(out.threshold).toBe(1.3);
    expect(out.reason).toBe('wide-spread-fanned-out');
  });
});
