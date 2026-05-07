#!/usr/bin/env node
/**
 * preflight-postiz.mjs — pre-deploy checklist for `infra/postiz/deploy.sh`.
 *
 * Runs before the manual Cloud Run deploy step so the human (Ernie) catches
 * misconfiguration before paying the gcloud-roundtrip tax. Every check is a
 * single yes/no with a short hint. Output is a pass/fail table.
 *
 * Exit codes:
 *   0 — every required check passed.
 *   1 — at least one required check failed.
 *
 * No external deps. Reads `infra/postiz/.env.postiz` (KEY=VALUE format) the
 * same way bash would `source` it. Optional flags:
 *   --env <path>   override the env file location
 *   --json         emit machine-readable JSON instead of the table
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_ENV_PATH = path.join(REPO_ROOT, 'infra/postiz/.env.postiz');

const REQUIRED_VARS = [
  'GCLOUD_PROJECT',
  'GCLOUD_REGION',
  'CLOUD_RUN_SERVICE',
  'CLOUD_RUN_IMAGE',
  'REDIS_URL',
  'JWT_SECRET',
];

// Mirrors deploy.sh: every platform pushes a client_id secret, but Cloud Run
// will boot without it (Postiz just won't list that platform as connectable).
// We treat blank client_ids as warnings, not failures, so the human can ship
// a partial OAuth set and still demo.
const OAUTH_PLATFORMS = [
  'INSTAGRAM',
  'FACEBOOK',
  'X',
  'LINKEDIN',
  'TIKTOK',
  'PINTEREST',
  'YOUTUBE',
];

function parseArgs(argv) {
  const out = { envPath: DEFAULT_ENV_PATH, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--env' && argv[i + 1]) {
      out.envPath = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg === '--json') {
      out.json = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage: node scripts/preflight-postiz.mjs [--env PATH] [--json]',
          '',
          'Checks gcloud auth, env file presence, required deploy vars, and',
          'OAuth client_id values before running infra/postiz/deploy.sh.',
        ].join('\n')
      );
      process.exit(0);
    }
  }
  return out;
}

function parseEnvFile(filePath) {
  const env = {};
  const raw = readFileSync(filePath, 'utf8');
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
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

function gcloudAuthStatus() {
  // `gcloud auth print-access-token` is the cheapest way to check that an
  // active credential exists. We don't print the token; we just look at the
  // exit status. A missing gcloud binary fails too, with a distinct hint.
  const probe = spawnSync('gcloud', ['auth', 'print-access-token'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (probe.error && probe.error.code === 'ENOENT') {
    return {
      ok: false,
      hint: 'gcloud CLI not found on PATH; install Google Cloud SDK',
    };
  }
  if (probe.status === 0) {
    return { ok: true };
  }
  const stderr = (probe.stderr?.toString() ?? '').trim().split('\n').pop() ?? '';
  return {
    ok: false,
    hint:
      stderr ||
      'no active gcloud credential — run `gcloud auth login && gcloud auth application-default login`',
  };
}

function check(name, ok, hint = '') {
  return { name, ok, hint, severity: 'required' };
}

function softCheck(name, ok, hint = '') {
  return { name, ok, hint, severity: 'warning' };
}

function runChecks({ envPath }) {
  const checks = [];

  const auth = gcloudAuthStatus();
  checks.push(check('gcloud auth credential available', auth.ok, auth.hint ?? ''));

  const envExists = existsSync(envPath);
  checks.push(
    check(
      `${path.relative(REPO_ROOT, envPath)} exists`,
      envExists,
      envExists ? '' : 'cp infra/postiz/.env.postiz.example infra/postiz/.env.postiz'
    )
  );

  // If the env file is missing, downstream checks are useless — return early
  // with the failures we already collected so the user fixes the root cause.
  if (!envExists) return checks;

  let env;
  try {
    env = parseEnvFile(envPath);
  } catch (err) {
    checks.push(
      check(
        'env file parses',
        false,
        err instanceof Error ? err.message : String(err)
      )
    );
    return checks;
  }

  for (const key of REQUIRED_VARS) {
    const value = (env[key] ?? '').trim();
    checks.push(
      check(
        `${key} is set`,
        value.length > 0,
        value.length === 0 ? `set ${key} in ${path.basename(envPath)}` : ''
      )
    );
  }

  // OAuth client_id presence per platform — non-blocking; Postiz still boots
  // without them, the rail just can't connect that platform yet.
  for (const platform of OAUTH_PLATFORMS) {
    const key = `${platform}_CLIENT_ID`;
    const value = (env[key] ?? '').trim();
    checks.push(
      softCheck(
        `${key} non-empty`,
        value.length > 0,
        value.length === 0
          ? `optional — Postiz will boot without ${platform.toLowerCase()} integration`
          : ''
      )
    );
  }

  return checks;
}

function formatTable(results) {
  const headers = ['status', 'check', 'hint'];
  const rows = results.map((r) => [
    r.ok ? 'PASS' : r.severity === 'warning' ? 'WARN' : 'FAIL',
    r.name,
    r.hint,
  ]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => String(row[i] ?? '').length))
  );
  const sep = widths.map((w) => '─'.repeat(w)).join('─┼─');
  const renderRow = (cells) =>
    cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join(' │ ');
  const lines = [renderRow(headers), sep, ...rows.map(renderRow)];
  return lines.join('\n');
}

function summarize(results) {
  const failed = results.filter((r) => !r.ok && r.severity === 'required');
  const warned = results.filter((r) => !r.ok && r.severity === 'warning');
  const passed = results.length - failed.length - warned.length;
  return { failed: failed.length, warned: warned.length, passed };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const results = runChecks({ envPath: args.envPath });
  const summary = summarize(results);

  if (args.json) {
    console.log(JSON.stringify({ envPath: args.envPath, results, summary }, null, 2));
  } else {
    console.log(formatTable(results));
    console.log('');
    console.log(
      `→ ${summary.passed} pass · ${summary.warned} warn · ${summary.failed} fail`
    );
    if (summary.failed === 0) {
      console.log('preflight ok — safe to run `bash infra/postiz/deploy.sh`');
    } else {
      console.log('preflight FAILED — fix the rows above before deploying');
    }
  }

  process.exit(summary.failed === 0 ? 0 : 1);
}

main();
