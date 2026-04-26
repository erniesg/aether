/**
 * Probe X OAuth 2.0 user-context token against v2 endpoints.
 * Single-shot v2 media upload + v2 tweet creation.
 */

import { promises as fs } from 'node:fs';

async function loadEnv() {
  const text = await fs.readFile(
    '/Users/erniesg/code/erniesg/aether/.env.local',
    'utf8'
  );
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

await loadEnv();

const token = process.env.X_OAUTH2_ACCESS_TOKEN;
if (!token) {
  console.error('X_OAUTH2_ACCESS_TOKEN missing');
  process.exit(1);
}

console.log('Testing X OAuth 2.0 user-context token…');
console.log('  token head:', token.slice(0, 30) + '…');

// Step 1: GET /2/users/me — confirms scopes + identity.
console.log('\n[1] GET /2/users/me');
const meRes = await fetch('https://api.x.com/2/users/me', {
  headers: { Authorization: `Bearer ${token}` },
});
const meBody = await meRes.text();
console.log('  status:', meRes.status);
console.log('  body:', meBody.slice(0, 300));

if (meRes.status !== 200) {
  console.error(
    '\nOAuth 2.0 token rejected. Possible: token expired, scopes missing (need tweet.read, tweet.write, media.write, users.read), or app misconfigured. Try refreshing the token via the X portal.'
  );
  process.exit(1);
}

// Step 2: text-only tweet to verify tweet.write scope.
console.log('\n[2] POST /2/tweets (text-only smoke)');
const ts = Date.now();
const tweetRes = await fetch('https://api.x.com/2/tweets', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: `aether smoke ${ts} — verifying OAuth 2.0 user context works for /2/tweets`,
  }),
});
const tweetBody = await tweetRes.text();
console.log('  status:', tweetRes.status);
console.log('  body:', tweetBody.slice(0, 400));
