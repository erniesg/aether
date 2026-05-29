import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import worker from '@/workers/aie2026-vibes';

const publicDataPath = path.join(
  process.cwd(),
  'outputs/event-recap-ai-engineer-singapore/public.json'
);
const describeIfPublicData = fs.existsSync(publicDataPath) ? describe : describe.skip;

const excludedLinkedInActivityIds = ['7462867303190360064', '7462880120932986881'];
const excludedPostIds = ['linkedin_14jshqm', 'linkedin_1lipcbp', 'linkedin_1avbg78'];

type PublicPost = {
  postId?: string;
  platform?: string;
  url?: string;
  canonicalUrl?: string;
  linkedinActivityId?: string;
  isClusterRoot?: boolean;
  tags?: string[];
  metrics?: Record<string, number>;
  media?: Array<{ path?: string; localPath?: string }>;
};

type PublicTheme = {
  postIds?: string[];
  rootPostIds?: string[];
  attachedPostIds?: string[];
};

function readPublicData() {
  return JSON.parse(fs.readFileSync(publicDataPath, 'utf8')) as {
    posts: PublicPost[];
    themes: PublicTheme[];
    voices: Array<{ samplePostUrls?: string[] }>;
    stats: Record<string, any>;
    clusterCoverage: Record<string, any>;
  };
}

function countByPlatform(posts: PublicPost[]) {
  return posts.reduce<Record<string, number>>(
    (acc, post) => {
      const platform = post.platform ?? 'unknown';
      acc[platform] = (acc[platform] ?? 0) + 1;
      return acc;
    },
    { x: 0, linkedin: 0, youtube: 0 }
  );
}

