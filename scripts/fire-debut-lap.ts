#!/usr/bin/env tsx
/**
 * fire-debut-lap — fires a full auto-mode lap with the editorial fashion
 * brief + dingman4k.png + joe_glasses.png from ~/Downloads as the brand
 * reference images. Tests the full pipeline end-to-end against durable
 * demo refs (no upstream URLs that 404), with hero-anchored cross-aspect
 * identity.
 *
 * Usage:
 *   npx tsx scripts/fire-debut-lap.ts
 *   npx tsx scripts/fire-debut-lap.ts --workspace=demo-debut-2
 *
 * Reqs:
 *   - aether dev server running on http://localhost:3030
 *   - ~/Downloads/dingman4k.png and ~/Downloads/joe_glasses.png present
 *   - .env.local has AUTO_MODE_USE_MANAGED_AGENTS=0 + AUTO_MODE_HERO_ANCHOR
 *     unset (or =1) so identity anchoring kicks in
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DOWNLOADS = join(homedir(), 'Downloads');
const REFS = ['dingman4k.png', 'joe_glasses.png'];

const argv = process.argv.slice(2);
const arg = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const workspaceId = arg('workspace') ?? 'demo-debut-editorial';
const apiBase = arg('api') ?? 'http://localhost:3030';

const BRIEF = [
  'Editorial fashion magazine cover photograph for "登场 DEBUT" magazine,',
  'featuring two East Asian male models styled together as a duo — one',
  'with rimless glasses in a tailored chrome-grey wool suit, the other',
  'with a clean side-part haircut in a cream silk shirt and high-rise',
  'pleated trousers. Cinematic Singapore studio scene, quiet luxury,',
  'golden-hour key light from camera-left, kodak portra film grain,',
  'shallow depth on a 50mm prime. Mood: debut energy, neo-futurist',
  'Vogue. Anchor identity across all 4 social aspects (1:1, 4:5, 9:16,',
  '16:9) — same subjects, same styling, only the canvas extent changes.',
].join(' ');

function readAsDataUrl(path: string): string {
  const buf = readFileSync(path);
  const b64 = buf.toString('base64');
  return `data:image/png;base64,${b64}`;
}

async function main() {
  const refs = REFS.map((name) => {
    const path = join(DOWNLOADS, name);
    const dataUrl = readAsDataUrl(path);
    const sizeKb = Math.round(dataUrl.length / 1024);
    console.log(`▸ loaded ref: ${name} (${sizeKb}KB as data url)`);
    return { dataUrl };
  });

  console.log(`▸ firing auto-mode lap`);
  console.log(`  workspace: ${workspaceId}`);
  console.log(`  refs: ${REFS.length}`);
  console.log(`  brief: ${BRIEF.slice(0, 100)}…`);

  const body = {
    workspaceId,
    trigger: { kind: 'text', payload: BRIEF },
    variationCount: 2,
    notifyMode: 'notify',
    concurrency: 'parallel',
    useManagedAgents: false,
    referenceImages: refs,
  };

  const res = await fetch(`${apiBase}/api/auto-mode/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`✗ ${res.status}: ${text.slice(0, 400)}`);
    process.exit(1);
  }

  const json = (await res.json()) as { ok: boolean; campaignId?: string; error?: string };
  if (!json.ok || !json.campaignId) {
    console.error(`✗ kickoff failed: ${json.error ?? 'unknown'}`);
    process.exit(1);
  }

  console.log();
  console.log(`✓ campaign fired`);
  console.log(`  id:        ${json.campaignId}`);
  console.log(`  inspect:   ${apiBase}/inspect/${json.campaignId}`);
  console.log(`  workspace: ${apiBase}/workspace/${workspaceId}?campaign=${json.campaignId}`);
  console.log();
  console.log('▸ /inspect auto-refreshes every 5s; /workspace streams live via Convex.');
}

main().catch((err) => {
  console.error('✗ fatal:', err);
  process.exit(1);
});
