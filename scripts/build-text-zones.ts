/**
 * Pre-compute face-clear text-overlay zones per (asset, aspect).
 *
 * For each asset that has SAM3 face masks:
 *   - Project the binary mask through `computeFaceAwareTransform()` into the
 *     visible canvas region for both target aspects (9:16 and 16:9).
 *   - For pan-mode crops, project at both `from` and `to` extremes and take
 *     the union — a position is "face-clear" only if both extremes are clear.
 *   - Build a 5×5 grid (25 cells) over the canvas, each cell recording the
 *     fraction of cell pixels that overlap a face mask.
 *
 * Output: src/remotion/EventRecap/media-text-zones.json
 *   {
 *     "<asset-url>": {
 *       "9x16": { "grid": [[occ,...],...], "panCovered": false },
 *       "16x9": { ... }
 *     }
 *   }
 *
 * Mask projection lives in TS (sharp + raw pixel reads) rather than Python so
 * we can directly import the canonical `computeFaceAwareTransform` from
 * src/remotion/EventRecap/crop.ts — no risk of the two implementations
 * drifting apart.
 *
 * Usage:
 *   npx tsx scripts/build-text-zones.ts          # rebuild zones JSON
 *   npx tsx scripts/build-text-zones.ts --diag   # also write per-asset PNG
 *                                                  diagnostics into
 *                                                  docs/mocks/face-tagging-compare/zones/
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { aie2026MediaPool, type MediaAsset } from '../src/remotion/EventRecap/data';
import {
  computeFaceAwareTransform,
  visibleWindowAtCover,
  type CropResult,
} from '../src/remotion/EventRecap/crop';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MASK_DIR = path.join(ROOT, 'docs/mocks/face-tagging-compare/masks');
const ZONES_OUT = path.join(ROOT, 'src/remotion/EventRecap/media-text-zones.json');
const DIAG_DIR = path.join(ROOT, 'docs/mocks/face-tagging-compare/zones');
const GRID = 5;

type AspectKey = '9x16' | '16x9';

interface ZoneGrid {
  grid: number[][]; // GRID rows × GRID cols; occupancy 0..1 per cell
  panCovered: boolean;
}

interface ZonesEntry {
  '9x16': ZoneGrid;
  '16x9': ZoneGrid;
}

type ZonesFile = Record<string, ZonesEntry>;

const ASPECTS: Array<{ key: AspectKey; w: number; h: number }> = [
  // 9:16 vertical (1080×1920) and 16:9 horizontal (1920×1080)
  { key: '9x16', w: 1080, h: 1920 },
  { key: '16x9', w: 1920, h: 1080 },
];

/**
 * Mask hashes follow scripts/_sam3_face_tag.py: sha1(`${url}#${i}`)[:12] +
 * `_face_${i}.png`. We rebuild that pattern per face entry. If the mask file
 * is missing (e.g., the person-fallback path doesn't save masks), we fall
 * back to the bbox rectangle from the asset.faces entry.
 */
function maskPathFor(url: string, faceIdx: number): string {
  const sha = crypto.createHash('sha1').update(`${url}#${faceIdx}`).digest('hex').slice(0, 12);
  return path.join(MASK_DIR, `${sha}_face_${faceIdx}.png`);
}

interface LoadedMask {
  width: number;
  height: number;
  /** 1-byte-per-pixel; nonzero = face. Length = width*height. */
  data: Uint8Array;
}

/**
 * Load every face mask for an asset and OR them together into one binary mask
 * at source resolution. When a mask file is missing for face #i we draw the
 * bbox rectangle directly — sufficient for the person-fallback case where
 * SAM3 returned a derived bbox without a mask.
 */
async function loadCombinedMask(
  asset: MediaAsset
): Promise<LoadedMask | null> {
  const faces = asset.faces ?? [];
  const dims = asset.sourceDims;
  if (!dims || faces.length === 0) return null;

  const combined = new Uint8Array(dims.width * dims.height);
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    const maskPath = maskPathFor(asset.url, i);
    if (existsSync(maskPath)) {
      // Force single-channel raw read — sharp defaults to RGB for L-mode PNGs.
      const { data, info } = await sharp(maskPath)
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      // Mask must match source dims (they were exported at source resolution
      // by _sam3_face_tag.py). If they don't, fall back to bbox.
      if (info.width !== dims.width || info.height !== dims.height) {
        console.warn(
          `  WARN mask dims mismatch for ${asset.url.slice(-30)} face ${i}: ` +
            `mask=${info.width}×${info.height}, source=${dims.width}×${dims.height} — falling back to bbox`
        );
        rasterizeBbox(combined, dims.width, dims.height, f);
        continue;
      }
      // OR the raw bytes (1-byte-per-pixel grayscale, nonzero = face).
      for (let p = 0; p < data.length && p < combined.length; p++) {
        if (data[p] > 0) combined[p] = 1;
      }
    } else {
      // No mask file — draw the bbox rectangle. Used for person-fallback faces.
      rasterizeBbox(combined, dims.width, dims.height, f);
    }
  }
  return { width: dims.width, height: dims.height, data: combined };
}

