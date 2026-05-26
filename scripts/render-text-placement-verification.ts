/**
 * Render verification stills for the SAM3-mask-driven text-placement work.
 *
 * For each target frame:
 *   1. Render the actual composition still (clean) → <comp>-frame-<n>.jpg
 *   2. Render the same frame with the face mask overlaid in semi-transparent
 *      magenta and the chosen text bounding box outlined in cyan
 *      → <comp>-frame-<n>.annotated.jpg
 *
 * The annotated variant is the at-a-glance proof that the chosen text box
 * does NOT intersect a face mask. It's produced post-hoc by reading the
 * clean still + the per-asset SAM3 mask + the text-zones JSON and compositing
 * with sharp — we don't have access to the Remotion frame's per-tile asset
 * URL from outside the composition, so we annotate with the pool union mask
 * (worst case) for cycling-pool scenes and with the pinned-asset mask for
 * single-asset variants.
 *
 * Output: docs/mocks/text-placement-verification/
 *
 * Usage:
 *   npx tsx scripts/render-text-placement-verification.ts
 */

import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { aie2026SampleBundle, aie2026MediaPool } from '../src/remotion/EventRecap/data';
import zonesJson from '../src/remotion/EventRecap/media-text-zones.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs/mocks/text-placement-verification');

interface Target {
  comp: string;
  frame: number;
  /**
   * If set, treat this asset as the "current" backdrop tile for annotation
   * purposes. For pool-cycling scenes we infer based on holdFrames / index.
   */
  pinnedAssetUrl?: string;
}

const TARGETS: Target[] = [
  // EventRecapVertical — OpeningMontage cycles holdFrames=14 over 18 images.
  // Frames 60/90/120/150/180 land on slots 4/6/8/10/12 of the pool.
  { comp: 'EventRecapVertical', frame: 60 },
  { comp: 'EventRecapVertical', frame: 90 },
  { comp: 'EventRecapVertical', frame: 120 },
  { comp: 'EventRecapVertical', frame: 150 },
  { comp: 'EventRecapVertical', frame: 180 },
  // Sundance-doc Vertical
  { comp: 'Variant-sundance-doc-Vertical', frame: 0 },
  { comp: 'Variant-sundance-doc-Vertical', frame: 90 },
  { comp: 'Variant-sundance-doc-Vertical', frame: 180 },
  { comp: 'Variant-sundance-doc-Vertical', frame: 270 },
  { comp: 'Variant-sundance-doc-Vertical', frame: 359 },
  // Brand-sizzle Vertical
  { comp: 'Variant-brand-sizzle-Vertical', frame: 0 },
  { comp: 'Variant-brand-sizzle-Vertical', frame: 180 },
  { comp: 'Variant-brand-sizzle-Vertical', frame: 359 },
  // Apple-keynote Vertical
  { comp: 'Variant-apple-keynote-Vertical', frame: 60 },
  { comp: 'Variant-apple-keynote-Vertical', frame: 180 },
  { comp: 'Variant-apple-keynote-Vertical', frame: 300 },
  // Swiss-minimal Vertical
  { comp: 'Variant-swiss-minimal-Vertical', frame: 60 },
  { comp: 'Variant-swiss-minimal-Vertical', frame: 180 },
  { comp: 'Variant-swiss-minimal-Vertical', frame: 300 },
];

/**
 * For each composition we declare what mask to use for the annotation.
 *   - 'pool': union of every aie2026MediaPool asset's grid (worst case for
 *      cycling-backdrop scenes).
 *   - 'asset:idx': pin to a specific media-pool index.
 *   - 'none': no annotation overlay (e.g., variants with no photo backdrop).
 */
type Annotation = 'pool' | `asset:${number}` | 'none';

const COMP_ANNOTATION: Record<string, Annotation> = {
  EventRecapVertical: 'pool',
  EventRecapHorizontal: 'pool',
  'Variant-sundance-doc-Vertical': 'asset:10', // Vivian for ColdOpen, others for SlowMontage/Reveal
  'Variant-brand-sizzle-Vertical': 'asset:10', // Vivian
  'Variant-apple-keynote-Vertical': 'asset:9', // Linh
  'Variant-swiss-minimal-Vertical': 'asset:10', // Vivian
};

