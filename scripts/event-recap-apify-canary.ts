import fs from 'node:fs';
import path from 'node:path';
import { searchLinkedInViaApify, searchXViaApify } from '../lib/research/event-recap/apify';

function loadEnvLocal() {
  const file = path.resolve('.env.local');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function summarize(posts: Array<Record<string, any>>) {
  return {
    posts: posts.length,
    withMetrics: posts.filter((post) =>
      post.metrics && Object.values(post.metrics).some((value) => value != null)
    ).length,
    withImpressions: posts.filter((post) => post.metrics?.impressions || post.metrics?.views).length,
    withAuthorMeta: posts.filter((post) =>
      post.authorMeta && Object.values(post.authorMeta).some((value) => value != null)
    ).length,
    withMedia: posts.filter((post) => post.media?.length).length,
    mediaItems: posts.reduce((sum, post) => sum + (post.media?.length ?? 0), 0),
    sample: posts.slice(0, 5).map((post) => ({
      platform: post.platform,
      url: post.url,
      author: post.authorHandle ?? post.authorName,
      metrics: post.metrics,
      mediaItems: post.media?.length ?? 0,
      authorMetaKeys: post.authorMeta
        ? Object.keys(post.authorMeta).filter((key) => post.authorMeta[key] != null)
        : [],
      text: String(post.text ?? '').slice(0, 180),
    })),
  };
}

function envList(...names: string[]): string[] {
  return names.flatMap((name) =>
    (process.env[name] ?? '')
      .split(/\r?\n|[;,]/)
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function numberEnv(name: string, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  const raw = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.round(raw)));
}

loadEnvLocal();

async function main() {
  const archivePath = 'outputs/event-recap-ai-engineer-singapore/archive.json';
  const archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
  const allPosts = archive.posts ?? [];
  const seenX = allPosts.filter((post: any) => post.platform === 'x').map((post: any) => post.url);
  const seenLinkedIn = allPosts
    .filter((post: any) => post.platform === 'linkedin')
    .map((post: any) => post.url);
  const windowStart = archive.windowStart ?? '2026-05-11T00:00:00.000Z';
  const windowEnd = archive.windowEnd ?? '2026-05-18T00:00:00.000Z';

  const xQueries = envList('EVENT_RECAP_X_CANARY_ONLY_QUERIES');
  if (!xQueries.length) xQueries.push(
    'AI Engineer Singapore',
    '"AI Engineer Singapore"',
    '@aiDotEngineer Singapore',
    'ai.engineer/singapore',
    ...envList('EVENT_RECAP_EXTRA_QUERIES', 'EVENT_RECAP_EXTRA_X_QUERIES', 'EVENT_RECAP_X_CANARY_QUERIES'),
  );
  const linkedinQueries = envList('EVENT_RECAP_LINKEDIN_CANARY_ONLY_QUERIES');
  if (!linkedinQueries.length) linkedinQueries.push(
    'AI Engineer Singapore',
    '"AI Engineer Singapore"',
    'AI Engineer SG',
    'Road to AIE Singapore',
    ...envList(
      'EVENT_RECAP_EXTRA_QUERIES',
      'EVENT_RECAP_EXTRA_LINKEDIN_QUERIES',
      'EVENT_RECAP_LINKEDIN_CANARY_QUERIES'
    ),
  );
  const xMaxItems = numberEnv('EVENT_RECAP_X_CANARY_MAX_ITEMS', 20, 1, 100);
  const xMaxQueries = numberEnv('EVENT_RECAP_X_CANARY_MAX_QUERIES', xQueries.length, 1, xQueries.length);
  const linkedInMaxItems = numberEnv('EVENT_RECAP_LINKEDIN_CANARY_MAX_ITEMS', 20, 1, 100);
  const linkedInMaxQueries = numberEnv(
    'EVENT_RECAP_LINKEDIN_CANARY_MAX_QUERIES',
    linkedinQueries.length,
    1,
    linkedinQueries.length
  );

  const output: any = {
    generatedAt: new Date().toISOString(),
    mode: 'apify-canary-discovery',
    input: {
      x: { maxItems: xMaxItems, maxQueries: xMaxQueries, queryCount: xQueries.length, seen: seenX.length },
      linkedin: {
        maxItems: linkedInMaxItems,
        maxQueries: linkedInMaxQueries,
        queryCount: linkedinQueries.length,
        seen: seenLinkedIn.length,
      },
    },
    results: {},
  };

  if (process.env.EVENT_RECAP_APIFY_CANARY_SKIP_X === '1') {
    output.results.x = { ok: true, skipped: true };
  } else {
    try {
    const x = await searchXViaApify({
      querySet: xQueries,
      windowStart,
      windowEnd,
      maxItems: xMaxItems,
      maxQueries: xMaxQueries,
      sort: 'Latest + Top',
      tweetLanguage: 'en',
      candidateMultiplier: 1,
      seenPostUrls: seenX,
    });
    output.results.x = { ok: true, warnings: x.warnings, raw: x.raw, stats: summarize(x.posts), posts: x.posts };
    } catch (err) {
      output.results.x = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (process.env.EVENT_RECAP_APIFY_CANARY_SKIP_LINKEDIN === '1') {
    output.results.linkedin = { ok: true, skipped: true };
  } else {
    try {
    const linkedin = await searchLinkedInViaApify({
      querySet: linkedinQueries,
      windowStart,
      windowEnd,
      maxItems: linkedInMaxItems,
      maxQueries: linkedInMaxQueries,
      sortBy: 'date',
      contentType: 'all',
      candidateMultiplier: 1,
      seenPostUrls: seenLinkedIn,
      scrapeComments: false,
      scrapeReactions: false,
    });
    output.results.linkedin = {
      ok: true,
      warnings: linkedin.warnings,
      raw: linkedin.raw,
      stats: summarize(linkedin.posts),
      posts: linkedin.posts,
    };
    } catch (err) {
      output.results.linkedin = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const outPath = 'outputs/event-recap-ai-engineer-singapore/apify-canary-discovery.json';
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    outPath,
    x: output.results.x?.ok ? output.results.x.stats : output.results.x,
    linkedin: output.results.linkedin?.ok ? output.results.linkedin.stats : output.results.linkedin,
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
