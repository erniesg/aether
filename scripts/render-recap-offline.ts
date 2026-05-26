/**
 * Offline EventRecap renderer — uses aie2026SampleBundle so it doesn't
 * depend on the live worker endpoint. Used for verification after
 * composition changes (face-aware crop, text placement, etc.).
 *
 * Output:
 *   out/aie2026/recap-9x16.mp4
 *   out/aie2026/recap-16x9.mp4
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { aie2026SampleBundle } from '../src/remotion/EventRecap/data';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const VARIANTS = [
  { id: 'EventRecapVertical' as const, label: '9x16' },
  { id: 'EventRecapHorizontal' as const, label: '16x9' },
];

async function main(): Promise<void> {
  const outDir = path.join(ROOT, 'out/aie2026');
  mkdirSync(outDir, { recursive: true });

  console.log(`▸ bundling Remotion composition`);
  const bundled = await bundle({
    entryPoint: path.join(ROOT, 'src/remotion/index.tsx'),
    onProgress: (p) => process.stdout.write(`\r  bundle ${Math.round(p)}%`),
  });
  process.stdout.write('\n');

  for (const variant of VARIANTS) {
    const inputProps = {
      bundle: aie2026SampleBundle,
      orientation: variant.id === 'EventRecapVertical' ? ('vertical' as const) : ('horizontal' as const),
    };
    const composition = await selectComposition({
      serveUrl: bundled,
      id: variant.id,
      inputProps,
    });
    const out = path.join(outDir, `recap-${variant.label}.mp4`);
    const t0 = Date.now();
    console.log(`▸ rendering ${variant.label} → ${path.relative(ROOT, out)}`);
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: 'h264',
      outputLocation: out,
      inputProps,
      onProgress: ({ progress }) => process.stdout.write(`\r  render ${Math.round(progress * 100)}%`),
    });
    process.stdout.write('\n');
    console.log(`✓ ${path.relative(ROOT, out)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
