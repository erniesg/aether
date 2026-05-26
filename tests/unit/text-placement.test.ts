import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the zones JSON before importing the module under test so we can drive
// the placement logic against synthetic occupancy grids rather than the live
// SAM3-derived data. vi.hoisted gives us a stable reference that vi.mock can
// reach from inside its hoisted factory.
const { mockZones } = vi.hoisted(() => ({
  mockZones: {} as Record<
    string,
    { '9x16': { grid: number[][]; panCovered: boolean }; '16x9': { grid: number[][]; panCovered: boolean } }
  >,
}));

vi.mock('@/src/remotion/EventRecap/media-text-zones.json', () => ({
  default: mockZones,
}));

import {
  pickOverlayPosition,
  pickOverlayPositionForPool,
  anchorToTopLeftPx,
  rectFaceOccupancy,
  type OverlayCandidate,
} from '@/src/remotion/EventRecap/text-placement';

const ZEROS = () => Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0));
const ONES = () => Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 1));

const CONTAINER_9x16 = { w: 1080, h: 1920 };

beforeEach(() => {
  for (const k of Object.keys(mockZones)) delete mockZones[k];
});

describe('anchorToTopLeftPx', () => {
  it('top-left places box at (0, 0)', () => {
    const tl = anchorToTopLeftPx('top-left', { w: 100, h: 50 }, { w: 500, h: 800 });
    expect(tl).toEqual({ x: 0, y: 0 });
  });
  it('center centers the box', () => {
    const tl = anchorToTopLeftPx('center', { w: 100, h: 50 }, { w: 500, h: 800 });
    expect(tl).toEqual({ x: 200, y: 375 });
  });
  it('bottom-right places box at far edge', () => {
    const tl = anchorToTopLeftPx('bottom-right', { w: 100, h: 50 }, { w: 500, h: 800 });
    expect(tl).toEqual({ x: 400, y: 750 });
  });
  it('offset is applied additively', () => {
    const tl = anchorToTopLeftPx(
      'center',
      { w: 100, h: 50 },
      { w: 500, h: 800 },
      { x: 10, y: -20 }
    );
    expect(tl).toEqual({ x: 210, y: 355 });
  });
});

describe('rectFaceOccupancy', () => {
  it('returns 0 over a fully clear grid', () => {
    const occ = rectFaceOccupancy(
      { x: 0, y: 0 },
      { w: 500, h: 500 },
      { w: 1000, h: 1000 },
      ZEROS()
    );
    expect(occ).toBe(0);
  });
  it('returns 1 when every covered cell is fully blocked', () => {
    const occ = rectFaceOccupancy(
      { x: 0, y: 0 },
      { w: 1000, h: 1000 },
      { w: 1000, h: 1000 },
      ONES()
    );
    expect(occ).toBe(1);
  });
  it('weighted occupancy reflects per-cell occupancy', () => {
    // Single cell in row=2 col=2 (center) has occupancy 1.0; rest 0.
    const grid = ZEROS();
    grid[2][2] = 1.0;
    // A box covering only the center cell (40-60% × 40-60% of canvas).
    const occ = rectFaceOccupancy(
      { x: 400, y: 400 },
      { w: 200, h: 200 },
      { w: 1000, h: 1000 },
      grid
    );
    expect(occ).toBeCloseTo(1.0, 4);
  });
});

