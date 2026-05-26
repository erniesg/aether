/**
 * Render the specific frames the reviewer flagged plus a few first/middle/
 * last frames of pan-capable variants, so we can eyeball that
 * faces don't get cut anymore.
 *
 * Targets:
 *   - EventRecapVertical    @ frames 60, 90   (Vivian close-up window)
 *   - Variant-sundance-doc-Vertical @ 0, 180, 359
 *   - Variant-brand-sizzle-Vertical @ 0, 180, 359
 *
 * Output: docs/mocks/face-aware-verification/<comp>-frame-<n>.jpg
 *
 * Usage:
 *   npx tsx scripts/render-face-aware-verification.ts
 */

import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { aie2026SampleBundle } from '../src/remotion/EventRecap/data';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs/mocks/face-aware-verification');

const TARGETS: Array<{ comp: string; frame: number }> = [
  { comp: 'EventRecapVertical', frame: 60 },
  { comp: 'EventRecapVertical', frame: 90 },
  { comp: 'Variant-sundance-doc-Vertical', frame: 0 },
  { comp: 'Variant-sundance-doc-Vertical', frame: 180 },
  { comp: 'Variant-sundance-doc-Vertical', frame: 359 },
  { comp: 'Variant-brand-sizzle-Vertical', frame: 0 },
  { comp: 'Variant-brand-sizzle-Vertical', frame: 180 },
  { comp: 'Variant-brand-sizzle-Vertical', frame: 359 },
];

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`▸ bundling Remotion entry…`);
  const bundled = await bundle({
    entryPoint: path.join(ROOT, 'src/remotion/index.tsx'),
    onProgress: (p) => process.stdout.write(`\r  bundle ${Math.round(p)}%`),
  });
  process.stdout.write('\n');

  // Cache compositions to avoid repeatedly selecting the same one.
  const compCache = new Map<string, Awaited<ReturnType<typeof selectComposition>>>();

  for (const target of TARGETS) {
    const orientation = target.comp.endsWith('Vertical') ? ('vertical' as const) : ('horizontal' as const);
    const inputProps = { bundle: aie2026SampleBundle, orientation };
    let composition = compCache.get(target.comp);
    if (!composition) {
      composition = await selectComposition({
        serveUrl: bundled,
        id: target.comp,
        inputProps,
      });
      compCache.set(target.comp, composition);
    }
    const out = path.join(OUT_DIR, `${target.comp}-frame-${target.frame.toString().padStart(4, '0')}.jpg`);
    console.log(`▸ rendering ${target.comp} @ frame ${target.frame} → ${path.basename(out)}`);
    await renderStill({
      composition,
      serveUrl: bundled,
      imageFormat: 'jpeg',
      jpegQuality: 85,
      output: out,
      frame: target.frame,
      inputProps,
    });
  }
  console.log(`\nDone. Outputs in ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
