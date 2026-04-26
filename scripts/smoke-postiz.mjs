#!/usr/bin/env node
/**
 * smoke-postiz.mjs — post-deploy smoke check for a hosted Postiz instance.
 *
 * Hits the public-API surface that aether's adapter (`lib/providers/publisher/
 * postiz.ts`) actually depends on: auth-validated GET against `/integrations`
 * (or, if `--root-url` is provided, the Cloud Run health endpoint at
 * `/api/status`). Returns non-zero on the first failure so the human can wire
 * this into a CI step or run it ad-hoc after `bash infra/postiz/deploy.sh`.
 *
 * Required env (or flags):
 *   POSTIZ_API_URL  — the public-API base, e.g. https://postiz-xyz.run.app/public/v1
 *   POSTIZ_API_KEY  — Postiz API key from Settings → API Keys
 *
 * Optional flags:
 *   --root-url URL  — Cloud Run service root (without /public/v1) to hit
 *                     /api/status. Inferred by stripping a trailing
 *                     `/public/v1` from POSTIZ_API_URL when omitted.
 *   --timeout MS    — fetch timeout per request (default 10000)
 *   --json          — emit machine-readable JSON instead of the table
 */

function parseArgs(argv) {
  const out = {
    apiUrl: process.env.POSTIZ_API_URL?.trim() || '',
    apiKey: process.env.POSTIZ_API_KEY?.trim() || '',
    rootUrl: '',
    timeoutMs: 10_000,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--api-url' && argv[i + 1]) {
      out.apiUrl = argv[i + 1];
      i += 1;
    } else if (arg === '--api-key' && argv[i + 1]) {
      out.apiKey = argv[i + 1];
      i += 1;
    } else if (arg === '--root-url' && argv[i + 1]) {
      out.rootUrl = argv[i + 1];
      i += 1;
    } else if (arg === '--timeout' && argv[i + 1]) {
      out.timeoutMs = Number(argv[i + 1]) || out.timeoutMs;
      i += 1;
    } else if (arg === '--json') {
      out.json = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage: node scripts/smoke-postiz.mjs [flags]',
          '',
          'Required (env or flag):',
          '  POSTIZ_API_URL / --api-url URL',
          '  POSTIZ_API_KEY / --api-key KEY',
          '',
          'Optional:',
          '  --root-url URL    Cloud Run service root (defaults to api-url minus /public/v1)',
          '  --timeout MS      per-request timeout (default 10000)',
          '  --json            JSON output for machine consumption',
        ].join('\n')
      );
      process.exit(0);
    }
  }
  if (!out.rootUrl && out.apiUrl) {
    out.rootUrl = out.apiUrl.replace(/\/public\/v1\/?$/, '') || out.apiUrl;
  }
  return out;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkHealth(rootUrl, timeoutMs) {
  if (!rootUrl) {
    return { ok: false, hint: 'no root URL — pass --root-url to enable health check' };
  }
  const url = `${trimTrailingSlash(rootUrl)}/api/status`;
  try {
    const res = await fetchWithTimeout(url, { method: 'GET' }, timeoutMs);
    if (res.ok) {
      return { ok: true, hint: `${url} → ${res.status}` };
    }
    return { ok: false, hint: `${url} → HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      hint: `${url} → ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function listIntegrations(apiUrl, apiKey, timeoutMs) {
  const url = `${trimTrailingSlash(apiUrl)}/integrations`;
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      },
      timeoutMs
    );
    if (!res.ok) {
      return { ok: false, hint: `${url} → HTTP ${res.status}`, integrations: [] };
    }
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : [];
    } catch {
      return { ok: false, hint: `${url} → non-JSON response`, integrations: [] };
    }
    const list = Array.isArray(data) ? data : [];
    return {
      ok: true,
      hint: `${url} → ${list.length} integration${list.length === 1 ? '' : 's'}`,
      integrations: list,
    };
  } catch (err) {
    return {
      ok: false,
      hint: `${url} → ${err instanceof Error ? err.message : String(err)}`,
      integrations: [],
    };
  }
}

function formatTable(results) {
  const headers = ['status', 'check', 'detail'];
  const rows = results.map((r) => [r.ok ? 'PASS' : 'FAIL', r.name, r.hint]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => String(row[i] ?? '').length))
  );
  const sep = widths.map((w) => '─'.repeat(w)).join('─┼─');
  const renderRow = (cells) =>
    cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join(' │ ');
  return [renderRow(headers), sep, ...rows.map(renderRow)].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const results = [];

  if (!args.apiUrl) {
    results.push({
      name: 'POSTIZ_API_URL set',
      ok: false,
      hint: 'pass --api-url or set POSTIZ_API_URL',
    });
  } else {
    results.push({ name: 'POSTIZ_API_URL set', ok: true, hint: args.apiUrl });
  }
  if (!args.apiKey) {
    results.push({
      name: 'POSTIZ_API_KEY set',
      ok: false,
      hint: 'pass --api-key or set POSTIZ_API_KEY',
    });
  } else {
    results.push({ name: 'POSTIZ_API_KEY set', ok: true, hint: '****' });
  }

  if (!args.apiUrl || !args.apiKey) {
    if (args.json) {
      console.log(JSON.stringify({ results, integrations: [] }, null, 2));
    } else {
      console.log(formatTable(results));
      console.log('\nsmoke FAILED — required inputs missing');
    }
    process.exit(1);
  }

  const health = await checkHealth(args.rootUrl, args.timeoutMs);
  results.push({ name: 'Cloud Run /api/status', ...health });

  const integrations = await listIntegrations(args.apiUrl, args.apiKey, args.timeoutMs);
  results.push({ name: 'GET /integrations (auth)', ok: integrations.ok, hint: integrations.hint });

  const failed = results.filter((r) => !r.ok).length;
  if (args.json) {
    console.log(
      JSON.stringify(
        {
          results,
          integrations: integrations.integrations,
          summary: { passed: results.length - failed, failed },
        },
        null,
        2
      )
    );
  } else {
    console.log(formatTable(results));
    console.log('');
    if (failed === 0) {
      console.log(`smoke ok — Postiz reachable at ${args.apiUrl}`);
    } else {
      console.log(`smoke FAILED — ${failed} check(s) failed`);
    }
  }
  process.exit(failed === 0 ? 0 : 1);
}

main();
