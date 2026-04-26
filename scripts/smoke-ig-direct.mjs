/**
 * Direct Instagram publisher smoke. Takes an existing hero URL + caption,
 * goes straight to the IG adapter (auto-detects IGAA vs EAA token).
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
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

await loadEnvLocal();

const heroUrl =
  process.argv[2] ??
  'https://oceanic-dolphin-808.convex.cloud/api/storage/610b528b-a1a0-4a8a-afaf-80bfd6ab9567';
const caption =
  process.argv[3] ??
  'Sleep, but make it engineered. The Eight Sleep Pod has landed in Singapore — personalised cooling, warmth and tracking, risk-free for 30 nights.';
const hashtagsArg = process.argv[4] ?? '#EightSleep #ThePod #SleepBetter #SGWellness';
const hashtags = hashtagsArg.split(/\s+/).filter(Boolean);

console.log('IG direct smoke:');
console.log('  hero:', heroUrl);
console.log('  caption:', caption.slice(0, 80) + '…');
console.log('  hashtags:', hashtags);
console.log('  IG_ACCESS_TOKEN:', process.env.IG_ACCESS_TOKEN ? `${process.env.IG_ACCESS_TOKEN.slice(0, 12)}…` : '✗ MISSING');
console.log('  IG_USER_ID:', process.env.IG_USER_ID ?? '✗ MISSING');

const { createInstagramPublisherFromEnv } = await import(
  pathToFileURL(path.join(ROOT, 'lib/providers/publisher/instagram.ts')).href
);
const publisher = createInstagramPublisherFromEnv({});
if (!publisher) {
  console.error('IG publisher not configured');
  process.exit(1);
}

const post = {
  id: '',
  platform: 'instagram',
  mediaUrls: [heroUrl],
  caption,
  hashtags,
  scheduledAt: new Date(Date.now() + 30_000).toISOString(),
};

console.log('\nposting…');
const t0 = Date.now();
try {
  const result = await publisher.schedule(post);
  console.log(`\n✓ posted in ${Date.now() - t0}ms`);
  console.log('result:', JSON.stringify(result, null, 2));
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(
    path.join(OUT, 'ig-post-result.json'),
    JSON.stringify({ post, result, elapsedMs: Date.now() - t0 }, null, 2)
  );
  console.log('\nview the post:', result.previewUrl);
} catch (err) {
  console.error('\n✗ IG post failed:', err?.message ?? err);
  process.exit(1);
}
