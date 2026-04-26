/**
 * Probe IG Business Login API token (IGAA…) against the right endpoint.
 *
 * Two flavors of IG content publishing exist:
 *   - FB Graph API (graph.facebook.com)         — token starts with EAA…
 *   - IG Business Login (graph.instagram.com)   — token starts with IGAA…
 *
 * The user pasted an IGAA token, so we test against graph.instagram.com.
 */

import { promises as fs } from 'node:fs';

async function loadEnv() {
  const t = await fs.readFile(
    '/Users/erniesg/code/erniesg/aether/.env.local',
    'utf8'
  );
  for (const line of t.split('\n')) {
    const tr = line.trim();
    if (!tr || tr.startsWith('#')) continue;
    const eq = tr.indexOf('=');
    if (eq < 1) continue;
    const k = tr.slice(0, eq).trim();
    let v = tr.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

await loadEnv();

const token = process.env.IG_ACCESS_TOKEN;
const userId = process.env.IG_USER_ID;
if (!token || !userId) {
  console.error('IG_ACCESS_TOKEN or IG_USER_ID missing');
  process.exit(1);
}

const FB_BASE = 'https://graph.facebook.com';
const IG_BASE = 'https://graph.instagram.com';
const VERSION = 'v22.0';

console.log('IG token probe:');
console.log('  token head:', token.slice(0, 20) + '…');
console.log('  user id:', userId);
console.log('  format:', token.startsWith('IGAA') ? 'IGAA (Instagram Business Login)' : 'EAA (FB Graph)');

async function probe(label, url) {
  try {
    const res = await fetch(url);
    const body = await res.text();
    console.log(`\n[${label}] ${res.status}`);
    console.log('  ', body.slice(0, 300));
  } catch (err) {
    console.error(`[${label}] threw:`, err.message);
  }
}

// 1) FB Graph - the path our adapter uses today.
await probe(
  'FB Graph /me?fields=id,username',
  `${FB_BASE}/${VERSION}/me?fields=id,username&access_token=${token}`
);

// 2) IG Business Login - the path your IGAA token expects.
await probe(
  'IG Business /me?fields=id,username',
  `${IG_BASE}/${VERSION}/me?fields=id,username&access_token=${token}`
);

// 3) IG Business - check publishing permissions.
await probe(
  'IG Business /me?fields=id,username,account_type',
  `${IG_BASE}/${VERSION}/me?fields=id,username,account_type&access_token=${token}`
);

// 4) IG Business - confirm the user id matches.
await probe(
  `IG Business /${userId}?fields=id,username`,
  `${IG_BASE}/${VERSION}/${userId}?fields=id,username&access_token=${token}`
);
