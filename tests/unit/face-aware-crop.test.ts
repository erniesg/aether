import { describe, expect, it } from 'vitest';
import {
  faceUnion,
  visibleWindowAtCover,
  staticObjectPositionFractions,
  computeFaceAwareTransform,
  type Face,
} from '@/src/remotion/EventRecap/crop';

const FULL_HD: { width: number; height: number } = { width: 1920, height: 1080 };
const PORTRAIT: { width: number; height: number } = { width: 1080, height: 1920 };
const VERTICAL_9x16 = 1080 / 1920; // 0.5625
const HORIZONTAL_16x9 = 1920 / 1080;

function f(x: number, y: number, w: number, h: number, confidence = 0.9): Face {
  return { x, y, w, h, confidence };
}

describe('faceUnion', () => {
  it('returns the bbox covering a single face', () => {
    const u = faceUnion([f(0.1, 0.2, 0.3, 0.4)]);
    expect(u.x).toBeCloseTo(0.1, 6);
    expect(u.y).toBeCloseTo(0.2, 6);
    expect(u.w).toBeCloseTo(0.3, 6);
    expect(u.h).toBeCloseTo(0.4, 6);
  });
  it('returns the bbox covering disjoint faces', () => {
    const u = faceUnion([f(0.1, 0.1, 0.1, 0.1), f(0.6, 0.4, 0.1, 0.1)]);
    expect(u.x).toBeCloseTo(0.1);
    expect(u.y).toBeCloseTo(0.1);
    expect(u.w).toBeCloseTo(0.6);
    expect(u.h).toBeCloseTo(0.4);
  });
});

describe('visibleWindowAtCover', () => {
  it('wider-than-container source: height fills, width crops', () => {
    // 16:9 source into 9:16 container — w_visible = (9/16)/(16/9) = 81/256 ≈ 0.316
    const w = visibleWindowAtCover(HORIZONTAL_16x9, VERTICAL_9x16);
    expect(w.h).toBe(1);
    expect(w.w).toBeCloseTo(0.31641, 4);
  });
  it('taller-than-container source: width fills, height crops', () => {
    // 9:16 source into 16:9 container — h_visible = (9/16)/(16/9) ≈ 0.316
    const w = visibleWindowAtCover(VERTICAL_9x16, HORIZONTAL_16x9);
    expect(w.w).toBe(1);
    expect(w.h).toBeCloseTo(0.31641, 4);
  });
  it('same-aspect source: full window', () => {
    const w = visibleWindowAtCover(1, 1);
    expect(w.w).toBe(1);
    expect(w.h).toBe(1);
  });
});

describe('staticObjectPositionFractions', () => {
  const window = { w: 0.3, h: 1 };

  it('union perfectly centered in source → position 0.5', () => {
    // Union centered at image-center 0.5. For window-center to also be 0.5
    // we need P = (0.5 - 0.15)/0.7 = 0.5.
    const u = { x: 0.45, y: 0.1, w: 0.1, h: 0.1 };
    const p = staticObjectPositionFractions(u, window)!;
    expect(p.x).toBeCloseTo(0.5, 4);
  });
  it('union off-center (cx=0.45) in narrow window → position < 0.5', () => {
    // unionCx 0.45 → P = (0.45 - 0.15)/0.7 = 0.4286
    const u = { x: 0.4, y: 0.1, w: 0.1, h: 0.1 };
    const p = staticObjectPositionFractions(u, window)!;
    expect(p.x).toBeCloseTo(0.4286, 3);
  });
  it('union near left → clamps to 0', () => {
    const u = { x: 0.0, y: 0.1, w: 0.1, h: 0.1 };
    const p = staticObjectPositionFractions(u, window)!;
    expect(p.x).toBeCloseTo(0, 4);
  });
  it('union near right → clamps to 1', () => {
    const u = { x: 0.9, y: 0.1, w: 0.1, h: 0.1 };
    const p = staticObjectPositionFractions(u, window)!;
    expect(p.x).toBeCloseTo(1, 4);
  });
  it('union wider than window → returns null', () => {
    const u = { x: 0.1, y: 0.1, w: 0.5, h: 0.1 }; // 0.5 > 0.3
    expect(staticObjectPositionFractions(u, window)).toBeNull();
  });
  it('union exactly == window width starting at x=0.2 → P = 0.2857', () => {
    // Window width 0.3 exactly matches union width 0.3 (just fits).
    // For window-left to land at 0.2: P = 0.2 / 0.7 = 0.2857.
    const u = { x: 0.2, y: 0.1, w: 0.3, h: 0.1 };
    const p = staticObjectPositionFractions(u, window)!;
    expect(p.x).toBeCloseTo(0.2857, 3);
  });
});

