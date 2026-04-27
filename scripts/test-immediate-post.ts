#!/usr/bin/env node
/**
 * One-off immediate-posting test harness for the social publishers.
 *
 * Loads .env.local, instantiates the requested publisher, and fires a
 * single immediate post with a sample image + caption. Used to validate
 * platform credentials end-to-end without a full lap kickoff.
 *
 * Usage:
 *   node scripts/test-immediate-post.mjs --platform=x
 *   node scripts/test-immediate-post.mjs --platform=instagram
 *   node scripts/test-immediate-post.mjs --platform=linkedin
 *   node scripts/test-immediate-post.mjs --platform=x --image=https://...
 *   node scripts/test-immediate-post.mjs --platform=x --caption='hello aether'
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  const raw = readFileSync(path, 'utf-8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
readEnvLocal();

const argv = process.argv.slice(2);
const arg = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const platform = arg('platform') ?? 'x';
const image =
  arg('image') ??
  // Default: a 1024×1024 from one of the cached completed campaigns. Public via Convex.
  'https://fiery-opossum-632.convex.cloud/api/storage/221fa523-87c3-4baf-b9d8-a993b6c76a36';
const caption = arg('caption') ?? 'aether — testing immediate post path · ' + new Date().toISOString();

async function loadPublisher() {
  // Use the registry so we get the same wiring the lap uses.
  const { resolvePublisher } = await import('../lib/providers/publisher/registry.ts');
  // Alternatively call platform-specific factory for surgical test:
  if (platform === 'x') {
    const { createXPublisherFromEnv } = await import('../lib/providers/publisher/x.ts');
    return createXPublisherFromEnv(process.env);
  }
  if (platform === 'instagram') {
    const { createInstagramPublisherFromEnv } = await import('../lib/providers/publisher/instagram.ts');
    return createInstagramPublisherFromEnv(process.env);
  }
  if (platform === 'linkedin') {
    const { createLinkedInPublisherFromEnv } = await import('../lib/providers/publisher/linkedin.ts');
    return createLinkedInPublisherFromEnv(process.env);
  }
  throw new Error(`unsupported platform: ${platform}`);
}

async function main() {
  console.log(`▸ test-immediate-post platform=${platform}`);
  console.log(`  image:   ${image}`);
  console.log(`  caption: ${caption}`);

  const publisher = await loadPublisher();
  if (!publisher) {
    console.error(`✗ publisher unavailable — check ${platform.toUpperCase()}_* env vars in .env.local`);
    process.exit(2);
  }

  const post = {
    id: `test_${platform}_${Date.now()}`,
    platform,
    mediaUrls: [image],
    caption,
    hashtags: ['aether', 'demo'],
    scheduledAt: new Date(Date.now() - 60_000).toISOString(), // 1min past → immediate
  };

  console.log(`▸ firing publisher.schedule…`);
  const t0 = Date.now();
  try {
    const result = await publisher.schedule(post);
    const elapsed = Date.now() - t0;
    console.log(`✓ posted in ${elapsed}ms`);
    console.log(`  externalId: ${result.externalId ?? '(none)'}`);
    console.log(`  previewUrl: ${result.previewUrl ?? '(none)'}`);
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(`✗ schedule failed after ${elapsed}ms:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('✗ fatal:', err);
  process.exit(1);
});
