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

const DEFAULT_BRIEF = [
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

// Override the brief without editing the file: --brief="…" or --brief=kfc
// for one of the canned moods. Anything else is treated as the literal
// payload. Refs (dingman + joe_glasses) are always passed.
const briefArg = arg('brief');
const CANNED_BRIEFS: Record<string, string> = {
  kfc: [
    'Documentary-style photo of the two men from the reference images',
    'sitting together at a KFC restaurant in Malaysia, eating fried',
    'chicken with their hands. Casual streetwear, late-afternoon natural',
    'light through the window, red-and-white KFC interior visible behind',
    'them, plates of chicken + fries + Pepsi cups on a melamine tray.',
    'Mood: candid, warm, friends sharing a meal. Preserve the EXACT faces,',
    'hair, and styling from the reference images. Same two men across all',
    '4 aspects (1:1, 4:5, 9:16, 16:9) — only framing changes.',
  ].join(' '),
};
const BRIEF =
  briefArg && CANNED_BRIEFS[briefArg]
    ? CANNED_BRIEFS[briefArg]
    : briefArg ?? DEFAULT_BRIEF;

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

  // The /api/auto-mode/run handler is synchronous — it doesn't return
  // until the entire lap finishes (research + cluster + N variations of
  // hero render + atlas compose + persistence). That's typically 4-8 min.
  // Node's default fetch headers-timeout is 5 min, which races us out
  // every time. Use an undici Agent with the headers timeout disabled.
  const { Agent } = await import('undici');
  const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
  const res = await fetch(`${apiBase}/api/auto-mode/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    // Cast: Node fetch accepts a `dispatcher` from undici but @types/node
    // doesn't expose it on RequestInit yet.
    ...({ dispatcher } as { dispatcher: unknown }),
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