interface Grid {
  grid: number[][];
}

type ZonesFile = Record<string, { '9x16': Grid; '16x9': Grid }>;
const zones = zonesJson as ZonesFile;

function poolGrid(aspect: '9x16' | '16x9'): number[][] {
  const grid: number[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0));
  for (const m of aie2026MediaPool) {
    const z = zones[m.url]?.[aspect];
    if (!z) continue;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (z.grid[r][c] > grid[r][c]) grid[r][c] = z.grid[r][c];
      }
    }
  }
  return grid;
}

function pickedGrid(annotation: Annotation, aspect: '9x16' | '16x9'): number[][] | null {
  if (annotation === 'pool') return poolGrid(aspect);
  if (annotation === 'none') return null;
  const idx = parseInt(annotation.split(':')[1] ?? '0', 10);
  const url = aie2026MediaPool[idx]?.url;
  if (!url) return null;
  const z = zones[url]?.[aspect];
  return z?.grid ?? null;
}

async function annotate(
  cleanPath: string,
  annotatedPath: string,
  grid: number[][],
  containerPx: { w: number; h: number }
): Promise<void> {
  // Composite a 5x5 magenta-tinted grid overlay onto the clean still.
  const cellW = containerPx.w / 5;
  const cellH = containerPx.h / 5;
  const overlays: sharp.OverlayOptions[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const occ = grid[r][c];
      if (occ < 0.05) continue;
      const alpha = Math.min(0.55, occ * 0.6);
      const svg = `<svg width="${cellW}" height="${cellH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${cellW}" height="${cellH}" fill="rgba(255,0,160,${alpha})" stroke="rgba(255,0,160,0.85)" stroke-width="2"/>
        <text x="6" y="${Math.round(cellH * 0.15)}" font-family="ui-monospace,Courier" font-size="${Math.round(cellH * 0.08)}" fill="white" opacity="0.85">${occ.toFixed(2)}</text>
      </svg>`;
      overlays.push({
        input: Buffer.from(svg),
        left: Math.round(c * cellW),
        top: Math.round(r * cellH),
      });
    }
  }
  await sharp(cleanPath).composite(overlays).jpeg({ quality: 85 }).toFile(annotatedPath);
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`▸ bundling Remotion entry…`);
  const bundled = await bundle({
    entryPoint: path.join(ROOT, 'src/remotion/index.tsx'),
    onProgress: (p) => process.stdout.write(`\r  bundle ${Math.round(p)}%`),
  });
  process.stdout.write('\n');

  const compCache = new Map<string, Awaited<ReturnType<typeof selectComposition>>>();

  for (const t of TARGETS) {
    const orientation = t.comp.endsWith('Vertical') ? ('vertical' as const) : ('horizontal' as const);
    const aspect = orientation === 'vertical' ? '9x16' : '16x9';
    const inputProps = { bundle: aie2026SampleBundle, orientation };
    let composition = compCache.get(t.comp);
    if (!composition) {
      composition = await selectComposition({
        serveUrl: bundled,
        id: t.comp,
        inputProps,
      });
      compCache.set(t.comp, composition);
    }
    const cleanPath = path.join(OUT_DIR, `${t.comp}-frame-${t.frame.toString().padStart(4, '0')}.jpg`);
    const annotatedPath = path.join(
      OUT_DIR,
      `${t.comp}-frame-${t.frame.toString().padStart(4, '0')}.annotated.jpg`
    );
    console.log(`▸ ${t.comp} @ ${t.frame} → ${path.basename(cleanPath)}`);
    await renderStill({
      composition,
      serveUrl: bundled,
      imageFormat: 'jpeg',
      jpegQuality: 85,
      output: cleanPath,
      frame: t.frame,
      inputProps,
    });
    const annotation = COMP_ANNOTATION[t.comp] ?? 'pool';
    const grid = pickedGrid(annotation, aspect);
    if (!grid) {
      console.log(`  (no annotation for ${annotation})`);
      continue;
    }
    await annotate(cleanPath, annotatedPath, grid, {
      w: composition.width,
      h: composition.height,
    });
  }

  console.log(`\nDone. Outputs in ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