function countTagPrefix(posts: PublicPost[], prefix: string) {
  const counts: Record<string, number> = {};
  for (const post of posts) {
    for (const tag of post.tags ?? []) {
      if (tag.startsWith(prefix)) {
        const key = tag.slice(prefix.length);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
  }
  return counts;
}

function metricTotals(posts: PublicPost[]) {
  const totals: Record<string, Record<string, number>> = {};
  for (const post of posts) {
    const platform = post.platform ?? 'unknown';
    const bucket = (totals[platform] ??= {});
    for (const [key, value] of Object.entries(post.metrics ?? {})) {
      if (Number.isFinite(value)) bucket[key] = (bucket[key] ?? 0) + value;
    }
  }
  return totals;
}

function mediaStats(posts: PublicPost[]) {
  const out: Record<string, { posts: number; items: number; localItems: number }> = {};
  for (const platform of ['x', 'linkedin', 'youtube']) {
    const platformPosts = posts.filter((post) => post.platform === platform);
    out[platform] = {
      posts: platformPosts.filter((post) => (post.media ?? []).length > 0).length,
      items: platformPosts.reduce((sum, post) => sum + (post.media ?? []).length, 0),
      localItems: platformPosts.reduce(
        (sum, post) => sum + (post.media ?? []).filter((item) => item.path || item.localPath).length,
        0
      ),
    };
  }
  return out;
}

function clusterCoverage(posts: PublicPost[], themes: PublicTheme[]) {
  const visiblePostIds = new Set(posts.map((post) => post.postId).filter(Boolean));
  const clusteredIds = new Set<string>();
  const rootIds = new Set<string>();
  const attachedIds = new Set<string>();

  for (const theme of themes) {
    for (const postId of theme.postIds ?? []) if (visiblePostIds.has(postId)) clusteredIds.add(postId);
    for (const postId of theme.rootPostIds ?? []) if (visiblePostIds.has(postId)) rootIds.add(postId);
    for (const postId of theme.attachedPostIds ?? []) if (visiblePostIds.has(postId)) attachedIds.add(postId);
  }

  return {
    totalRefs: posts.length,
    clusteredRefs: clusteredIds.size,
    rootRefs: rootIds.size || clusteredIds.size,
    attachedRefs: attachedIds.size,
    unclusteredRefs: Math.max(0, posts.length - clusteredIds.size),
    unclusteredByPlatform: {},
  };
}

function collectStrings(value: unknown, out: string[] = []) {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

describeIfPublicData('AIE2026 public data bundle', () => {
  it('excludes reviewed-out LinkedIn posts and keeps visible metrics derived from the filtered corpus', () => {
    const data = readPublicData();
    const blockedPattern = new RegExp([...excludedLinkedInActivityIds, ...excludedPostIds].join('|'));
    const offendingRefs = collectStrings(data).filter((value) => blockedPattern.test(value));

    expect(offendingRefs).toEqual([]);

    const relevantPosts = data.posts.filter((post) => (post.tags ?? []).includes('relevant:event'));
    const totals = metricTotals(data.posts);
    const relevantTotals = metricTotals(relevantPosts);
    const xRelevant = relevantTotals.x ?? {};
    const linkedInRelevant = relevantTotals.linkedin ?? {};
    const youtubeRelevant = relevantTotals.youtube ?? {};
    const xViews = xRelevant.views ?? xRelevant.impressions ?? 0;
    const youtubeViews = youtubeRelevant.views ?? youtubeRelevant.impressions ?? 0;
    const xLikes = xRelevant.likes ?? 0;
    const youtubeLikes = youtubeRelevant.likes ?? 0;

    expect(data.stats.total).toBe(data.posts.length);
    expect(data.stats.byPlatform).toEqual(countByPlatform(data.posts));
    expect(data.stats.relevantTotal).toBe(relevantPosts.length);
    expect(data.stats.relevantByPlatform).toEqual(countByPlatform(relevantPosts));
    expect(data.stats.intent).toEqual(countTagPrefix(relevantPosts, 'intent:'));
    expect(data.stats.sentiment).toEqual(countTagPrefix(relevantPosts, 'sentiment:'));
    expect(data.stats.metricTotalsByPlatform).toEqual(totals);
    expect(data.stats.metricTotalsRelevantByPlatform).toEqual(relevantTotals);
    expect(data.stats.mediaByPlatform).toEqual(mediaStats(data.posts));
    expect(data.stats.mediaRelevantByPlatform).toEqual(mediaStats(relevantPosts));
    expect(data.stats.relevanceTiers).toEqual({
      core: relevantPosts.filter((post) => (post.tags ?? []).includes('relevance:core')).length,
      context: relevantPosts.filter(
        (post) => (post.tags ?? []).includes('context:event') || post.isClusterRoot === false
      ).length,
      irrelevant: data.posts.length - relevantPosts.length,
    });
    expect(data.stats.crossSurfaceObserved).toMatchObject({
      xViews,
      youtubeViews,
      knownViews: xViews + youtubeViews,
      xLikes,
      youtubeLikes,
      knownLikes: xLikes + youtubeLikes,
      linkedinViews: null,
      linkedinImpressionsAvailable: false,
      linkedinReactions: linkedInRelevant.reactions ?? 0,
      linkedinComments: linkedInRelevant.comments ?? 0,
      linkedinReposts: linkedInRelevant.reposts ?? 0,
      knownLikesAndLinkedInReactions: xLikes + youtubeLikes + (linkedInRelevant.reactions ?? 0),
    });
    expect(data.clusterCoverage).toEqual(clusterCoverage(data.posts, data.themes));
  });

  it('exports the posts CSV from the same filtered source bundle', async () => {
    const data = readPublicData();
    const publicJson = fs.readFileSync(publicDataPath, 'utf8');

    const response = await worker.fetch(
      new Request('https://aether.berlayar.ai/vibes/aie2026/data?format=csv&download=1'),
      {
        AETHER_ASSETS: {
          get: async (key: string) =>
            key === 'event-recap-ai-engineer-singapore/public.json'
              ? {
                  body: streamText(publicJson),
                  httpMetadata: { contentType: 'application/json; charset=utf-8' },
                  text: async () => publicJson,
                }
              : null,
        },
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');

    const csv = await response.text();
    const blockedPattern = new RegExp([...excludedLinkedInActivityIds, ...excludedPostIds].join('|'));
    expect(csv).not.toMatch(blockedPattern);
    expect(countCsvRecords(csv)).toBe(data.posts.length + 1);
  });
});

function streamText(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

function countCsvRecords(value: string): number {
  let rows = 0;
  let inQuotes = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"') {
      if (inQuotes && value[index + 1] === '"') index += 1;
      else inQuotes = !inQuotes;
    } else if (char === '\n' && !inQuotes) {
      rows += 1;
    }
  }
  return value && !value.endsWith('\n') ? rows + 1 : rows;
}
