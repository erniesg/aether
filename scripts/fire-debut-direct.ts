#!/usr/bin/env tsx
/**
 * fire-debut-direct — mirrors the UI's drag-into-composer flow.
 *
 * The auto-mode lap (scripts/fire-debut-lap.ts) wraps every render in:
 *   research → 2 variations × { agent loop with mega-prompt → /api/generate
 *   → per-format hero-anchor cascade × 3 aspects }
 *
 * That cascade dilutes ref identity because (a) the agent's auto-generated
 * layout-aware prompt is ~600 chars of subject specifics that compete with
 * the ref pixels, and (b) per-format calls anchor on the (possibly drifted)
 * 1:1 hero output.
 *
 * The UI drag-into-composer flow does ONE direct call to /api/generate
 * with the user's short prompt + the dropped refs. This script does the
 * same — and saves every returned PNG to disk so we can eyeball the output.
 *
 * Usage:
 *   npx tsx scripts/fire-debut-direct.ts
 *   npx tsx scripts/fire-debut-direct.ts --prompt="…"
 *   npx tsx scripts/fire-debut-direct.ts --prompt="…" --aspect=1:1
 *
 * Output:
 *   /tmp/aether-demo-runs/debut-direct-<ts>/{aspect}.png  (one per target)
 *
 * Reqs:
 *   - aether dev server on http://localhost:3030
 *   - ~/Downloads/dingman4k.png + ~/Downloads/joe_glasses.png present
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DOWNLOADS = join(homedir(), 'Downloads');
const REFS = ['dingman4k.png', 'joe_glasses.png'];

const argv = process.argv.slice(2);
const arg = (k: string) =>
  argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');

const apiBase = arg('api') ?? 'http://localhost:3030';
const aspectFilter = arg('aspect');
const customPrompt = arg('prompt');

// Short, identity-leaning prompt — leans on the refs to carry subjects, only
// describes the SCENE / MOOD / FRAMING. This mirrors what a creator would
// actually type in the composer when they drag in two photos.
const DEFAULT_PROMPT =
  'Editorial magazine cover featuring the two men from the reference photos as the duo. ' +
  'Quiet luxury, golden-hour key light, kodak portra grain, 50mm prime. ' +
  'Preserve the EXACT faces, hair, and styling from the reference images.';

const PROMPT = customPrompt ?? DEFAULT_PROMPT;

interface TargetSpec {
  id: string;
  label: string;
  aspectRatio: '1:1' | '4:5' | '9:16' | '16:9';
}

const ALL_TARGETS: TargetSpec[] = [
  { id: '1x1', label: 'IG Square', aspectRatio: '1:1' },
  { id: '4x5', label: 'IG Portrait', aspectRatio: '4:5' },
  { id: '9x16', label: 'Reel/Story', aspectRatio: '9:16' },
  { id: '16x9', label: 'LinkedIn', aspectRatio: '16:9' },
];

function readAsDataUrl(path: string): string {
  const buf = readFileSync(path);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

interface GenerateEvent {
  type?: string;
  frame?: { id?: string; aspectRatio?: string; index?: number; total?: number };
  image?: { url?: string; width?: number; height?: number };
  result?: { images?: Array<{ url?: string; b64_json?: string; dataUrl?: string }> };
  error?: string;
  message?: string;
}

async function streamGenerate(target: TargetSpec, refs: string[]): Promise<Buffer | null> {
  const body = {
    prompt: PROMPT,
    refs: refs.map((r) => ({ url: r })),
    aspectRatio: target.aspectRatio,
    targets: [target],
    bypassAgent: true, // skip Claude planner; the composer-direct flow uses the
                      // user's prompt verbatim. Same effect as ?bypass=1 in UI.
    mode: 'fanout',
  };

  console.log(`▸ POST /api/generate · ${target.label} ${target.aspectRatio}`);

  const { Agent } = await import('undici');
  const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
  const res = await fetch(`${apiBase}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...({ dispatcher } as { dispatcher: unknown }),
  });

  if (!res.ok) {
    console.error(`✗ ${target.label}: HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
    return null;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    console.error(`✗ ${target.label}: empty stream`);
    return null;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let imageUrl: string | undefined;
  let dataUrl: string | undefined;
  let err: string | undefined;

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    if (done) buffer += decoder.decode();

    let bd = buffer.indexOf('\n\n');
    while (bd !== -1) {
      const frame = buffer.slice(0, bd);
      buffer = buffer.slice(bd + 2);
      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      if (dataLine) {
        try {
          const ev = JSON.parse(dataLine.slice(5).trim()) as GenerateEvent;
          if (ev.type === 'frame.completed' || ev.type === 'run.completed') {
            const img = ev.image ?? ev.result?.images?.[0];
            if (img && 'url' in img && img.url) imageUrl ??= img.url;
            if (img && 'b64_json' in img && (img as { b64_json?: string }).b64_json) {
              dataUrl ??= `data:image/png;base64,${(img as { b64_json: string }).b64_json}`;
            }
            if (img && 'dataUrl' in img && (img as { dataUrl?: string }).dataUrl) {
              dataUrl ??= (img as { dataUrl: string }).dataUrl;
            }
          } else if (ev.type === 'run.failed' || ev.type === 'frame.failed') {
            err = ev.error ?? ev.message ?? 'unknown stream error';
          }
        } catch {
          // Ignore non-JSON frames.
        }
      }
      bd = buffer.indexOf('\n\n');
    }

    if (done) break;
  }

  if (err) {
    console.error(`✗ ${target.label}: ${err}`);
    return null;
  }

  // Resolve to bytes.
  if (dataUrl?.startsWith('data:')) {
    const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return Buffer.from(b64, 'base64');
  }
  if (imageUrl) {
    const r = await fetch(imageUrl);
    if (!r.ok) {
      console.error(`✗ ${target.label}: fetch image url ${r.status}`);
      return null;
    }
    return Buffer.from(await r.arrayBuffer());
  }
  console.error(`✗ ${target.label}: no image in stream`);
  return null;
}

async function main() {
  const refs = REFS.map((name) => {
    const path = join(DOWNLOADS, name);
    const dataUrl = readAsDataUrl(path);
    const sizeKb = Math.round(dataUrl.length / 1024);
    console.log(`▸ loaded ref: ${name} (${sizeKb}KB as data url)`);
    return dataUrl;
  });

  const targets = aspectFilter
    ? ALL_TARGETS.filter((t) => t.aspectRatio === aspectFilter)
    : ALL_TARGETS;
  if (targets.length === 0) {
    console.error(`✗ no targets matched --aspect=${aspectFilter}`);
    process.exit(1);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = `/tmp/aether-demo-runs/debut-direct-${ts}`;
  mkdirSync(outDir, { recursive: true });
  console.log(`▸ output dir: ${outDir}`);
  console.log(`▸ prompt[0..120]: ${PROMPT.slice(0, 120)}…`);
  console.log();

  const results = await Promise.all(
    targets.map(async (t) => ({ target: t, bytes: await streamGenerate(t, refs) }))
  );

  console.log();
  for (const { target, bytes } of results) {
    if (!bytes) {
      console.log(`✗ ${target.label} ${target.aspectRatio}: no bytes`);
      continue;
    }
    const out = join(outDir, `${target.id}.png`);
    writeFileSync(out, bytes);
    console.log(`✓ ${target.label} ${target.aspectRatio}: ${Math.round(bytes.length / 1024)}KB → ${out}`);
  }
  console.log();
  console.log(`▸ open ${outDir} to inspect`);
  console.log(`▸ open -R ${outDir}/${targets[0].id}.png  # reveal in Finder`);
}

main().catch((err) => {
  console.error('✗ fatal:', err);
  process.exit(1);
});
