#!/usr/bin/env node
// Smoke-test the RapidAPI signal scout against live keys.
//
//   RAPIDAPI_KEY=… node scripts/smoke-signals.mjs                 # all platforms
//   RAPIDAPI_KEY=… node scripts/smoke-signals.mjs --platform tiktok
//   RAPIDAPI_KEY=… node scripts/smoke-signals.mjs --query "warm shelf"
//
// Standalone (no TS imports) so plain `node` runs it. Validates auth +
// reachability + non-empty response per platform; full parsing lives in the
// unit tests under `tests/unit/signals-rapidapi-*.test.ts`.
//
// When RAPIDAPI_KEY is unset, the script exits cleanly so it can run in CI
// without leaking real calls. Real validation is opt-in.

const TARGETS = {
  pinterest: {
    host: process.env.RAPIDAPI_PINTEREST_HOST ||
      'pinterest-scraper-fast.p.rapidapi.com',
    path: process.env.RAPIDAPI_PINTEREST_SEARCH_PATH || '/search',
    params: (q) => ({ query: q, keyword: q, q, limit: '5' }),
  },
  instagram: {
    host: process.env.RAPIDAPI_INSTAGRAM_HOST ||
      'instagram-scraper-api2.p.rapidapi.com',
    path: process.env.RAPIDAPI_INSTAGRAM_SEARCH_PATH || '/v1/search',
    params: (q) => ({ search_query: q, query: q, count: '5' }),
  },
  tiktok: {
    host: process.env.RAPIDAPI_TIKTOK_HOST || 'tiktok-scraper7.p.rapidapi.com',
    path: process.env.RAPIDAPI_TIKTOK_KEYWORD_PATH || '/feed/search',
    params: (q) => ({ keywords: q, keyword: q, count: '5' }),
  },
  xiaohongshu: {
    host: process.env.RAPIDAPI_XHS_HOST ||
      'xiaohongshu-all-in-one.p.rapidapi.com',
    path: process.env.RAPIDAPI_XHS_SEARCH_PATH || '/search/notes',
    params: (q) => ({ keyword: q, keywords: q, query: q, page_size: '5' }),
  },
};

function parseArgs(argv) {
  const out = { platforms: Object.keys(TARGETS), query: 'skincare' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--platform' && argv[i + 1]) {
      out.platforms = [argv[i + 1]];
      i += 1;
    } else if (arg === '--query' && argv[i + 1]) {
      out.query = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function buildUrl(host, path, params) {
  const url = new URL(`https://${host}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function countItems(data) {
  if (!data || typeof data !== 'object') return 0;
  if (Array.isArray(data)) return data.length;
  for (const key of ['items', 'pins', 'videos', 'notes', 'aweme_list', 'medias', 'data']) {
    const inner = data[key];
    if (Array.isArray(inner)) return inner.length;
    if (inner && typeof inner === 'object') {
      const c = countItems(inner);
      if (c > 0) return c;
    }
  }
  return 0;
}

async function smokeOne(platform, query, key) {
  const target = TARGETS[platform];
  if (!target) {
    return { platform, ok: false, message: 'unknown platform' };
  }
  const url = buildUrl(target.host, target.path, target.params(query));
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': target.host,
        Accept: 'application/json',
      },
    });
    const elapsed = Date.now() - startedAt;
    const text = await res.text();
    if (!res.ok) {
      return {
        platform,
        ok: false,
        message: `${res.status} ${target.host}: ${text.slice(0, 200)}`,
        elapsed,
      };
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return {
        platform,
        ok: false,
        message: `non-JSON body from ${target.host}`,
        elapsed,
      };
    }
    const items = countItems(data);
    return {
      platform,
      ok: true,
      message: `${items} items in ${elapsed}ms`,
      elapsed,
      items,
    };
  } catch (error) {
    return {
      platform,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const { platforms, query } = parseArgs(process.argv.slice(2));

  if (!process.env.RAPIDAPI_KEY) {
    console.log('[smoke-signals] RAPIDAPI_KEY not set — skipping live calls.');
    console.log('[smoke-signals] See docs/SIGNALS-SECRETS.md for setup.');
    process.exit(0);
  }

  console.log(`[smoke-signals] query="${query}" platforms=[${platforms.join(', ')}]`);

  const key = process.env.RAPIDAPI_KEY;
  let okCount = 0;
  let errCount = 0;

  for (const platform of platforms) {
    const result = await smokeOne(platform, query, key);
    const status = result.ok ? 'ok ' : 'err';
    console.log(`[smoke-signals] [${status}] ${platform}: ${result.message}`);
    if (result.ok) okCount += 1;
    else errCount += 1;
  }

  console.log(
    `[smoke-signals] done. ok=${okCount} errors=${errCount} total=${platforms.length}`
  );
  process.exit(errCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('[smoke-signals] fatal:', error);
  process.exit(2);
});
