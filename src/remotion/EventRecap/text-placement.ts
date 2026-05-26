/**
 * Face-aware text overlay placement.
 *
 * Given an asset's pre-computed 5x5 face-occupancy grid for the current
 * container aspect (see scripts/build-text-zones.ts), pick the highest-
 * preference `OverlayCandidate` whose bounding box does not significantly
 * overlap a face. When every candidate collides, fall back to the LAST
 * (lowest-preference) candidate with `dim: true` so the caller can render
 * a darkening scrim behind the text.
 *
 * Zones are loaded statically from `./media-text-zones.json` so Remotion
 * bundles them at build time — no async fetch from inside a Composition.
 */

import zonesJson from './media-text-zones.json';

const GRID = 5;

export type OverlayAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface OverlayCandidate {
  anchor: OverlayAnchor;
  /** Optional pixel offset from the anchor (positive moves toward bottom-right). */
  offset?: { x: number; y: number };
  /** Approx text bounding box in canvas px — used for the collision check. */
  boxPx: { w: number; h: number };
}

export interface PlacementContext {
  /** Asset whose mask drives the collision check. */
  assetUrl: string;
  aspect: '9x16' | '16x9';
  containerPx: { w: number; h: number };
}

export interface PoolPlacementContext {
  /**
   * Multiple assets cycle behind the text (e.g., a MediaBackdrop pool). We
   * union (per-cell max) the zone grids so the chosen position is clear
   * across every asset in the pool, not just one.
   */
  assetUrls: string[];
  aspect: '9x16' | '16x9';
  containerPx: { w: number; h: number };
}

export interface PlacementResult {
  anchor: OverlayAnchor;
  offset: { x: number; y: number };
  /** Top-left x of the chosen text box, in canvas px. */
  pxX: number;
  /** Top-left y of the chosen text box, in canvas px. */
  pxY: number;
  /**
   * True when every candidate collided with a face above threshold; caller
   * should render a darkening scrim behind the text so it still reads.
   */
  dim: boolean;
}

interface ZoneGrid {
  grid: number[][];
  panCovered: boolean;
}

type ZonesFile = Record<string, { '9x16': ZoneGrid; '16x9': ZoneGrid }>;

const zones = zonesJson as ZonesFile;

/**
 * Convert an anchor + optional offset to the top-left pixel of the
 * candidate's bounding box on the canvas.
 */
export function anchorToTopLeftPx(
  anchor: OverlayAnchor,
  boxPx: { w: number; h: number },
  containerPx: { w: number; h: number },
  offset?: { x: number; y: number }
): { x: number; y: number } {
  // `'center'` is shorthand for `'center-center'`; otherwise split on the
  // hyphen into [vertical, horizontal].
  const parts = anchor === 'center' ? (['center', 'center'] as const) : (anchor.split('-') as ['top' | 'center' | 'bottom', 'left' | 'center' | 'right']);
  const [vert, horiz] = parts;
  let x = 0;
  let y = 0;
  if (horiz === 'left') x = 0;
  else if (horiz === 'center') x = (containerPx.w - boxPx.w) / 2;
  else x = containerPx.w - boxPx.w;
  if (vert === 'top') y = 0;
  else if (vert === 'center') y = (containerPx.h - boxPx.h) / 2;
  else y = containerPx.h - boxPx.h;
  if (offset) {
    x += offset.x;
    y += offset.y;
  }
  return { x, y };
}

/**
 * Weighted face occupancy under a canvas-px rectangle. We sum each cell's
 * occupancy weighted by the FRACTION of that cell that the rectangle covers,
 * then normalize by total covered area — giving an effective occupancy on
 * the chosen rectangle.
 */
export function rectFaceOccupancy(
  topLeftPx: { x: number; y: number },
  boxPx: { w: number; h: number },
  containerPx: { w: number; h: number },
  zoneGrid: number[][]
): number {
  // Box edges in normalized [0..1] canvas coords, clamped to canvas.
  const x0 = Math.max(0, topLeftPx.x) / containerPx.w;
  const y0 = Math.max(0, topLeftPx.y) / containerPx.h;
  const x1 = Math.min(containerPx.w, topLeftPx.x + boxPx.w) / containerPx.w;
  const y1 = Math.min(containerPx.h, topLeftPx.y + boxPx.h) / containerPx.h;
  if (x1 <= x0 || y1 <= y0) return 0;

  let totalArea = 0;
  let weightedSum = 0;
  for (let row = 0; row < GRID; row++) {
    const cellTop = row / GRID;
    const cellBottom = (row + 1) / GRID;
    const overlapTop = Math.max(y0, cellTop);
    const overlapBottom = Math.min(y1, cellBottom);
    if (overlapBottom <= overlapTop) continue;
    const dy = overlapBottom - overlapTop;
    for (let col = 0; col < GRID; col++) {
      const cellLeft = col / GRID;
      const cellRight = (col + 1) / GRID;
      const overlapLeft = Math.max(x0, cellLeft);
      const overlapRight = Math.min(x1, cellRight);
      if (overlapRight <= overlapLeft) continue;
      const dx = overlapRight - overlapLeft;
      const area = dx * dy;
      totalArea += area;
      weightedSum += area * zoneGrid[row][col];
    }
  }
  if (totalArea <= 0) return 0;
  return weightedSum / totalArea;
}

