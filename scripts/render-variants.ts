/**
 * Render all 20 variant MP4s (10 variants × 2 orientations).
 *
 * Usage:
 *   npx tsx scripts/render-variants.ts                     # render all
 *   npx tsx scripts/render-variants.ts sundance-doc        # render one slug
 *   npx tsx scripts/render-variants.ts sundance-doc apple  # render multiple
 *
 * Output: out/variants/<slug>-{9x16,16x9}.mp4
 *
 * Uses a single Remotion bundle pass and reuses it across every variant
 * to avoid the 30s+ bundle cost per render.
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { aie2026SampleBundle } from '../src/remotion/EventRecap/data';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ALL_SLUGS = [
  'sundance-doc',
  'mrbeast-hyper',
  'apple-keynote',
  'synthwave-cyber',
  'editorial-newspaper',
  'y2k-maximalist',
  'vhs-doc',
  'brand-sizzle',
  'swiss-minimal',
  'terminal-nerd',
] as const;

const ORIENTATIONS = [
  { label: '9x16', suffix: 'Vertical' as const },
  { label: '16x9', suffix: 'Horizontal' as const },
];

async function main(): Promise<void> {
  const argSlugs = process.argv.slice(2);
  const slugs: readonly string[] =
    argSlugs.length > 0 ? ALL_SLUGS.filter((s) => argSlugs.some((a) => s.startsWith(a))) : ALL_SLUGS;
  if (slugs.length === 0) {
    console.error(`No matching slugs for: ${argSlugs.join(', ')}`);
    console.error(`Available: ${ALL_SLUGS.join(', ')}`);
    process.exit(1);
  }

  const outDir = path.join(ROOT, 'out/variants');
  mkdirSync(outDir, { recursive: true });

  console.log(`▸ bundling Remotion entry`);
  const bundled = await bundle({
    entryPoint: path.join(ROOT, 'src/remotion/index.tsx'),
    onProgress: (p) => process.stdout.write(`\r  bundle ${Math.round(p)}%`),
  });
  process.stdout.write('\n');

  const t0 = Date.now();
  let done = 0;
  const total = slugs.length * ORIENTATIONS.length;

  for (const slug of slugs) {
    for (const orient of ORIENTATIONS) {
      const compId = `Variant-${slug}-${orient.suffix}`;
      const out = path.join(outDir, `${slug}-${orient.label}.mp4`);
      const inputProps = {
        bundle: aie2026SampleBundle,
        orientation: orient.suffix === 'Vertical' ? ('vertical' as const) : ('horizontal' as const),
      };
      const composition = await selectComposition({
        serveUrl: bundled,
        id: compId,
        inputProps,
      });
      console.log(`▸ rendering ${compId}`);
      await renderMedia({
        composition,
        serveUrl: bundled,
        codec: 'h264',
        outputLocation: out,
        inputProps,
        onProgress: ({ progress }) =>
          process.stdout.write(`\r  render ${Math.round(progress * 100)}%`),
      });
      done += 1;
      const elapsed = (Date.now() - t0) / 1000;
      process.stdout.write(`\r  ✓ ${path.relative(ROOT, out)}  (${done}/${total} · ${elapsed.toFixed(0)}s)\n`);
    }
  }

  console.log(`\nDone. ${done} MP4s in ${path.relative(ROOT, outDir)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
