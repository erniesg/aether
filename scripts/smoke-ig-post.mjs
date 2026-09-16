#!/usr/bin/env node
// Smoke test: aether → Instagram Graph API end-to-end.
//
// Defaults to DRY RUN: creates an IG media container, polls until ready,
// reports the container id, and STOPS before the actual publish call.
// Pass --live to also publish (the post WILL appear on your IG feed).
//
// Reads token + IG Business Account ID from infra/postiz/.env.postiz.
//
// Usage:
//   node scripts/smoke-ig-post.mjs
//   node scripts/smoke-ig-post.mjs --live
//   node scripts/smoke-ig-post.mjs --image https://... --caption "hello"

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_PATH = resolve(process.cwd(), 'infra/postiz/.env.postiz');
const env = Object.fromEntries(
  readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      const k = l.slice(0, i).trim();
      let v = l.slice(i + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return [k, v];
    })
);

const IG_USER_ID = env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
const ACCESS_TOKEN = env.INSTAGRAM_LONG_LIVED_TOKEN;
if (!IG_USER_ID || !ACCESS_TOKEN) {
  console.error('Missing INSTAGRAM_BUSINESS_ACCOUNT_ID or INSTAGRAM_LONG_LIVED_TOKEN in .env.postiz');
  process.exit(1);
}

const args = process.argv.slice(2);
const live = args.includes('--live');
const imageArg = args.indexOf('--image');
const captionArg = args.indexOf('--caption');
const IMAGE_URL =
  imageArg > -1
    ? args[imageArg + 1]
    : 'https://images.unsplash.com/photo-1493612276216-ee3925520721?w=1080&q=85&auto=format&fm=jpg';
const CAPTION =
  captionArg > -1
    ? args[captionArg + 1]
    : 'aether → IG smoke test (dry-run container; not actually published)';

// Token starts with IGAA → Instagram API with Instagram Login (graph.instagram.com).
// Token starts with EAA  → Instagram Graph API via FB Page (graph.facebook.com).
const GRAPH = ACCESS_TOKEN.startsWith('IGAA')
  ? 'https://graph.instagram.com/v21.0'
  : 'https://graph.facebook.com/v21.0';

async function post(path, body) {
  const url = `${GRAPH}${path}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${JSON.stringify(json)}`);
  return json;
}

async function get(path) {
  const url = `${GRAPH}${path}`;
  const r = await fetch(url);
  const json = await r.json();
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${JSON.stringify(json)}`);
  return json;
}

console.log(`▶ aether → IG smoke test`);
console.log(`  IG Business Account: ${IG_USER_ID}`);
console.log(`  Mode:                ${live ? 'LIVE (will publish)' : 'DRY RUN (container only)'}`);
console.log(`  Image:               ${IMAGE_URL}`);
console.log(`  Caption:             ${CAPTION}`);
console.log('');

const t0 = Date.now();

console.log('1/3  Creating IG media container ...');
const container = await post(`/${IG_USER_ID}/media`, {
  image_url: IMAGE_URL,
  caption: CAPTION,
  access_token: ACCESS_TOKEN,
});
console.log(`     creation_id: ${container.id}`);

console.log('2/3  Polling container status until FINISHED ...');
let status = 'IN_PROGRESS';
let attempts = 0;
while (status === 'IN_PROGRESS' && attempts < 30) {
  await new Promise((r) => setTimeout(r, 2000));
  const s = await get(`/${container.id}?fields=status_code&access_token=${ACCESS_TOKEN}`);
  status = s.status_code;
  attempts += 1;
  process.stdout.write(`     attempt ${attempts}: ${status}\r`);
}
console.log('');
if (status !== 'FINISHED') {
  console.error(`     ✗ container did not reach FINISHED (got ${status})`);
  process.exit(1);
}
console.log(`     ✓ container ready in ${attempts * 2}s`);

if (!live) {
  console.log('3/3  DRY RUN — skipping publish.');
  console.log('');
  console.log(`✓ chain validated end-to-end in ${Date.now() - t0}ms.`);
  console.log(`  Run with --live to actually publish to @${env.INSTAGRAM_HANDLE || 'your account'}.`);
  process.exit(0);
}

console.log('3/3  Publishing ...');
const published = await post(`/${IG_USER_ID}/media_publish`, {
  creation_id: container.id,
  access_token: ACCESS_TOKEN,
});
console.log(`     published_id: ${published.id}`);
console.log('');
console.log(`✓ Posted to Instagram in ${Date.now() - t0}ms.`);
console.log(`  Permalink lookup: GET /${published.id}?fields=permalink&access_token=...`);
