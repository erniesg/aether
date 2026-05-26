/**
 * SAM3-local face tagger for `aie2026MediaPool`.
 *
 * Downloads each photo, hands the local SAM3 model a list of paths via stdin,
 * collects per-image bbox+mask results, and writes a JSON sidecar at
 *   src/remotion/EventRecap/media-faces.sam3.json
 *
 * Mask PNGs are written into docs/mocks/face-tagging-compare/masks/.
 *
 * Local-only — never falls back to the Modal endpoint. If the local Python
 * subprocess fails (missing checkpoint, import error, etc.) we surface the
 * stderr verbatim so the operator can fix the venv.
 *
 * Usage:
 *   npx tsx scripts/tag-faces-sam3.ts
 *   npx tsx scripts/tag-faces-sam3.ts --force   # re-tag everything
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aie2026MediaPool } from '../src/remotion/EventRecap/data';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PY = '/Users/erniesg/code/erniesg/aether/.venv-local-models/bin/python';
const PY_SCRIPT = path.join(__dirname, '_sam3_face_tag.py');
const OUT_FILE = path.join(ROOT, 'src/remotion/EventRecap/media-faces.sam3.json');
const MASK_DIR = path.join(ROOT, 'docs/mocks/face-tagging-compare/masks');

interface FaceEntry {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence?: number;
  maskPath?: string;
  derivedFromPerson?: boolean;
}

interface SidecarEntry {
  sourceDims: { width: number; height: number };
  faces: FaceEntry[];
  tagger: 'sam3-local';
  elapsedMs: number;
  usedPersonFallback?: boolean;
}

type Sidecar = Record<string, SidecarEntry>;

async function downloadOne(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { 'user-agent': 'aether-recap-tagger/1.0' } });
  if (!res.ok) throw new Error(`download ${url} ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

async function runSam3(
  jobs: { key: string; path: string; maskDir: string }[]
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const child = spawn(PY, [PY_SCRIPT], {
      env: {
        ...process.env,
        HF_HUB_DISABLE_TELEMETRY: '1',
        // SAM3's geometry encoder hits aten::_assert_async on MPS which has
        // no fallback path that keeps all tensors on one device, so we pin
        // the model to CPU. ~5s per image on M-series; acceptable for 18.
      },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const out: string[] = [];
    child.stdout.on('data', (b: Buffer) => out.push(b.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`SAM3 subprocess exited ${code}`));
        return;
      }
      const lines = out.join('').split('\n').filter((l) => l.trim());
      try {
        resolve(lines.map((l) => JSON.parse(l)));
      } catch (e) {
        reject(new Error(`parse SAM3 stdout: ${(e as Error).message}\n${out.join('').slice(0, 500)}`));
      }
    });
    child.stdin.write(JSON.stringify(jobs));
    child.stdin.end();
  });
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  await mkdir(MASK_DIR, { recursive: true });

  // Load existing sidecar so a re-run is idempotent unless --force.
  let existing: Sidecar = {};
  try {
    existing = JSON.parse(await readFile(OUT_FILE, 'utf8')) as Sidecar;
  } catch {
    // first run
  }

  const images = aie2026MediaPool.filter((m) => m.type === 'image');
  const tmp = await mkdtemp(path.join(tmpdir(), 'sam3-face-'));
  console.log(`▸ SAM3 face-tag: ${images.length} images, tmp=${tmp}`);

  const jobs: { key: string; path: string; maskDir: string; url: string }[] = [];
  for (const [i, asset] of images.entries()) {
    if (!force && existing[asset.url]) {
      console.log(`  ${(i + 1).toString().padStart(2)}/${images.length}  cached`);
      continue;
    }
    const ext = path.extname(new URL(asset.url).pathname) || '.jpg';
    const dest = path.join(tmp, `${i}${ext}`);
    process.stdout.write(`  ${(i + 1).toString().padStart(2)}/${images.length}  downloading…\r`);
    await downloadOne(asset.url, dest);
    jobs.push({ key: asset.url, path: dest, maskDir: MASK_DIR, url: asset.url });
  }
  process.stdout.write('\n');

  if (jobs.length === 0) {
    console.log('▸ nothing to tag (use --force to re-tag)');
    await writeFile(OUT_FILE, JSON.stringify(existing, null, 2) + '\n', 'utf8');
    return;
  }

  console.log(`▸ invoking local SAM3 on ${jobs.length} images…`);
  const t0 = Date.now();
  const results = await runSam3(jobs.map(({ key, path: p, maskDir }) => ({ key, path: p, maskDir })));
  console.log(`▸ done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const sidecar: Sidecar = { ...existing };
  for (const r of results) {
    const key = String(r.key);
    if (r.ok === false) {
      console.warn(`  WARN  ${key.slice(-40)}  ${r.error}`);
      continue;
    }
    sidecar[key] = {
      sourceDims: r.sourceDims as { width: number; height: number },
      faces: r.faces as FaceEntry[],
      tagger: 'sam3-local',
      elapsedMs: r.elapsedMs as number,
      usedPersonFallback: Boolean(r.usedPersonFallback),
    };
  }

  await writeFile(OUT_FILE, JSON.stringify(sidecar, null, 2) + '\n', 'utf8');
  const tally = Object.entries(sidecar).reduce(
    (acc, [, v]) => ({
      faces: acc.faces + v.faces.length,
      fallback: acc.fallback + (v.usedPersonFallback ? 1 : 0),
    }),
    { faces: 0, fallback: 0 }
  );
  console.log(
    `✓ sidecar: ${Object.keys(sidecar).length} assets, ${tally.faces} faces ` +
      `(${tally.fallback} via person-fallback) → ${path.relative(ROOT, OUT_FILE)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
