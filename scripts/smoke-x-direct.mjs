/**
 * Direct X-publisher smoke: takes an existing hero image URL + caption
 * and posts it via the X adapter (real tweet). Bypasses the agent loop
 * so we can verify the publishing path independently of upstream
 * generation cost.
 *
 * Usage:
 *   node scripts/smoke-x-direct.mjs <heroUrl> "<caption>" "<hashtag1> <hashtag2>"
 *
 * Defaults to the hero + caption from auto-post-smoke-2026-04-26-night
 * if no args given.
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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

async function run() {
  await loadEnvLocal();

  const heroUrl =
    process.argv[2] ??
    'https://oceanic-dolphin-808.convex.cloud/api/storage/610b528b-a1a0-4a8a-afaf-80bfd6ab9567';
  const caption =
    process.argv[3] ??
    'Sleep, but make it engineered. The Eight Sleep Pod has landed in Singapore — personalised cooling, warmth and tracking, risk-free for 30 nights.';
  const hashtagsArg = process.argv[4] ?? '#EightSleep #ThePod #SleepBetter #SGWellness';
  const hashtags = hashtagsArg.split(/\s+/).filter(Boolean);

  console.log('X smoke:');
  console.log('  hero:', heroUrl);
  console.log('  caption:', caption);
  console.log('  hashtags:', hashtags);
  console.log(
    '  X_API_KEY:',
    process.env.X_API_KEY ? `${process.env.X_API_KEY.slice(0, 6)}…` : '✗ MISSING'
  );

  const { createXPublisherFromEnv } = await import(
    pathToFileURL(path.join(ROOT, 'lib/providers/publisher/x.ts')).href
  );
  const publisher = createXPublisherFromEnv({});
  if (!publisher) {
    console.error(
      'X publisher not configured — check X_API_KEY/X_API_KEY_SECRET/X_ACCESS_TOKEN/X_ACCESS_TOKEN_SECRET in .env.local'
    );
    process.exit(1);
  }
  console.log('  publisher:', publisher.id);

  const post = {
    id: '',
    platform: 'x',
    mediaUrls: [heroUrl],
    caption,
    hashtags,
    scheduledAt: new Date(Date.now() + 30_000).toISOString(),
  };

  console.log('\nposting…');
  const t0 = Date.now();
  try {
    const result = await publisher.schedule(post);
    const elapsed = Date.now() - t0;
    console.log(`\n✓ posted in ${elapsed}ms`);
    console.log('result:', JSON.stringify(result, null, 2));
    await fs.mkdir(OUT, { recursive: true });
    await fs.writeFile(
      path.join(OUT, 'x-post-result.json'),
      JSON.stringify({ post, result, elapsed }, null, 2)
    );
  } catch (err) {
    console.error('\n✗ X post failed:', err?.message ?? err);
    if (err && typeof err === 'object' && 'data' in err) {
      console.error('error data:', JSON.stringify(err.data, null, 2));
    }
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('smoke-x-direct failed:', err);
  process.exit(1);
});
