/**
 * Probe Pinterest API v5 with the pina_… user token.
 * Confirms token works + lists boards so we know which board to pin to.
 */

import { promises as fs } from 'node:fs';

async function loadEnv() {
  const t = await fs.readFile('/Users/erniesg/code/erniesg/aether/.env.local', 'utf8');
  for (const line of t.split('\n')) {
    const tr = line.trim();
    if (!tr || tr.startsWith('#')) continue;
    const eq = tr.indexOf('=');
    if (eq < 1) continue;
    const k = tr.slice(0, eq).trim();
    let v = tr.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

await loadEnv();
const token = process.env.PINTEREST_ACCESS_TOKEN;
if (!token) {
  console.error('PINTEREST_ACCESS_TOKEN missing');
  process.exit(1);
}

console.log('Pinterest probe — token head:', token.slice(0, 12) + '…');

async function get(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  return { status: res.status, body: text };
}

console.log('\n[1] GET /v5/user_account');
const me = await get('https://api.pinterest.com/v5/user_account');
console.log('  ', me.status, me.body.slice(0, 200));

console.log('\n[2] GET /v5/boards');
const boards = await get('https://api.pinterest.com/v5/boards?page_size=10');
console.log('  ', boards.status);
try {
  const j = JSON.parse(boards.body);
  if (j.items) {
    for (const b of j.items.slice(0, 8)) {
      console.log(`    board: ${b.id}  "${b.name}"  privacy=${b.privacy}`);
    }
  } else {
    console.log('  ', boards.body.slice(0, 200));
  }
} catch {
  console.log('  ', boards.body.slice(0, 200));
}
