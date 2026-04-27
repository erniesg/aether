#!/usr/bin/env node
/**
 * 登场 DEBUT magazine fashion editorial — direct gpt-image-2 calls per
 * aspect with the dingman4k + joe_glasses references attached so the model
 * EDITS those subjects into a "DEBUT issue cover" composition rather than
 * free-generating.
 *
 * Two passes per aspect:
 *   - WITHOUT text: bare editorial cover — designed to feed downstream
 *     auto-mode lap so Opus can generate caption + headline overlays itself.
 *   - WITH text:    bakes "登场 DEBUT" cover masthead + issue line into the
 *     image. gpt-image-2 handles CJK reasonably well at large sizes; smaller
 *     fonts are lossy. Use this as a stand-alone magazine cover artefact.
 *
 * Output: /tmp/aether-demo-runs/debut/<aspect>-{with,without}-text.png
 *
 * Usage:
 *   node scripts/recordings/debut-magazine-editorial.mjs
 *   node scripts/recordings/debut-magazine-editorial.mjs --only=without
 *   node scripts/recordings/debut-magazine-editorial.mjs --only=with
 *   node scripts/recordings/debut-magazine-editorial.mjs --aspects=1x1,9x16
 *
 * Env: requires OPENAI_API_KEY in .env.local.
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

const OUT_DIR = '/tmp/aether-demo-runs/debut';
mkdirSync(OUT_DIR, { recursive: true });

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

const DOWNLOADS = join(homedir(), 'Downloads');
const REF_FILES = ['dingman4k.png', 'joe_glasses.png'];

const ALL_ASPECTS = [
  { id: '1x1', size: '1024x1024', basename: '1x1' },
  { id: '4x5', size: '1024x1280', basename: '4x5' },
  { id: '9x16', size: '1152x2048', basename: '9x16' },
  { id: '16x9', size: '2048x1152', basename: '16x9' },
];

const argv = process.argv.slice(2);
const onlyArg = argv.find((a) => a.startsWith('--only='))?.split('=')[1] ?? 'both';
const aspectsArg = argv.find((a) => a.startsWith('--aspects='))?.split('=')[1];
const ASPECT_FILTER = aspectsArg
  ? new Set(aspectsArg.split(','))
  : new Set(ALL_ASPECTS.map((a) => a.id));

const PASSES = onlyArg === 'with' ? ['with'] : onlyArg === 'without' ? ['without'] : ['without', 'with'];

const SUBJECT = [
  'Editorial fashion magazine cover photograph featuring two East Asian male models styled together as a duo — one with rimless glasses in a tailored chrome-grey wool suit, the other with a clean side-part haircut in a structured cream silk shirt and high-rise pleated trousers.',
  'Lighting: cinematic golden-hour key from camera-left raking across both subjects, deep navy fill in the shadows, slight haze, kodak portra 400 film grain, shallow depth of field on a fast 50mm prime lens.',
  'Setting: a quiet modernist Shanghai studio scene — concrete and brushed metal backdrop, sparse mid-century furniture, soft cyan rim light from a window. Mood: quiet luxury, debut energy, neo-futurist Vogue.',
].join('\n\n');

const COMPOSITION_RULE =
  'Composition is intentional and editorial — both subjects are the visual anchor, environment supports rather than competes. Recompose the scene specifically for this aspect — same two subjects and the same mood, but reframe (subject placement, lens, breathing room, environment portion) so the photograph reads natively at this canvas size. Do NOT output a single base image at multiple crops; each aspect must be a distinct composition.';

function aspectCue(id) {
  switch (id) {
    case '1x1':
      return 'Frame as a 1:1 square magazine cover photograph. Both subjects framed waist-up side by side, anchored at canvas centre, composition fills the square edge to edge.';
    case '4x5':
      return 'Frame as a 4:5 vertical Instagram feed editorial cover. Both subjects framed full-figure, anchored slightly above centre with vertical breathing room above the heads.';
    case '9x16':
      return 'Frame as a tall 9:16 vertical Story / Reel editorial. Both subjects standing full-figure floor-to-headroom, generous vertical environment, subjects centred horizontally.';
    case '16x9':
      return 'Frame as a wide 16:9 cinematic landscape editorial spread. Both subjects placed slightly left of centre with the studio environment extending to the right, composition fills the full wide canvas.';
    default:
      return '';
  }
}

// Magazine masthead instructions injected only on the with-text pass. The
// model is told EXACTLY where to render which characters at what size — gpt-
// image-2 honours typography intent better when the cue is concrete.
const MASTHEAD_CUE = [
  'This is a magazine cover. Render the masthead "登场 DEBUT" in a tall, condensed serif typeface across the top of the canvas, with the Chinese characters 登场 set slightly larger than the Latin DEBUT to its right.',
  'Below the masthead, render an issue line in small uppercase Latin sans-serif: "ISSUE 001 · 2026 SPRING".',
  'Below the subjects, render a single short cover line in italic serif: "Quiet Luxury, Debut Energy".',
  'All cover text is white with a faint drop shadow for legibility against the photograph. Do not render any other text. Spelling must be EXACT — 登场 DEBUT — no transliterations or substitutions.',
].join('\n\n');

const NO_TEXT_CUE =
  'Do NOT render any text, captions, masthead, or graphic elements in the image. The photograph is bare — typography will be added in post.';

function refBlobs() {
  return REF_FILES.map((name) => {
    const buf = readFileSync(join(DOWNLOADS, name));
    return { blob: new Blob([buf], { type: 'image/png' }), name };
  });
}

async function callEdits({ aspect, pass }) {
  const cue = pass === 'with' ? MASTHEAD_CUE : NO_TEXT_CUE;
  const prompt = `${SUBJECT}\n\n${COMPOSITION_RULE}\n\n${aspectCue(aspect.id)}\n\n${cue}`;
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
    throw new Error(`gpt-image-2 ${aspect.id}/${pass} → ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = await res.json();
  const item = (json.data ?? [])[0];
  if (!item) throw new Error(`no images returned for ${aspect.id}/${pass}`);
  const b64 = item.b64_json ?? null;
  if (!b64) throw new Error(`no b64_json for ${aspect.id}/${pass}`);
  return { aspect: aspect.id, pass, bytes: Buffer.from(b64, 'base64'), latencyMs: elapsed };
}

async function main() {
  const aspectsToRun = ALL_ASPECTS.filter((a) => ASPECT_FILTER.has(a.id));
  const jobs = [];
  for (const aspect of aspectsToRun) {
    for (const pass of PASSES) {
      const out = join(OUT_DIR, `${aspect.basename}-${pass}-text.png`);
      if (existsSync(out)) {
        console.log(`▸ skip (exists): ${out}`);
        continue;
      }
      jobs.push({ aspect, pass, out });
    }
  }

  console.log(`▸ DEBUT magazine editorial → ${OUT_DIR}`);
  console.log(`  refs: ${REF_FILES.join(', ')}`);
  console.log(`  jobs: ${jobs.length} (${jobs.map((j) => `${j.aspect.id}/${j.pass}`).join(', ')})`);
  if (jobs.length === 0) {
    console.log('  nothing to do.');
    return;
  }

  const results = await Promise.allSettled(jobs.map((j) => callEdits(j)));
  for (let i = 0; i < results.length; i += 1) {
    const j = jobs[i];
    const r = results[i];
    if (r.status === 'fulfilled') {
      writeFileSync(j.out, r.value.bytes);
      console.log(`✓ ${j.aspect.id}/${j.pass} → ${j.out} (${r.value.bytes.length} bytes, ${r.value.latencyMs}ms)`);
    } else {
      console.error(`✗ ${j.aspect.id}/${j.pass} failed:`, r.reason instanceof Error ? r.reason.message : r.reason);
    }
  }
  console.log(`\n  Open: open ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('✗ debut-magazine-editorial failed:', err);
  process.exit(1);
});
