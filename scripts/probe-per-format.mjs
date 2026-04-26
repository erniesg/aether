/**
 * Direct probe: call renderPerFormatHeroes with the exact prompt + refs
 * the eightsleep lap used, see if 4:5/9:16/16:9 actually fire.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = '/Users/erniesg/code/erniesg/aether';
async function loadEnvLocal() {
  const text = await fs.readFile(path.join(ROOT, '.env.local'), 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

await loadEnvLocal();
const lap = JSON.parse(
  await fs.readFile(
    path.join(ROOT, 'docs/handoffs/auto-mode-evidence/auto-post-smoke-2026-04-26-night/lap-response.json'),
    'utf8'
  )
);
const step = lap.variations[0].agentSteps.find((s) => s.name === 'generate_image');
const prompt = step.input.prompt;
console.log('prompt length:', prompt.length);
console.log('prompt head:', prompt.slice(0, 120) + '…');

const refs = (lap.urlIngestion?.images || []).slice(0, 1).map((i) => ({ url: i.url }));
console.log('refs:', refs);

const mod = await import(
  pathToFileURL(path.join(ROOT, 'lib/agent/per-format-render.ts')).href
);
console.log('\nfiring renderPerFormatHeroes for [4:5, 9:16, 16:9] in parallel…');
const t0 = Date.now();
const result = await mod.renderPerFormatHeroes({
  prompt,
  refs,
  aspectRatios: ['4:5', '9:16', '16:9'],
});
const elapsed = Date.now() - t0;
console.log(`\n⌚ totalLatencyMs: ${result.totalLatencyMs} (script wallclock: ${elapsed}ms)`);
console.log('byAspect size:', result.byAspect.size);
for (const [aspect, r] of result.byAspect) {
  console.log(`  ${aspect}: ${r.width}×${r.height}  url=${r.url?.slice(0, 60)}…  latency=${r.latencyMs}ms`);
}
console.log('errorsByAspect:');
for (const [aspect, err] of result.errorsByAspect) {
  console.log(`  ${aspect}: ${err}`);
}
