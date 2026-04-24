import type { ArtboardSeed } from './seedArtboards';

export type ArtboardLayoutStrategy = 'row' | 'orientation-groups';

export const DEFAULT_LAYOUT_STRATEGY: ArtboardLayoutStrategy = 'orientation-groups';
export const DEFAULT_LAYOUT_GAP_PX = 160;

export interface ArtboardPlacement {
  seed: ArtboardSeed;
  x: number;
  y: number;
}

// Aspect-ratio thresholds. Sub-threshold = tall portrait; super-threshold =
// landscape; in-between = squareish / tall-square (fits IG Post 4:5 + XHS 3:4).
const TALL_RATIO_MAX = 0.7;
const LANDSCAPE_RATIO_MIN = 1.3;

type OrientationBucket = 'squareish' | 'tall' | 'landscape';

function bucketOf(seed: ArtboardSeed): OrientationBucket {
  const ratio = seed.w / seed.h;
  if (ratio < TALL_RATIO_MAX) return 'tall';
  if (ratio > LANDSCAPE_RATIO_MIN) return 'landscape';
  return 'squareish';
}

// Row order: squares first (most hero-shaped), then tall (Stories/Reels),
// then landscape banners at the bottom. Stable for the demo canvas.
const BUCKET_ORDER: OrientationBucket[] = ['squareish', 'tall', 'landscape'];

function layoutRow(
  seeds: ReadonlyArray<ArtboardSeed>,
  gap: number,
  y: number
): ArtboardPlacement[] {
  const out: ArtboardPlacement[] = [];
  let cursorX = 0;
  for (const seed of seeds) {
    out.push({ seed, x: cursorX, y });
    cursorX += seed.w + gap;
  }
  return out;
}

function layoutOrientationGroups(
  seeds: ReadonlyArray<ArtboardSeed>,
  gap: number
): ArtboardPlacement[] {
  const rows: Record<OrientationBucket, ArtboardSeed[]> = {
    squareish: [],
    tall: [],
    landscape: [],
  };
  for (const seed of seeds) {
    rows[bucketOf(seed)].push(seed);
  }

  const out: ArtboardPlacement[] = [];
  let cursorY = 0;
  for (const bucket of BUCKET_ORDER) {
    const row = rows[bucket];
    if (row.length === 0) continue;
    out.push(...layoutRow(row, gap, cursorY));
    const rowH = row.reduce((acc, s) => Math.max(acc, s.h), 0);
    cursorY += rowH + gap;
  }
  return out;
}

/**
 * Compute (x, y) positions for a set of artboards under the given layout
 * strategy. Pure — no tldraw editor dependency. seedArtboards uses this
 * to position the seeded frames; external callers can call it directly
 * to preview a layout or build exports.
 *
 * Strategies:
 *   - 'row': single horizontal row (the original 2026-04-22 layout).
 *   - 'orientation-groups': three rows grouped by aspect ratio — squares,
 *     tall portraits, landscapes — stacked top-to-bottom. Default because
 *     the full 7-preset set reaches ~8500 px wide in a single row, which
 *     forces awkward horizontal panning on first load.
 */
export function layoutArtboards(
  seeds: ReadonlyArray<ArtboardSeed>,
  strategy: ArtboardLayoutStrategy = DEFAULT_LAYOUT_STRATEGY,
  gap: number = DEFAULT_LAYOUT_GAP_PX
): ArtboardPlacement[] {
  if (strategy === 'row') return layoutRow(seeds, gap, 0);
  return layoutOrientationGroups(seeds, gap);
}
