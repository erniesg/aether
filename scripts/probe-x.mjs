import { promises as fs } from 'node:fs';
import { TwitterApi } from 'twitter-api-v2';

const text = await fs.readFile(
  '/Users/erniesg/code/erniesg/aether/.env.local',
  'utf8'
);
for (const line of text.split('\n')) {
  if (line.startsWith('X_')) {
    const [k, v] = line.split('=');
    process.env[k.trim()] = v?.trim();
  }
}

const c = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_KEY_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});

try {
  const me = await c.v2.me();
  console.log('GET /users/me:', me.data.username, '(id', me.data.id, ')');
} catch (e) {
  console.error(
    'GET /users/me failed:',
    e.code,
    e.message,
    e.data?.detail || ''
  );
}

try {
  const t = await c.v2.tweet({ text: `aether smoke ${Date.now()}` });
  console.log('text-only tweet ok:', t.data.id);
} catch (e) {
  console.error(
    'text-only tweet failed:',
    e.code,
    e.message,
    e.data?.detail || ''
  );
  if (e.data) console.error('  data:', JSON.stringify(e.data));
}