describe('pickOverlayPosition', () => {
  const URL = 'https://example/asset.jpg';

  function candidate(anchor: OverlayCandidate['anchor']): OverlayCandidate {
    return { anchor, boxPx: { w: 400, h: 200 } };
  }

  it('all candidates clear → returns first', () => {
    mockZones[URL] = { '9x16': { grid: ZEROS(), panCovered: false }, '16x9': { grid: ZEROS(), panCovered: false } };
    const r = pickOverlayPosition(
      { assetUrl: URL, aspect: '9x16', containerPx: CONTAINER_9x16 },
      [candidate('center'), candidate('top-center'), candidate('bottom-center')]
    );
    expect(r.anchor).toBe('center');
    expect(r.dim).toBe(false);
  });

  it('center face → first clear candidate (top-center) wins', () => {
    const grid = ZEROS();
    // Block center cells heavily.
    grid[1][1] = grid[1][2] = grid[1][3] = 0.9;
    grid[2][1] = grid[2][2] = grid[2][3] = 0.9;
    grid[3][1] = grid[3][2] = grid[3][3] = 0.9;
    mockZones[URL] = { '9x16': { grid, panCovered: false }, '16x9': { grid: ZEROS(), panCovered: false } };
    const r = pickOverlayPosition(
      { assetUrl: URL, aspect: '9x16', containerPx: CONTAINER_9x16 },
      [candidate('center'), candidate('top-center'), candidate('bottom-center')]
    );
    expect(r.anchor).toBe('top-center');
    expect(r.dim).toBe(false);
  });

  it('all blocked → fall back to last candidate with dim:true', () => {
    mockZones[URL] = { '9x16': { grid: ONES(), panCovered: false }, '16x9': { grid: ONES(), panCovered: false } };
    const r = pickOverlayPosition(
      { assetUrl: URL, aspect: '9x16', containerPx: CONTAINER_9x16 },
      [candidate('center'), candidate('top-center'), candidate('bottom-center')]
    );
    expect(r.anchor).toBe('bottom-center');
    expect(r.dim).toBe(true);
  });

  it('asset with no zone data → first candidate wins, dim false', () => {
    // mockZones intentionally empty for URL.
    const r = pickOverlayPosition(
      { assetUrl: 'https://example/unknown.jpg', aspect: '9x16', containerPx: CONTAINER_9x16 },
      [candidate('center'), candidate('top-center')]
    );
    expect(r.anchor).toBe('center');
    expect(r.dim).toBe(false);
  });

  it('pan-mode panCovered occupancy already baked into grid (treated like any other block)', () => {
    // Build a grid where top-center is panCovered = full block, but center is
    // clear. The function shouldn't care about panCovered directly — the
    // upstream build script already ORed both endpoints into the grid.
    const grid = ZEROS();
    for (let c = 0; c < 5; c++) grid[0][c] = 0.9; // top row blocked
    mockZones[URL] = { '9x16': { grid, panCovered: true }, '16x9': { grid: ZEROS(), panCovered: true } };
    const r = pickOverlayPosition(
      { assetUrl: URL, aspect: '9x16', containerPx: CONTAINER_9x16 },
      [candidate('top-center'), candidate('center')]
    );
    expect(r.anchor).toBe('center');
    expect(r.dim).toBe(false);
  });

  it('pool variant unions occupancies — worst-case wins', () => {
    const grid1 = ZEROS();
    grid1[2][2] = 0.9; // asset A blocks center only
    const grid2 = ZEROS();
    grid2[0][2] = 0.9; // asset B blocks top-center only
    mockZones['urlA'] = { '9x16': { grid: grid1, panCovered: false }, '16x9': { grid: ZEROS(), panCovered: false } };
    mockZones['urlB'] = { '9x16': { grid: grid2, panCovered: false }, '16x9': { grid: ZEROS(), panCovered: false } };
    const r = pickOverlayPositionForPool(
      { assetUrls: ['urlA', 'urlB'], aspect: '9x16', containerPx: CONTAINER_9x16 },
      [candidate('center'), candidate('top-center'), candidate('bottom-center')]
    );
    // Both center AND top-center are blocked by the union → bottom-center.
    expect(r.anchor).toBe('bottom-center');
    expect(r.dim).toBe(false);
  });

  it('pool variant: empty zone data → first candidate, dim:false', () => {
    const r = pickOverlayPositionForPool(
      { assetUrls: ['no-data-1', 'no-data-2'], aspect: '9x16', containerPx: CONTAINER_9x16 },
      [candidate('center'), candidate('top-center')]
    );
    expect(r.anchor).toBe('center');
    expect(r.dim).toBe(false);
  });

  it('respects custom overlapThreshold', () => {
    const grid = ZEROS();
    grid[2][2] = 0.5; // center cell partially blocked
    mockZones[URL] = { '9x16': { grid, panCovered: false }, '16x9': { grid: ZEROS(), panCovered: false } };
    // Default threshold 0.1 — center will be flagged blocked.
    const r1 = pickOverlayPosition(
      { assetUrl: URL, aspect: '9x16', containerPx: CONTAINER_9x16 },
      [
        { anchor: 'center', boxPx: { w: CONTAINER_9x16.w * 0.2, h: CONTAINER_9x16.h * 0.2 } },
        candidate('top-center'),
      ]
    );
    expect(r1.anchor).toBe('top-center');
    // Looser threshold 0.6 — center now passes.
    const r2 = pickOverlayPosition(
      { assetUrl: URL, aspect: '9x16', containerPx: CONTAINER_9x16 },
      [
        { anchor: 'center', boxPx: { w: CONTAINER_9x16.w * 0.2, h: CONTAINER_9x16.h * 0.2 } },
        candidate('top-center'),
      ],
      0.6
    );
    expect(r2.anchor).toBe('center');
  });
});
