import fs from 'node:fs';
import path from 'node:path';
import { searchXViaOfficialApi } from '../lib/research/event-recap/x-api';

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
      url: post.url,
      author: post.authorHandle ?? post.authorName,
      metrics: post.metrics,
      mediaItems: post.media?.length ?? 0,
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

async function main() {
  loadEnvLocal();
  const archivePath = 'outputs/event-recap-ai-engineer-singapore/archive.json';
  const archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
  const seenX = (archive.posts ?? [])
    .filter((post: any) => post.platform === 'x')
    .map((post: any) => post.url);
  const windowStart = archive.windowStart ?? '2026-05-11T00:00:00.000Z';
  const windowEnd = archive.windowEnd ?? '2026-05-18T00:00:00.000Z';
  const querySet = envList('EVENT_RECAP_X_CANARY_ONLY_QUERIES');
  if (!querySet.length) querySet.push(
    'AI Engineer Singapore',
    '"AI Engineer Singapore"',
    '@aiDotEngineer Singapore',
    '@SherryYanJiang Singapore',
    '@swyx Singapore',
    'ai.engineer/singapore',
    ...envList('EVENT_RECAP_EXTRA_QUERIES', 'EVENT_RECAP_EXTRA_X_QUERIES', 'EVENT_RECAP_X_CANARY_QUERIES'),
  );
  const maxItems = numberEnv('EVENT_RECAP_X_CANARY_MAX_ITEMS', 30, 1, 100);
  const maxQueries = numberEnv('EVENT_RECAP_X_CANARY_MAX_QUERIES', querySet.length, 1, querySet.length);

  const output: any = {
    generatedAt: new Date().toISOString(),
    mode: 'x-official-canary-discovery',
    input: { maxItems, maxQueries, querySet, seen: seenX.length },
  };
  try {
    const result = await searchXViaOfficialApi({
      querySet,
      windowStart,
      windowEnd,
      maxItems,
      maxQueries,
      maxScannedPerQuery: 100,
      seenPostUrls: seenX,
    });
    output.result = {
      ok: true,
      warnings: result.warnings,
      raw: result.raw,
      stats: summarize(result.posts),
      posts: result.posts,
    };
  } catch (err) {
    output.result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const outPath = 'outputs/event-recap-ai-engineer-singapore/x-official-canary-discovery.json';
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    outPath,
    x: output.result?.ok ? output.result.stats : output.result,
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
