#!/usr/bin/env node
/**
 * Pulls every campaign in Convex (across all workspaces) and prints a
 * human-readable index with /inspect + /workspace deep links + atlas
 * URLs. Used to quickly inventory cached lap runs for demo recording.
 *
 * Usage:
 *   node scripts/recordings/list-cached-runs.mjs > /tmp/aether-demo-runs/all-runs.md
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

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
const CONVEX_URL = ENV.NEXT_PUBLIC_CONVEX_URL ?? 'https://fiery-opossum-632.convex.cloud';
const APP_URL = ENV.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3030';

// Known workspace ids to scan. Convex has no public "list all campaigns"
// query; we list per-workspace. Add new wsIds here as the demo grows.
const WORKSPACE_IDS = [
  'demo-eightsleep-final',
  'demo-eightsleep-fixes',
  'demo-eightsleep-gpt2',
  'demo-eightsleep-exact',
  'demo-eightsleep-post',
  'demo-eightsleep-pub',
  'demo-eightsleep-v3',
  'demo-ikea-post',
  'demo-ikea-pub',
  'demo-ikea-v3',
  'demo-ws',
];

async function listByWorkspace(wsId) {
  const res = await fetch(`${CONVEX_URL}/api/run/campaigns/listByWorkspace`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ args: { workspaceId: wsId }, format: 'json' }),
  });
  const json = await res.json();
  if (json.status !== 'success') return [];
  return Array.isArray(json.value) ? json.value : [];
}

function fmtTime(t) {
  if (!t) return '—';
  return new Date(t).toISOString().replace('T', ' ').slice(0, 19);
}

async function main() {
  mkdirSync('/tmp/aether-demo-runs', { recursive: true });
  const all = [];
  for (const wsId of WORKSPACE_IDS) {
    const list = await listByWorkspace(wsId);
    for (const c of list) all.push({ wsId, ...c });
  }
  all.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));

  const lines = [];
  lines.push('# Cached Aether lap runs');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Convex: ${CONVEX_URL}`);
  lines.push('');
  lines.push('| When (UTC) | wsId | campaignId | status | trigger | headline | inspect | workspace | atlas |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const c of all) {
    const id = c.id;
    const status = c.status ?? '?';
    const trigger = (c.triggerPayload ?? '').slice(0, 60);
    const headline = ((c.researchBundle?.summary || '').slice(0, 80) || '—');
    const inspectUrl = `${APP_URL}/inspect/${id}`;
    const wsUrl = `${APP_URL}/workspace/${encodeURIComponent(c.wsId)}?campaign=${id}`;
    // Atlas URL lives on the variation, not the campaign — pull it via a
    // second query when status is completed/failed.
    let atlas = '—';
    try {
      const r = await fetch(`${CONVEX_URL}/api/run/campaigns/get`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ args: { campaignId: id }, format: 'json' }),
      });
      const j = await r.json();
      const v = j?.value?.variations?.[0];
      if (v?.atlasUrl) atlas = `[png](${v.atlasUrl})`;
    } catch { /* ignore */ }
    lines.push(
      `| ${fmtTime(c.startedAt)} | ${c.wsId} | \`${id}\` | ${status} | ${trigger} | ${headline} | [↗](${inspectUrl}) | [↗](${wsUrl}) | ${atlas} |`
    );
  }
  const output = lines.join('\n');
  console.log(output);
  writeFileSync('/tmp/aether-demo-runs/all-runs.md', output);
  console.error(`\n✓ wrote /tmp/aether-demo-runs/all-runs.md (${all.length} runs)`);
}

main().catch((err) => {
  console.error('✗ list-cached-runs failed:', err);
  process.exit(1);
});
