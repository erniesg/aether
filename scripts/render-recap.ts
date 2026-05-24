/**
 * Render the recap reel for a given eventId.
 *
 * Usage:
 *   npx tsx scripts/render-recap.ts                 # defaults to aie2026
 *   npx tsx scripts/render-recap.ts aie-ny-2025     # render a different event
 *
 * Output:
 *   out/<eventId>/recap-9x16.mp4   1080×1920 · TikTok / Reels / Shorts
 *   out/<eventId>/recap-16x9.mp4   1920×1080 · YouTube / LinkedIn / X video
 *
 * Wired to cron (see lib/research/event-recap/refresh-trigger.ts) so a
 * fresh MP4 lands on R2 after every recap refresh.
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { fetchPublicBundle } from '../src/remotion/EventRecap/data';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const VARIANTS = [
  { id: 'EventRecapVertical' as const, label: '9x16' },
  { id: 'EventRecapHorizontal' as const, label: '16x9' },
];

async function main() {
  const eventId = process.argv[2] ?? 'aie2026';
  const origin = process.env.RECAP_ORIGIN ?? 'https://aether.berlayar.ai';
  const outDir = path.join(ROOT, 'out', eventId);
  mkdirSync(outDir, { recursive: true });

  console.log(`▸ fetching public bundle for ${eventId} from ${origin}`);
  const recapBundle = await fetchPublicBundle(eventId, origin);

  console.log(`▸ bundling Remotion composition`);
  const bundled = await bundle({
    entryPoint: path.join(ROOT, 'src/remotion/index.tsx'),
    onProgress: (p) => process.stdout.write(`\r  bundle ${Math.round(p)}%`),
  });
  process.stdout.write('\n');

  for (const variant of VARIANTS) {
    const inputProps = {
      bundle: recapBundle,
      orientation: variant.id === 'EventRecapVertical' ? ('vertical' as const) : ('horizontal' as const),
    };
    const composition = await selectComposition({
      serveUrl: bundled,
      id: variant.id,
      inputProps,
    });
    const out = path.join(outDir, `recap-${variant.label}.mp4`);
    console.log(`▸ rendering ${variant.label} → ${out}`);
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: 'h264',
      outputLocation: out,
      inputProps,
      onProgress: ({ progress }) => process.stdout.write(`\r  render ${Math.round(progress * 100)}%`),
    });
    process.stdout.write('\n');
    console.log(`✓ ${out}`);
  }

  console.log(`\nDone. Outputs in ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