/**
 * Pick the highest-preference candidate whose bounding-box face occupancy
 * is below `overlapThreshold`. When all candidates collide, return the LAST
 * candidate with `dim: true`. When the asset has no recorded zone data
 * (e.g., no faces detected), every candidate is treated as clear and the
 * first one wins.
 */
export function pickOverlayPosition(
  ctx: PlacementContext,
  candidates: OverlayCandidate[],
  overlapThreshold = 0.1
): PlacementResult {
  if (candidates.length === 0) {
    throw new Error('pickOverlayPosition requires at least one candidate');
  }
  const entry = zones[ctx.assetUrl]?.[ctx.aspect];
  // No mask data → no faces to dodge; first candidate wins.
  if (!entry) {
    const first = candidates[0];
    const tl = anchorToTopLeftPx(first.anchor, first.boxPx, ctx.containerPx, first.offset);
    return {
      anchor: first.anchor,
      offset: first.offset ?? { x: 0, y: 0 },
      pxX: tl.x,
      pxY: tl.y,
      dim: false,
    };
  }

  for (const c of candidates) {
    const tl = anchorToTopLeftPx(c.anchor, c.boxPx, ctx.containerPx, c.offset);
    const occ = rectFaceOccupancy(tl, c.boxPx, ctx.containerPx, entry.grid);
    if (occ < overlapThreshold) {
      return {
        anchor: c.anchor,
        offset: c.offset ?? { x: 0, y: 0 },
        pxX: tl.x,
        pxY: tl.y,
        dim: false,
      };
    }
  }
  // All blocked — fall back to last candidate, dim on.
  const last = candidates[candidates.length - 1];
  const tl = anchorToTopLeftPx(last.anchor, last.boxPx, ctx.containerPx, last.offset);
  return {
    anchor: last.anchor,
    offset: last.offset ?? { x: 0, y: 0 },
    pxX: tl.x,
    pxY: tl.y,
    dim: true,
  };
}

/**
 * Pool variant: union the per-cell occupancy across every asset in the pool
 * (per-cell MAX) and use the resulting "worst-case" grid as the collision
 * source. Use this when a stationary text overlay sits on top of cycling
 * b-roll — the chosen position has to be clear of EVERY photo's face mask,
 * not just one. Assets without zone data are skipped (treated as clear).
 */
export function pickOverlayPositionForPool(
  ctx: PoolPlacementContext,
  candidates: OverlayCandidate[],
  overlapThreshold = 0.1
): PlacementResult {
  if (candidates.length === 0) {
    throw new Error('pickOverlayPositionForPool requires at least one candidate');
  }
  // Build the union (per-cell MAX) grid across all known pool assets.
  const union: number[][] = Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => 0));
  let anyKnown = false;
  for (const url of ctx.assetUrls) {
    const entry = zones[url]?.[ctx.aspect];
    if (!entry) continue;
    anyKnown = true;
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (entry.grid[r][c] > union[r][c]) union[r][c] = entry.grid[r][c];
      }
    }
  }
  if (!anyKnown) {
    const first = candidates[0];
    const tl = anchorToTopLeftPx(first.anchor, first.boxPx, ctx.containerPx, first.offset);
    return {
      anchor: first.anchor,
      offset: first.offset ?? { x: 0, y: 0 },
      pxX: tl.x,
      pxY: tl.y,
      dim: false,
    };
  }

  for (const c of candidates) {
    const tl = anchorToTopLeftPx(c.anchor, c.boxPx, ctx.containerPx, c.offset);
    const occ = rectFaceOccupancy(tl, c.boxPx, ctx.containerPx, union);
    if (occ < overlapThreshold) {
      return {
        anchor: c.anchor,
        offset: c.offset ?? { x: 0, y: 0 },
        pxX: tl.x,
        pxY: tl.y,
        dim: false,
      };
    }
  }
  const last = candidates[candidates.length - 1];
  const tl = anchorToTopLeftPx(last.anchor, last.boxPx, ctx.containerPx, last.offset);
  return {
    anchor: last.anchor,
    offset: last.offset ?? { x: 0, y: 0 },
    pxX: tl.x,
    pxY: tl.y,
    dim: true,
  };
}
