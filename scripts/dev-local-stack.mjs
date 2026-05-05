#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = new Set();
let shuttingDown = false;
const envLocalPath = path.join(repoRoot, '.env.local');
const originalEnvLocal = fs.existsSync(envLocalPath)
  ? fs.readFileSync(envLocalPath, 'utf8')
  : null;
let envLocalRestored = false;

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals < 1) continue;
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function prefixOutput(name, stream) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) console.log(`[${name}] ${line}`);
    }
  });
  stream.on('end', () => {
    if (buffer.trim()) console.log(`[${name}] ${buffer}`);
  });
}

function start(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: options.env,
    stdio: [options.stdin ?? 'inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  children.add(child);
  prefixOutput(name, child.stdout);
  prefixOutput(name, child.stderr);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    const detail = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`[local-stack] ${name} exited with ${detail}; stopping stack.`);
    stopAll(code ?? 1);
  });
  return child;
}

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    child.kill('SIGTERM');
  }
  setTimeout(() => {
    for (const child of children) {
      child.kill('SIGKILL');
    }
    restoreEnvLocal();
    process.exit(exitCode);
  }, 3000);
}

function restoreEnvLocal() {
  if (envLocalRestored) return;
  envLocalRestored = true;
  if (originalEnvLocal === null) {
    if (fs.existsSync(envLocalPath)) fs.rmSync(envLocalPath);
    return;
  }
  fs.writeFileSync(envLocalPath, originalEnvLocal);
}

function boolEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}

const fileEnv = {
  ...parseEnvFile(path.join(repoRoot, '.env.local')),
  ...parseEnvFile(path.join(repoRoot, '.dev.vars')),
};

const localConvexUrl =
  process.env.AETHER_LOCAL_CONVEX_URL ||
  fileEnv.AETHER_LOCAL_CONVEX_URL ||
  'http://127.0.0.1:3210';
const localConvexPort = new URL(localConvexUrl).port || '3210';
const localConvexSitePort =
  process.env.AETHER_LOCAL_CONVEX_SITE_PORT ||
  fileEnv.AETHER_LOCAL_CONVEX_SITE_PORT ||
  String(Number(localConvexPort) + 1);
const nextPort = process.env.AETHER_NEXT_PORT || fileEnv.AETHER_NEXT_PORT || '3000';
const skipModels = boolEnv(process.env.AETHER_SKIP_LOCAL_MODELS || fileEnv.AETHER_SKIP_LOCAL_MODELS);
const appleSilicon = process.platform === 'darwin' && process.arch === 'arm64';

function normalizeCommandProvider(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'claude' || raw === 'anthropic') return 'anthropic';
  if (raw === 'openai') return 'openai';
  if (raw === 'deepseek') return 'deepseek';
  return '';
}

const explicitCommandProvider = normalizeCommandProvider(
  process.env.AETHER_COMMAND_PROVIDER || fileEnv.AETHER_COMMAND_PROVIDER
);
const autoCommandProvider =
  explicitCommandProvider ||
  (process.env.DEEPSEEK_API_KEY || fileEnv.DEEPSEEK_API_KEY
    ? 'deepseek'
    : process.env.ANTHROPIC_API_KEY || fileEnv.ANTHROPIC_API_KEY
      ? 'anthropic'
      : process.env.OPENAI_API_KEY || fileEnv.OPENAI_API_KEY
        ? 'openai'
        : '');
const commandModelDefault =
  autoCommandProvider === 'deepseek'
    ? 'deepseek-v4-flash'
    : autoCommandProvider === 'anthropic'
      ? 'claude-opus-4-7'
      : autoCommandProvider === 'openai'
        ? 'gpt-4.1-mini'
        : '';
const commandModel =
  process.env.AETHER_COMMAND_MODEL ||
  fileEnv.AETHER_COMMAND_MODEL ||
  commandModelDefault;
const explicitImageProvider =
  process.env.IMAGE_GEN_PROVIDER || fileEnv.IMAGE_GEN_PROVIDER || '';
const autoImageProvider =
  explicitImageProvider ||
  (process.env.REPLICATE_API_TOKEN || fileEnv.REPLICATE_API_TOKEN ? 'replicate' : '');
const imageModel =
  process.env.IMAGE_GEN_MODEL ||
  fileEnv.IMAGE_GEN_MODEL ||
  (autoImageProvider === 'replicate' ? 'openai/gpt-image-2' : '');