function rasterizeBbox(
  buf: Uint8Array,
  w: number,
  h: number,
  bbox: { x: number; y: number; w: number; h: number }
): void {
  const x0 = Math.max(0, Math.floor(bbox.x * w));
  const y0 = Math.max(0, Math.floor(bbox.y * h));
  const x1 = Math.min(w, Math.ceil((bbox.x + bbox.w) * w));
  const y1 = Math.min(h, Math.ceil((bbox.y + bbox.h) * h));
  for (let y = y0; y < y1; y++) {
    const row = y * w;
    for (let x = x0; x < x1; x++) {
      buf[row + x] = 1;
    }
  }
}

/**
 * Given a crop's `object-position` string and the visible-window dims, derive
 * the source-space rectangle that is visible on the canvas. Both are in
 * normalized [0..1] coords (source = unit square).
 */
function visibleRectFromObjectPosition(
  objectPosition: string,
  window: { w: number; h: number }
): { x: number; y: number; w: number; h: number } {
  // object-position semantics: a value of P fraction puts the visible window's
  // top-left at (1 - window.W) * P on each axis.
  const [pxStr, pyStr] = objectPosition.split(/\s+/);
  const px = parseFloat(pxStr) / 100;
  const py = parseFloat(pyStr) / 100;
  const left = (1 - window.w) * px;
  const top = (1 - window.h) * py;
  return { x: left, y: top, w: window.w, h: window.h };
}

/**
 * Compute the visible-source rectangle(s) for a crop result. For pan mode we
 * return both endpoints — the caller must union them.
 */
function visibleRectsForCrop(
  crop: CropResult,
  asset: MediaAsset,
  containerAspect: number
): Array<{ x: number; y: number; w: number; h: number }> {
  if (!asset.sourceDims) return [];
  const sourceAspect = asset.sourceDims.width / asset.sourceDims.height;
  const window = visibleWindowAtCover(sourceAspect, containerAspect);
  if (crop.mode === 'static') {
    return [visibleRectFromObjectPosition(crop.objectPosition, window)];
  }
  if (crop.mode === 'pan') {
    return [
      visibleRectFromObjectPosition(crop.from.objectPosition, window),
      visibleRectFromObjectPosition(crop.to.objectPosition, window),
    ];
  }
  // letterbox — image fits inside the container with bars. Mask pixels outside
  // the contained image map to (canvas) bar regions which never receive face
  // overlap; we still treat the contained image as the visible rect.
  return [visibleRectFromObjectPosition(crop.objectPosition, window)];
}

/**
 * Count face-mask pixels inside a source-space rectangle [x..x+w] × [y..y+h]
 * normalized to [0..1]. Returns the count divided by the rect's pixel area —
 * i.e., the fraction of that region's pixels that are face. Returns 0 for
 * out-of-bounds or zero-area regions.
 */
function rectOccupancy(
  mask: LoadedMask,
  rect: { x: number; y: number; w: number; h: number }
): number {
  if (rect.w <= 0 || rect.h <= 0) return 0;
  const x0 = Math.max(0, Math.floor(rect.x * mask.width));
  const y0 = Math.max(0, Math.floor(rect.y * mask.height));
  const x1 = Math.min(mask.width, Math.ceil((rect.x + rect.w) * mask.width));
  const y1 = Math.min(mask.height, Math.ceil((rect.y + rect.h) * mask.height));
  const area = (x1 - x0) * (y1 - y0);
  if (area <= 0) return 0;
  let hit = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * mask.width;
    for (let x = x0; x < x1; x++) {
      if (mask.data[row + x]) hit++;
    }
  }
  return hit / area;
}

/**
 * Build the 5×5 canvas-grid occupancy for an asset+aspect by mapping each
 * canvas cell back to a source-rectangle via the visible window. When the
 * crop is pan-mode, we OR the occupancies at the two endpoints.
 */
