#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextPort = process.env.AETHER_NEXT_PORT || process.env.PORT || '3000';
const env = {
  ...parseEnvFile(path.join(repoRoot, '.dev.vars')),
  ...parseEnvFile(path.join(repoRoot, '.env.local')),
  ...process.env,
};

const convexUrl = env.NEXT_PUBLIC_CONVEX_URL;
if (
  convexUrl &&
  isLocalUrl(convexUrl) &&
  env.AETHER_ALLOW_OFFLINE_CONVEX !== '1' &&
  env.AETHER_SKIP_CONVEX_PREFLIGHT !== '1'
) {
  const ok = await isReachable(convexUrl);
  if (!ok) {
    console.error(
      [
        '[dev] NEXT_PUBLIC_CONVEX_URL points at local Convex, but it is not reachable.',
        `      ${convexUrl}`,
        '',
        'Run the full local stack instead:',
        '      AETHER_SKIP_LOCAL_MODELS=1 npm run dev:local',
        '',
        'Or start Convex in another terminal:',
        '      npm run convex:dev:local',
        '',
        'If you intentionally want canvas-only dev without persistence:',
        '      AETHER_ALLOW_OFFLINE_CONVEX=1 npm run dev',
      ].join('\n')
    );
    process.exit(1);
  }
}

const child = spawn('npx', ['next', 'dev', '-p', nextPort], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

async function isReachable(value) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_000);
  try {
    const res = await fetch(value, {
      method: 'GET',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