const sharedEnv = {
  ...fileEnv,
  ...process.env,
  NEXT_PUBLIC_APP_URL:
    process.env.NEXT_PUBLIC_APP_URL || fileEnv.NEXT_PUBLIC_APP_URL || `http://localhost:${nextPort}`,
  NEXT_PUBLIC_CONVEX_URL: localConvexUrl,
  CONVEX_URL: localConvexUrl,
  SAM3_MODAL_URL:
    process.env.SAM3_MODAL_URL ||
    fileEnv.AETHER_LOCAL_SAM3_URL ||
    'http://127.0.0.1:8001/segment',
  CLIP_MODAL_URL:
    process.env.CLIP_MODAL_URL ||
    fileEnv.AETHER_LOCAL_CLIP_URL ||
    'http://127.0.0.1:8002/cluster',
  LOCAL_EMBEDDING_RERANK_URL:
    process.env.LOCAL_EMBEDDING_RERANK_URL ||
    fileEnv.AETHER_LOCAL_EMBEDDING_RERANK_URL ||
    'http://127.0.0.1:8002/rerank',
  LOCAL_WHISPER_URL:
    process.env.LOCAL_WHISPER_URL ||
    fileEnv.AETHER_LOCAL_WHISPER_URL ||
    'http://127.0.0.1:9000/transcribe',
  LOCAL_WHISPER_BACKEND:
    process.env.LOCAL_WHISPER_BACKEND ||
    fileEnv.LOCAL_WHISPER_BACKEND ||
    (appleSilicon ? 'mlx' : 'faster-whisper'),
  LOCAL_WHISPER_MODEL:
    process.env.LOCAL_WHISPER_MODEL ||
    fileEnv.LOCAL_WHISPER_MODEL ||
    (appleSilicon ? 'mlx-community/whisper-small-mlx' : 'small'),
  DEEPSEEK_BASE_URL:
    process.env.DEEPSEEK_BASE_URL || fileEnv.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  ...(autoCommandProvider ? { AETHER_COMMAND_PROVIDER: autoCommandProvider } : {}),
  ...(commandModel ? { AETHER_COMMAND_MODEL: commandModel } : {}),
  ...(autoImageProvider ? { IMAGE_GEN_PROVIDER: autoImageProvider } : {}),
  ...(imageModel ? { IMAGE_GEN_MODEL: imageModel } : {}),
  SEGMENTATION_PROVIDER:
    process.env.SEGMENTATION_PROVIDER || fileEnv.SEGMENTATION_PROVIDER || 'sam3',
};

if (!sharedEnv.LOCAL_EMBEDDING_TOKEN && sharedEnv.CLIP_MODAL_TOKEN) {
  sharedEnv.LOCAL_EMBEDDING_TOKEN = sharedEnv.CLIP_MODAL_TOKEN;
}

if (!sharedEnv.CLIP_MODAL_TOKEN) sharedEnv.CLIP_MODAL_TOKEN_ALLOW_ANON ??= '1';
if (!sharedEnv.SAM3_BEARER_TOKEN && !sharedEnv.SAM3_MODAL_TOKEN) {
  sharedEnv.SAM3_BEARER_TOKEN_ALLOW_ANON ??= '1';
}
if (!sharedEnv.LOCAL_WHISPER_TOKEN && !sharedEnv.WHISPER_TRANSCRIBE_TOKEN) {
  sharedEnv.LOCAL_WHISPER_ALLOW_ANON ??= '1';
}

const convexEnv = {
  ...sharedEnv,
  CONVEX_AGENT_MODE:
    process.env.CONVEX_AGENT_MODE || fileEnv.CONVEX_AGENT_MODE || 'anonymous',
  // Convex's CLI reloads .env.local internally with dotenv. Setting these to
  // empty strings keeps local-stack runs from accidentally selecting a cloud
  // deployment configured in the developer's normal .env.local.
  CONVEX_DEPLOYMENT: '',
  CONVEX_DEPLOY_KEY: '',
  CONVEX_SELF_HOSTED_URL: '',
  CONVEX_SELF_HOSTED_ADMIN_KEY: '',
};

console.log('[local-stack] starting local Convex, Next, and local model sidecars');
console.log(`[local-stack] Convex URL: ${localConvexUrl}`);
console.log(`[local-stack] Next URL: http://localhost:${nextPort}`);
console.log(
  `[local-stack] voice planner: ${
    sharedEnv.AETHER_COMMAND_PROVIDER && sharedEnv.AETHER_COMMAND_MODEL
      ? `${sharedEnv.AETHER_COMMAND_PROVIDER} / ${sharedEnv.AETHER_COMMAND_MODEL}`
      : 'heuristic fallback (no command LLM key configured)'
  }`
);
console.log(
  `[local-stack] whisper: ${sharedEnv.LOCAL_WHISPER_BACKEND} / ${sharedEnv.LOCAL_WHISPER_MODEL}`
);
console.log(
  `[local-stack] image generation: ${
    sharedEnv.IMAGE_GEN_PROVIDER && sharedEnv.IMAGE_GEN_MODEL
      ? `${sharedEnv.IMAGE_GEN_PROVIDER} / ${sharedEnv.IMAGE_GEN_MODEL}`
      : sharedEnv.IMAGE_GEN_PROVIDER
        ? `${sharedEnv.IMAGE_GEN_PROVIDER} / model auto`
        : 'registry fallback'
  }`
);
if (skipModels) {
  console.log('[local-stack] local model sidecars skipped by AETHER_SKIP_LOCAL_MODELS');
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
process.on('exit', restoreEnvLocal);

start(
  'convex',
  'npx',
  [
    'convex',
    'dev',
    '--local',
    '--local-cloud-port',
    localConvexPort,
    '--local-site-port',
    localConvexSitePort,
    '--typecheck',
    'disable',
    '--tail-logs',
    'disable',
  ],
  { env: convexEnv, stdin: 'ignore' }
);

if (!skipModels) {
  start('models', 'bash', ['scripts/serve-local.sh'], { env: sharedEnv });
}

start('next', 'npx', ['next', 'dev', '-p', nextPort], { env: sharedEnv });
