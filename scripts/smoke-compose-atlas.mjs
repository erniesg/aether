/**
 * One-off smoke: run lib/text-overlay/compose against the v2 eightsleep
 * evidence (hero.png + text-overlays.json) so we can eyeball the atlas
 * before declaring the feature done.
 *
 * Output:
 *   $EVIDENCE/atlas-smoke-2026-04-26/atlas.png  — 4×4 (1520×1520) atlas
 *   $EVIDENCE/atlas-smoke-2026-04-26/tiles/<format>-<locale>.png × 16
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// vitest's @/ alias is enforced by vitest config; for a node smoke we just
// import the built TS via tsx/loader. The simpler path: write the smoke as
// JS that re-implements the call by importing the lib through a dynamic
// path resolved from cwd.

const ROOT = '/Users/erniesg/code/erniesg/aether';
const EV = path.join(
  ROOT,
  'docs/handoffs/auto-mode-evidence/eightsleep-smoke-v2-2026-04-26'
);
const OUT = path.join(
  ROOT,
  'docs/handoffs/auto-mode-evidence/atlas-smoke-2026-04-26'
);

async function run() {
  // Import via tsx (already in devDeps in this repo's typical setup);
  // dynamic import lets us pick up the path-alias compiler.
  const { composeVariantSet, COMPOSE_FORMATS, COMPOSE_LOCALES } = await import(
    pathToFileURL(path.join(ROOT, 'lib/text-overlay/compose.ts')).href
  );

  await fs.mkdir(path.join(OUT, 'tiles'), { recursive: true });

  const heroBytes = await fs.readFile(path.join(EV, 'hero.png'));
  const textOverlays = JSON.parse(
    await fs.readFile(path.join(EV, 'text-overlays.json'), 'utf8')
  );

  const t0 = Date.now();
  const out = await composeVariantSet({ heroBytes, textOverlays });
  const elapsed = Date.now() - t0;

  await fs.writeFile(path.join(OUT, 'atlas.png'), out.atlas);
  for (const format of COMPOSE_FORMATS) {
    for (const locale of COMPOSE_LOCALES) {
      const key = `${format.id}-${locale}`;
      await fs.writeFile(
        path.join(OUT, 'tiles', `${key}.png`),
        out.tiles.get(key)
      );
    }
  }
  console.log(
    `wrote atlas (${out.atlasTileSize * 4}×${out.atlasTileSize * 4}) and 16 tiles in ${elapsed}ms`
  );
  console.log(`output: ${path.relative(ROOT, OUT)}`);
}

run().catch((err) => {
  console.error('compose smoke failed:', err);
  process.exit(1);
});
