/**
 * Patches src/remotion/EventRecap/data.ts in-place to inline the SAM3 face
 * data (with MediaPipe as fallback when SAM3 missed an asset). Adds
 *   sourceDims: { width, height }
 *   faces:      [{ x, y, w, h, confidence, source }]
 * to each tagged MediaAsset literal.
 *
 * Idempotent: replaces any pre-existing sourceDims/faces entries on each line.
 *
 *   npx tsx scripts/patch-data-with-faces.ts
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'src/remotion/EventRecap/data.ts');
const SAM3_FILE = path.join(ROOT, 'src/remotion/EventRecap/media-faces.sam3.json');
const MP_FILE = path.join(ROOT, 'src/remotion/EventRecap/media-faces.mediapipe.json');

interface FaceEntry {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence?: number;
}
interface SidecarEntry {
  sourceDims: { width: number; height: number };
  faces: FaceEntry[];
  usedPersonFallback?: boolean;
}
type Sidecar = Record<string, SidecarEntry>;

function fmtNum(n: number, d = 3): string {
  return n.toFixed(d);
}

function fmtFace(face: FaceEntry, source: 'sam3' | 'mediapipe'): string {
  const parts: string[] = [
    `x: ${fmtNum(face.x)}`,
    `y: ${fmtNum(face.y)}`,
    `w: ${fmtNum(face.w)}`,
    `h: ${fmtNum(face.h)}`,
  ];
  if (typeof face.confidence === 'number') parts.push(`confidence: ${fmtNum(face.confidence, 2)}`);
  parts.push(`source: '${source}'`);
  return `{ ${parts.join(', ')} }`;
}

async function main(): Promise<void> {
  const sam3: Sidecar = JSON.parse(await readFile(SAM3_FILE, 'utf8'));
  const mp: Sidecar = JSON.parse(await readFile(MP_FILE, 'utf8'));

  const merged: Record<
    string,
    { sourceDims: { width: number; height: number }; faces: { face: FaceEntry; source: 'sam3' | 'mediapipe' }[] }
  > = {};
  const allKeys = new Set<string>([...Object.keys(sam3), ...Object.keys(mp)]);
  for (const url of allKeys) {
    const sam = sam3[url];
    const m = mp[url];
    if (sam && sam.faces.length > 0) {
      merged[url] = {
        sourceDims: sam.sourceDims,
        faces: sam.faces.map((face) => ({ face, source: 'sam3' as const })),
      };
    } else if (m && m.faces.length > 0) {
      merged[url] = {
        sourceDims: m.sourceDims,
        faces: m.faces.map((face) => ({ face, source: 'mediapipe' as const })),
      };
    }
  }
  console.log(`▸ merged ${Object.keys(merged).length} assets with faces`);

  const src = await readFile(DATA_FILE, 'utf8');
  const lines = src.split('\n');
  let patched = 0;

  for (const [url, info] of Object.entries(merged)) {
    const suffix = url.split('/').pop() ?? url;
    let touched = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.includes(`${suffix}'`) || !line.includes('PROXY')) continue;
      // Strip any pre-existing sourceDims/faces additions so we are idempotent.
      const stripped = line
        .replace(/, sourceDims: \{[^}]*\}/, '')
        .replace(/, faces: \[[^\]]*\]/, '');
      const sourceDimsStr = `, sourceDims: { width: ${info.sourceDims.width}, height: ${info.sourceDims.height} }`;
      const facesStr = `, faces: [${info.faces.map((e) => fmtFace(e.face, e.source)).join(', ')}]`;
      lines[i] = stripped.replace(/(\s*\},?)$/, (_m, tail) => sourceDimsStr + facesStr + tail);
      touched += 1;
    }
    if (touched === 0) console.warn(`  ! could not patch ${suffix}`);
    else patched += 1;
  }
  await writeFile(DATA_FILE, lines.join('\n'), 'utf8');
  console.log(`✓ patched ${patched} entries in ${path.relative(ROOT, DATA_FILE)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