function buildGrid(asset: MediaAsset, mask: LoadedMask, aspect: { key: AspectKey; w: number; h: number }): ZoneGrid {
  const containerAspect = aspect.w / aspect.h;
  const crop = computeFaceAwareTransform(asset, containerAspect, { allowPan: true });
  const visibleRects = visibleRectsForCrop(crop, asset, containerAspect);

  // For each canvas cell, derive the corresponding source-rect at each
  // endpoint, count mask hits, and take the MAX occupancy across endpoints.
  const grid: number[][] = [];
  for (let row = 0; row < GRID; row++) {
    const r: number[] = [];
    const cellTopFrac = row / GRID;
    const cellBottomFrac = (row + 1) / GRID;
    for (let col = 0; col < GRID; col++) {
      const cellLeftFrac = col / GRID;
      const cellRightFrac = (col + 1) / GRID;
      let occ = 0;
      for (const vis of visibleRects) {
        // Map canvas-cell back to source-space inside the visible window
        const sx = vis.x + cellLeftFrac * vis.w;
        const sy = vis.y + cellTopFrac * vis.h;
        const sw = (cellRightFrac - cellLeftFrac) * vis.w;
        const sh = (cellBottomFrac - cellTopFrac) * vis.h;
        const o = rectOccupancy(mask, { x: sx, y: sy, w: sw, h: sh });
        if (o > occ) occ = o;
      }
      r.push(round4(occ));
    }
    grid.push(r);
  }
  return { grid, panCovered: crop.mode === 'pan' };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

async function maybeWriteDiag(
  asset: MediaAsset,
  mask: LoadedMask,
  zones: ZonesEntry
): Promise<void> {
  await mkdir(DIAG_DIR, { recursive: true });
  // URLs are like .../media?path=event-recap-.../linkedin/<hash>.jpg — the
  // basename of the URL pathname is just "media". Use the `?path=` query
  // tail (after the last slash) as a unique slug.
  const u = new URL(asset.url);
  const pathQuery = u.searchParams.get('path') ?? u.pathname;
  const slug = pathQuery.split('/').pop() ?? path.basename(u.pathname);
  for (const aspect of ASPECTS) {
    const z = zones[aspect.key];
    const canvasW = 200;
    const canvasH = Math.round((aspect.h / aspect.w) * canvasW);
    // Render visible source crop region as a thumbnail with a red grid overlay
    const visibleRects = visibleRectsForCrop(
      computeFaceAwareTransform(asset, aspect.w / aspect.h, { allowPan: true }),
      asset,
      aspect.w / aspect.h
    );
    // Use the first endpoint for the diagnostic thumb
    const vis = visibleRects[0];
    const srcX = Math.round(vis.x * mask.width);
    const srcY = Math.round(vis.y * mask.height);
    const srcW = Math.round(vis.w * mask.width);
    const srcH = Math.round(vis.h * mask.height);

    // Compose: white-background thumb of dimensions canvasW × canvasH with
    // mask cells overlaid in red (alpha scaled by occupancy).
    const overlays: sharp.OverlayOptions[] = [];
    const cellW = canvasW / GRID;
    const cellH = canvasH / GRID;
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const occ = z.grid[r][c];
        if (occ < 0.05) continue;
        const alpha = Math.round(Math.min(1, occ) * 200);
        const svg = `<svg width="${cellW}" height="${cellH}">
            <rect width="${cellW}" height="${cellH}" fill="rgba(255,0,80,${alpha / 255})" stroke="rgba(255,0,80,0.9)"/>
          </svg>`;
        overlays.push({
          input: Buffer.from(svg),
          left: Math.round(c * cellW),
          top: Math.round(r * cellH),
        });
      }
    }
    const base = await sharp({
      create: {
        width: canvasW,
        height: canvasH,
        channels: 3,
        background: '#f4eee0',
      },
    })
      .composite(overlays)
      .png()
      .toBuffer();
    await writeFile(
      path.join(DIAG_DIR, `${slug}.${aspect.key}.zones.png`),
      base
    );
  }
}

async function main(): Promise<void> {
  const diag = process.argv.includes('--diag');
  const out: ZonesFile = {};
  const images = aie2026MediaPool.filter((m) => m.type === 'image' && m.faces && m.faces.length > 0);
  console.log(`▸ building text-zones for ${images.length} assets × ${ASPECTS.length} aspects`);

  let centerCovered = 0;
  let panCount = 0;
  for (const [i, asset] of images.entries()) {
    process.stdout.write(`  ${(i + 1).toString().padStart(2)}/${images.length}  ${asset.url.slice(-40)}\r`);
    const mask = await loadCombinedMask(asset);
    if (!mask) {
      console.log(`\n  ${i + 1} skipped (no mask + no sourceDims)`);
      continue;
    }
    const entry: ZonesEntry = {} as ZonesEntry;
    for (const aspect of ASPECTS) {
      entry[aspect.key] = buildGrid(asset, mask, aspect);
    }
    out[asset.url] = entry;
    // Center cell (row 2, col 2)
    if (entry['9x16'].grid[2][2] > 0.15) centerCovered++;
    if (entry['9x16'].panCovered) panCount++;
    if (diag) {
      await maybeWriteDiag(asset, mask, entry);
    }
  }
  process.stdout.write('\n');

  await writeFile(ZONES_OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`✓ wrote ${Object.keys(out).length} entries → ${path.relative(ROOT, ZONES_OUT)}`);
  console.log(`  center cell (9:16) blocked > 0.15 occupancy: ${centerCovered}/${images.length}`);
  console.log(`  pan-mode crops (9:16): ${panCount}/${images.length}`);
  if (diag) {
    console.log(`  diag PNGs → ${path.relative(ROOT, DIAG_DIR)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