describe('computeFaceAwareTransform — static path', () => {
  it('returns static when single face fits at cover', () => {
    // 16:9 source (1920×1080) into 9:16 container (1080×1920). Visible
    // window width ~0.316; face is 0.1 wide centered → fits.
    const r = computeFaceAwareTransform(
      {
        sourceDims: FULL_HD,
        faces: [f(0.45, 0.35, 0.10, 0.18)],
      },
      VERTICAL_9x16,
      { allowPan: true }
    );
    expect(r.mode).toBe('static');
    expect(r).toHaveProperty('objectPosition');
  });
  it('vivian-portrait case: tiny face on the left should pin object-position low', () => {
    // SAM3 actually detected Vivian at bbox normalised to:
    //   x=0.184, y=0.502, w=0.027, h=0.050   (1200×803 source, face 33×40 px)
    const r = computeFaceAwareTransform(
      {
        sourceDims: { width: 1200, height: 803 },
        faces: [f(0.184, 0.502, 0.027, 0.050)],
      },
      VERTICAL_9x16,
      { allowPan: true }
    );
    expect(r.mode).toBe('static');
    if (r.mode === 'static') {
      const xPct = parseFloat(r.objectPosition.split(' ')[0]);
      // Face is at x=0.184, well left of center → object-position-x should be small.
      // Visible window width ≈ 0.376 of source (1200/803 ≈ 1.494 / VERT 0.5625 = 0.376)
      // For face center at 0.198 to land on window center, P = (0.198 - 0.188) / 0.624 ≈ 0.016
      expect(xPct).toBeLessThan(20);
    }
  });
});

describe('computeFaceAwareTransform — pan path', () => {
  it('returns pan when union wider than window at cover', () => {
    // 16:9 source into 9:16 container — window.w ≈ 0.316. Two faces at
    // x=0.10 and x=0.80 → union spans w=0.80, doesn't fit.
    const r = computeFaceAwareTransform(
      {
        sourceDims: FULL_HD,
        faces: [f(0.10, 0.40, 0.05, 0.05), f(0.80, 0.40, 0.05, 0.05)],
      },
      VERTICAL_9x16,
      { allowPan: true }
    );
    expect(r.mode).toBe('pan');
    if (r.mode === 'pan') {
      const fromX = parseFloat(r.from.objectPosition.split(' ')[0]);
      const toX = parseFloat(r.to.objectPosition.split(' ')[0]);
      // From should start showing the LEFT face → small fromX.
      // To should end showing the RIGHT face → large toX.
      expect(fromX).toBeLessThan(toX);
      expect(fromX).toBeLessThan(30);
      expect(toX).toBeGreaterThan(70);
    }
  });
  it('pan with allowPan=false falls through to letterbox', () => {
    const r = computeFaceAwareTransform(
      {
        sourceDims: FULL_HD,
        faces: [f(0.10, 0.40, 0.05, 0.05), f(0.80, 0.40, 0.05, 0.05)],
      },
      VERTICAL_9x16,
      { allowPan: false }
    );
    expect(r.mode).toBe('letterbox');
  });
});

describe('computeFaceAwareTransform — fallback', () => {
  it('falls back to legacy focal when no faces tagged', () => {
    const r = computeFaceAwareTransform(
      { focal: { x: 0.3, y: 0.7 } },
      VERTICAL_9x16,
      { allowPan: true }
    );
    expect(r.mode).toBe('static');
    if (r.mode === 'static') {
      expect(r.objectPosition).toBe('30.00% 70.00%');
    }
  });
  it('falls back to 50/50 with no focal and no faces', () => {
    const r = computeFaceAwareTransform({}, VERTICAL_9x16, { allowPan: true });
    expect(r.mode).toBe('static');
    if (r.mode === 'static') {
      expect(r.objectPosition).toBe('50.00% 50.00%');
    }
  });
  it('falls back to focal when sourceDims missing even with face list', () => {
    const r = computeFaceAwareTransform(
      { focal: { x: 0.2, y: 0.6 }, faces: [f(0.1, 0.1, 0.1, 0.1)] },
      VERTICAL_9x16,
      { allowPan: true }
    );
    expect(r.mode).toBe('static');
    if (r.mode === 'static') {
      expect(r.objectPosition).toBe('20.00% 60.00%');
    }
  });
});

describe('computeFaceAwareTransform — horizontal container', () => {
  it('portrait source into 16:9 container with high face: should pin vertical position low', () => {
    // 9:16 source → window.h ≈ 0.316. Face high in frame at y=0.05.
    const r = computeFaceAwareTransform(
      {
        sourceDims: PORTRAIT,
        faces: [f(0.45, 0.05, 0.10, 0.10)],
      },
      HORIZONTAL_16x9,
      { allowPan: true }
    );
    expect(r.mode).toBe('static');
    if (r.mode === 'static') {
      const yPct = parseFloat(r.objectPosition.split(' ')[1]);
      expect(yPct).toBeLessThan(30);
    }
  });
});
