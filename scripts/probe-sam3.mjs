/**
 * Direct SAM3 probe — calls the Modal endpoint with one of our heroes
 * to see if it actually returns masks for "Pod 4 Ultra Hub".
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

const endpoint = process.env.SAM3_MODAL_URL;
const token = process.env.SAM3_MODAL_TOKEN;
const heroUrl = 'https://oceanic-dolphin-808.convex.cloud/api/storage/610b528b-a1a0-4a8a-afaf-80bfd6ab9567';

console.log('SAM3 probe:');
console.log('  endpoint:', endpoint);
console.log('  token:', token ? `${token.slice(0, 10)}…` : 'MISSING');
console.log('  hero:', heroUrl);

async function tryPrompt(prompt) {
  console.log(`\n→ "${prompt}"`);
  const t0 = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: 'sam3.1',
        image_url: heroUrl,
        mode: 'unmask',
        text_prompt: prompt,
        width: 1024,
        height: 1024,
      }),
    });
    const elapsed = Date.now() - t0;
    const text = await res.text();
    console.log(`  ${res.status} (${elapsed}ms)`);
    if (res.ok) {
      try {
        const json = JSON.parse(text);
        console.log('  keys:', Object.keys(json));
        if (json.masks) console.log('  masks count:', json.masks.length);
        if (json.maskUrl || json.mask_url) console.log('  maskUrl:', (json.maskUrl ?? json.mask_url).slice(0, 80));
        if (json.bbox) console.log('  bbox:', JSON.stringify(json.bbox));
      } catch {
        console.log('  body (first 300):', text.slice(0, 300));
      }
    } else {
      console.log('  body:', text.slice(0, 300));
    }
  } catch (err) {
    console.error('  fetch threw:', err.message);
  }
}

await tryPrompt('product');
await tryPrompt('Pod 4 Ultra Hub');
await tryPrompt('white box');
await tryPrompt('the device');
