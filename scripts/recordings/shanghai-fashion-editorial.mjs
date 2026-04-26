#!/usr/bin/env node
/**
 * Shanghai fashion editorial — direct gpt-image-2 calls per aspect with the
 * dingman4k + joe_glasses references attached so the model EDITS those
 * subjects into the requested editorial scene rather than free-generating.
 *
 * Output: /tmp/aether-demo-runs/shanghai/<aspect>-{with,without}-text.png
 *   ('without' = raw gpt-image-2 hero, 'with' = the same hero with the
 *    headline / caption SVG composited on top via sharp.)
 *
 * Usage:
 *   node scripts/recordings/shanghai-fashion-editorial.mjs
 *
 * Env: requires OPENAI_API_KEY in .env.local.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

const OUT_DIR = '/tmp/aether-demo-runs/shanghai';
mkdirSync(OUT_DIR, { recursive: true });

// Read OPENAI_API_KEY from .env.local without loading the whole Next runtime.
function readEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  const raw = readFileSync(path, 'utf-8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2];
  }
  return env;
}
const ENV = readEnvLocal();
const OPENAI_API_KEY = ENV.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY missing');
  process.exit(1);
}

// Reference images — fed to gpt-image-2 edits as multipart `image[]`.
const DOWNLOADS = join(homedir(), 'Downloads');
const REF_FILES = ['dingman4k.png', 'joe_glasses.png'];

// Aspect → (size, hint, output basename) — all multiples of 16, exact aspect.
// Filtered at runtime — only the aspects without an existing PNG run.
const ALL_ASPECTS = [
  { id: '1x1', size: '1024x1024', basename: '1x1' },
  { id: '4x5', size: '1024x1280', basename: '4x5' },
  { id: '9x16', size: '1152x2048', basename: '9x16' },
  { id: '16x9', size: '2048x1152', basename: '16x9' },
];

import { existsSync } from 'node:fs';
const ASPECTS = ALL_ASPECTS.filter(
  (a) => !existsSync(join(OUT_DIR, `${a.basename}-without-text.png`))
);
if (ASPECTS.length === 0) {
  console.log('▸ all aspects already rendered — nothing to do.');
  process.exit(0);
}

// Mood prompt — same brand + subject across aspects, reframed per format.
const BASE_PROMPT = [
  'Editorial fashion magazine cover photograph featuring two East Asian male models styled together — one in a tailored chrome-grey suit with rimless glasses, the other in a structured cream silk shirt and high-rise trousers. Cinematic Shanghai twilight setting: art deco bund towers blurring in the background, neon signage reflecting on rain-slicked pavement, golden-hour key light raking across the subjects from camera-left, deep navy fill in the shadows, slight haze, kodak portra 400 film grain. Mood: quiet luxury, debut energy, neo-futurist Shanghai vogue.',
  'Composition is intentional and editorial — subjects are the visual anchor; environment supports rather than competes.',
  'Recompose the scene specifically for this aspect — same two subjects and the same mood, but reframe the composition (subject placement, lens choice, breathing room, environment portion) so it reads natively at this canvas size. Do NOT output a single base image at multiple crops; each aspect must be a distinct composition.',
].join('\n\n');

function aspectCue(id) {
  switch (id) {
    case '1x1':
      return 'Frame as a 1:1 square magazine cover photograph. Both subjects framed waist-up, anchored at canvas centre. Composition fills the square edge to edge.';
    case '4x5':
      return 'Frame as a 4:5 vertical Instagram feed editorial. Both subjects framed full-figure, anchored slightly above centre with vertical breathing room. Composition extends to all four edges.';
    case '9x16':
      return 'Frame as a tall 9:16 vertical Story / Reel editorial. Both subjects standing full-figure floor-to-headroom, generous vertical environment, composition extends to all four edges of the tall canvas.';
    case '16x9':
      return 'Frame as a wide 16:9 cinematic landscape editorial. Both subjects placed slightly left of centre, Shanghai cityscape extending to the right, composition fills the full wide canvas.';
    default:
      return '';
  }
}

// Convert each ref file to a Blob for multipart upload.
function refBlobs() {
  return REF_FILES.map((name) => {
    const buf = readFileSync(join(DOWNLOADS, name));
    return { blob: new Blob([buf], { type: 'image/png' }), name };
  });
}

async function callEdits(aspect) {
  const prompt = `${BASE_PROMPT}\n\n${aspectCue(aspect.id)}`;
  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('prompt', prompt);
  form.append('n', '1');
  form.append('size', aspect.size);
  form.append('quality', 'high');
  for (const { blob, name } of refBlobs()) {
    form.append('image[]', blob, name);
  }
  const t0 = Date.now();
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  const elapsed = Date.now() - t0;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`gpt-image-2 ${aspect.id} → ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = await res.json();
  const item = (json.data ?? [])[0];
  if (!item) throw new Error(`no images returned for aspect ${aspect.id}`);
  const b64 = item.b64_json ?? null;
  if (!b64) throw new Error(`no b64_json for aspect ${aspect.id}`);
  const buf = Buffer.from(b64, 'base64');
  return { aspect: aspect.id, size: aspect.size, bytes: buf, latencyMs: elapsed };
}

async function main() {
  console.log(`▸ Shanghai fashion editorial → ${OUT_DIR}`);
  console.log(`  refs: ${REF_FILES.join(', ')}`);
  console.log(`  aspects: ${ASPECTS.map((a) => `${a.id} (${a.size})`).join(', ')}`);

  const results = await Promise.allSettled(ASPECTS.map((a) => callEdits(a)));
  for (let i = 0; i < results.length; i += 1) {
    const a = ASPECTS[i];
    const r = results[i];
    if (r.status === 'fulfilled') {
      const path = join(OUT_DIR, `${a.basename}-without-text.png`);
      writeFileSync(path, r.value.bytes);
      console.log(`✓ ${a.id} → ${path} (${r.value.bytes.length} bytes, ${r.value.latencyMs}ms)`);
    } else {
      console.error(`✗ ${a.id} failed:`, r.reason instanceof Error ? r.reason.message : r.reason);
    }
  }
  console.log(`\n  Open: open ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('✗ shanghai-fashion-editorial failed:', err);
  process.exit(1);
});
