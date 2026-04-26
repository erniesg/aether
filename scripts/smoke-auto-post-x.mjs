/**
 * Standalone smoke: run a full Auto Mode lap and let the platform-aware
 * publisher route the X variation to the X direct adapter (real tweet).
 *
 * Bypasses the Next dev server entirely so we don't have to restart it
 * to pick up the new .env.local. Loads .env.local explicitly via
 * dotenv-style line parsing, then imports lib/agent/auto-mode.ts and
 * calls runAutoMode with notifyMode='auto-post' + forcePostNow=true.
 *
 * Output:
 *   docs/handoffs/auto-mode-evidence/auto-post-smoke-2026-04-26-night/
 *     lap-response.json    — the full AutoModeResult
 *     scheduled-posts.json — slim version
 *
 * Usage:
 *   node scripts/smoke-auto-post-x.mjs <trigger-url-or-text>
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = '/Users/erniesg/code/erniesg/aether';
const OUT = path.join(
  ROOT,
  'docs/handoffs/auto-mode-evidence/auto-post-smoke-2026-04-26-night'
);

async function loadEnvLocal() {
  const text = await fs.readFile(path.join(ROOT, '.env.local'), 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    // Strip wrapping quotes if any.
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

async function run() {
  await loadEnvLocal();
  await fs.mkdir(OUT, { recursive: true });

  // Sanity: report which adapters are configured.
  console.log('env check:');
  console.log(
    '  X_API_KEY:',
    process.env.X_API_KEY ? '✓' : '✗',
    '· X_ACCESS_TOKEN:',
    process.env.X_ACCESS_TOKEN ? '✓' : '✗'
  );
  console.log(
    '  IG_ACCESS_TOKEN:',
    process.env.IG_ACCESS_TOKEN ? '✓' : '✗',
    '· IG_USER_ID:',
    process.env.IG_USER_ID ? '✓' : '✗'
  );
  console.log('  POSTIZ_API_KEY:', process.env.POSTIZ_API_KEY ? '✓' : '✗');
  console.log(
    '  AUTO_MODE_NATIVE_PER_FORMAT:',
    process.env.AUTO_MODE_NATIVE_PER_FORMAT ?? '(unset)'
  );

  const trigger = process.argv[2] ?? 'https://www.eightsleep.com/';
  const triggerKind = trigger.startsWith('http') ? 'url' : 'text';

  console.log(`\nfiring lap: ${triggerKind} = ${trigger}`);
  console.log('  notifyMode = auto-post (platform=x → real tweet)');
  console.log('  forcePostNow = true (X publisher requires <5min schedule)\n');

  // Workspace id must be a real Convex doc id; reuse an existing one
  // from the prior smoke. The script accepts an override via env.
  const workspaceId =
    process.env.AETHER_SMOKE_WORKSPACE_ID ?? 'ns70jsnk798gy6e4jct3xdnsdd85j793';

  // Dynamic import so env is loaded first.
  const mod = await import(
    pathToFileURL(path.join(ROOT, 'lib/agent/auto-mode.ts')).href
  );
  const t0 = Date.now();
  const result = await mod.runAutoMode({
    baseUrl: 'http://localhost:3002',
    workspaceId,
    trigger: { kind: triggerKind, payload: trigger },
    variationCount: 1,
    notifyMode: 'auto-post',
    forcePostNow: true,
  });
  const elapsed = Date.now() - t0;
  console.log(`lap completed in ${(elapsed / 1000).toFixed(1)}s`);

  await fs.writeFile(
    path.join(OUT, 'lap-response.json'),
    JSON.stringify(result, null, 2)
  );
  await fs.writeFile(
    path.join(OUT, 'scheduled-posts.json'),
    JSON.stringify(
      {
        status: result.status,
        campaignId: result.campaignId,
        scheduledPostIds: result.scheduledPostIds,
        variations: result.variations.map((v) => ({
          index: v.index,
          status: v.status,
          schedulePlatform: v.schedulePlatform,
          scheduleWhenLocal: v.scheduleWhenLocal,
          caption: v.caption,
          atlasUrl: v.atlasUrl,
          heroImageUrl: v.heroImageUrl,
          masksOneShot: v.masksOneShot
            ? { matched: v.masksOneShot.matched, count: v.masksOneShot.masks?.length }
            : null,
          masksVisionGuided: v.masksVisionGuided
            ? {
                matched: v.masksVisionGuided.matched,
                count: v.masksVisionGuided.masks?.length,
              }
            : null,
          error: v.error,
        })),
      },
      null,
      2
    )
  );
  console.log(`evidence: ${path.relative(ROOT, OUT)}`);
  console.log('\nresult summary:');
  console.log('  status:', result.status);
  console.log('  campaignId:', result.campaignId);
  console.log('  scheduledPostIds:', result.scheduledPostIds);
  console.log(
    '  variation[0] platform:',
    result.variations[0]?.schedulePlatform
  );
  console.log(
    '  variation[0] scheduledWhenLocal:',
    result.variations[0]?.scheduleWhenLocal
  );
}

run().catch((err) => {
  console.error('smoke failed:', err);
  process.exit(1);
});
