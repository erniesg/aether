import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { analyzePosts } from '../lib/research/event-recap/analyze';
import { searchLinkedInViaApify } from '../lib/research/event-recap/apify';
import { enrichPostConversationTags } from '../lib/research/event-recap/conversation';
import { deriveExpansionPlan } from '../lib/research/event-recap/expand';
import type { EventPlatform, EventPost, EventPostMedia } from '../lib/research/event-recap/types';
import { makePostId, scorePostsByPlatform } from '../lib/research/event-recap/utils';
import { searchXViaOfficialApi } from '../lib/research/event-recap/x-api';

const ARCHIVE_PATH = 'outputs/event-recap-ai-engineer-singapore/archive.json';
const MEDIA_ROOT = 'outputs/event-recap-ai-engineer-singapore/media';
const RUN_ID = `event_recap_x_linkedin_enrich_${Date.now()}`;

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

function canonicalUrl(platform: EventPlatform, url: string): string {
  if (platform === 'x') {
    const match = url.match(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i);
    if (match) return `https://x.com/${match[1]}/status/${match[2]}`.toLowerCase();
  }
  if (platform === 'youtube') {
    const canonical = youtubeCanonicalUrl(url);
    if (canonical) return canonical.toLowerCase();
  }
  return url.trim().split(/[?#]/)[0].replace(/\/$/, '').toLowerCase();
}

function youtubeCanonicalUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const id = /(^|\.)youtu\.be$/i.test(parsed.hostname)
      ? parsed.pathname.split('/').filter(Boolean)[0]
      : /(^|\.)youtube\.com$/i.test(parsed.hostname)
        ? parsed.searchParams.get('v') ?? undefined
        : undefined;
    if (!id) return undefined;
    const commentId = parsed.searchParams.get('lc');
    if (commentId) return `https://www.youtube.com/watch?v=${id}&lc=${commentId}`;
    if (parsed.hash.startsWith('#live-chat-')) return `https://www.youtube.com/watch?v=${id}${parsed.hash}`;
    return `https://www.youtube.com/watch?v=${id}`;
  } catch {
    return undefined;
  }
}

function eventRelevant(post: Pick<EventPost, 'platform' | 'text' | 'authorHandle' | 'authorName' | 'url'>): boolean {
  const text = `${post.text} ${post.authorHandle ?? ''} ${post.authorName ?? ''} ${post.url}`;
  const lower = text.toLowerCase();
  if (isHardNoise(lower)) return false;
  const exactEvent =
    /\bai engineer singapore\b/i.test(text) ||
    /\bai engineers singapore\b/i.test(text) ||
    /\bai engineer sg\b/i.test(text) ||
    /\bai engineer summit singapore\b/i.test(text) ||
    /\bai engineer conference singapore\b/i.test(text) ||
    /\baie singapore\b/i.test(text) ||
    /#aiengineersingapore\b/i.test(text) ||
    /\baidotengineer\b/i.test(text) ||
    /\bai\.engineer\/singapore\b/i.test(text) ||
    /\broad to aie\b/i.test(text);
  if (exactEvent) return true;

  const eventPhrase =
    /\bai engineer(?:ing)?\b.{0,100}\b(singapore|sg|capitol|kempinski|pullman|65labs|conference|summit|hackathon|workshop)\b/i.test(text) ||
    /\b(singapore|sg|capitol|kempinski|pullman)\b.{0,80}\b(for|at|@|during|to)\s+(?:the\s+)?ai engineer(?:ing)?\b/i.test(text);
  if (eventPhrase) return !isGenericHiringNoise(lower);

  const ministerKeynote =
    /\b(vivian balakrishnan|foreign minister|minister for foreign affairs|vivianbala)\b/i.test(text) &&
    /\b(second brain|personal ai agent|dev conference|developer conference|govern a technology|graph memory|sqlite|whatsapp|nanoclaw)\b/i.test(text);
  if (ministerKeynote) return true;

  const nanoClawEvent =
    /nanoclaw/i.test(text) &&
    /\b(ai engineer|aie|conference|summit|keynote|minister|vivian|cabinet minister)\b/i.test(text);
  if (nanoClawEvent) return true;

  const knownAnchor =
    /\b(sherry yan jiang|sherrypeek|agrim singh|65labs|gabriel chua|gavriel_cohen|nanoclaw|ryo lu|jj geewax)\b/i.test(text) &&
    /\b(ai engineer|aie|codex|cursor|openai|capitol|keynote|workshop|conference|summit)\b/i.test(text);
  return knownAnchor;
}

function isHardNoise(text: string): boolean {
  return /\b(austcham|australian international school|sandboxaq|nigerian english|cerebras ipo|bnpl|buy now, pay later|crypto vc fund partner|drugging a girl's drink)\b/i.test(text);
}

function isGenericHiringNoise(text: string): boolean {
  const hiring = /\b(hiring|we'?re hiring|job opening|job posting|job ad|jobs page|open roles?|open positions?|vacancy|resume|cv|apply now|candidate|recruiting|software engineer|data engineer|machine learning engineer)\b/i.test(text);
  const event = /\b(ai engineer singapore|aie singapore|aidotengineer|road to aie|ai\.engineer[\/\s]+singapore)\b/i.test(text);
  return hiring && !event;
}

function materialize(
  eventId: string,
  platform: EventPlatform,
  posts: Array<Omit<EventPost, 'eventId' | 'runId' | 'capturedAt' | 'updatedAt' | 'reachScore'>>
): EventPost[] {
  const now = Date.now();
  return posts.map((post) => {
    const relevant = eventRelevant(post as EventPost);
    const tags = new Set(post.tags ?? []);
    tags.add(relevant ? 'relevant:event' : 'irrelevant:event');
    tags.add(platform === 'x' ? 'x-official-expanded-discovery' : 'apify-linkedin-expanded-discovery');
    const withEnvelope: EventPost = {
      ...post,
      eventId,
      runId: RUN_ID,
      capturedAt: now,
      updatedAt: now,
      reachScore: 0,
      tags: Array.from(tags),
    };
    return enrichPostConversationTags(withEnvelope);
  });
}

function mergePosts(existing: EventPost[], incoming: EventPost[]): { posts: EventPost[]; added: number; updated: number } {
  const byUrl = new Map<string, EventPost>();
  for (const post of existing) byUrl.set(canonicalUrl(post.platform, post.url), post);

  let added = 0;
  let updated = 0;
  for (const post of incoming) {
    const key = canonicalUrl(post.platform, post.url);
    const previous = byUrl.get(key);
    if (!previous) {
      byUrl.set(key, post);
      added += 1;
      continue;
    }
    byUrl.set(key, mergePost(previous, post));
    updated += 1;
  }

  return { posts: Array.from(byUrl.values()), added, updated };
}

function mergePost(previous: EventPost, incoming: EventPost): EventPost {
  const media = mergeMedia(previous.media, incoming.media);
  return {
    ...previous,
    authorName: incoming.authorName || previous.authorName,
    authorHandle: incoming.authorHandle ?? previous.authorHandle,
    authorUrl: incoming.authorUrl ?? previous.authorUrl,
    authorMeta: { ...previous.authorMeta, ...incoming.authorMeta },
    postedAt: incoming.postedAt ?? previous.postedAt,
    metrics: { ...previous.metrics, ...incoming.metrics },
    media: media.length ? media : previous.media,
    tags: Array.from(new Set([...(previous.tags ?? []), ...(incoming.tags ?? [])])),
    raw: {
      previous: previous.raw,
      enrichment: incoming.raw,
    },
    updatedAt: incoming.updatedAt,
  };
}

function mergeMedia(previous: EventPost['media'], incoming: EventPost['media']): EventPostMedia[] {
  const mediaByUrl = new Map<string, EventPostMedia>();
  for (const item of previous ?? []) mediaByUrl.set(item.url, item);
  for (const item of incoming ?? []) {
    const replacementKey =
      item.previewUrl && mediaByUrl.has(item.previewUrl) ? item.previewUrl : item.url;
    const existing = mediaByUrl.get(replacementKey);
    if (!existing) {
      mediaByUrl.set(item.url, item);
      continue;
    }
    mediaByUrl.delete(replacementKey);
    const sameAsset = existing.url === item.url;
    mediaByUrl.set(item.url, {
      ...existing,
      ...item,
      localPath: sameAsset ? existing.localPath : item.localPath,
      contentType: sameAsset ? existing.contentType ?? item.contentType : item.contentType,
      bytes: sameAsset ? existing.bytes ?? item.bytes : item.bytes,
      downloadedAt: sameAsset ? existing.downloadedAt ?? item.downloadedAt : item.downloadedAt,
    });
  }
  return Array.from(mediaByUrl.values());
}

async function downloadMedia(posts: EventPost[]) {
  const summary = {
    requested: 0,
    downloaded: 0,
    reused: 0,
    failed: 0,
    failures: [] as Array<{ url: string; error: string }>,
  };
  for (const post of posts) {
    for (const media of post.media ?? []) {
      if (!media.url) continue;
      summary.requested += 1;
      if ((media as any).localPath && fs.existsSync((media as any).localPath)) {
        summary.reused += 1;
        continue;
      }
      try {
        const downloaded = await downloadOne(media.url, post.platform);
        Object.assign(media, downloaded);
        media.type = mediaTypeFromDownloaded(media.type, downloaded.contentType, media.url);
        summary.downloaded += 1;
      } catch (err) {
        summary.failed += 1;
        summary.failures.push({
          url: media.url,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return summary;
}

async function downloadOne(url: string, platform: EventPlatform) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    const bytes = Buffer.from(await res.arrayBuffer());
    const dir = path.resolve(MEDIA_ROOT, platform);
    fs.mkdirSync(dir, { recursive: true });
    const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
    const ext = extensionFor(url, contentType);
    const localPath = path.join(dir, `${hash}${ext}`);
    fs.writeFileSync(localPath, bytes);
    return {
      localPath,
      contentType,
      bytes: bytes.length,
      downloadedAt: Date.now(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extensionFor(url: string, contentType: string): string {
  if (/image\/png/i.test(contentType)) return '.png';
  if (/image\/webp/i.test(contentType)) return '.webp';
  if (/image\/gif/i.test(contentType)) return '.gif';
  if (/video\/mp4/i.test(contentType)) return '.mp4';
  if (/image\/jpe?g/i.test(contentType)) return '.jpg';
  const match = new URL(url).pathname.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov)$/i);
  return match ? `.${match[1].toLowerCase().replace('jpeg', 'jpg')}` : '.bin';
}

function mediaTypeFromDownloaded(
  current: EventPostMedia['type'],
  contentType: string,
  url: string
): EventPostMedia['type'] {
  if (current === 'video' || current === 'gif') {
    if (/video\//i.test(contentType)) return current === 'gif' ? 'gif' : 'video';
    if (/image\//i.test(contentType)) return current;
  }
  if (/image\/gif/i.test(contentType)) return 'gif';
  if (/image\//i.test(contentType)) return 'image';
  if (/video\//i.test(contentType)) return current === 'gif' ? 'gif' : 'video';
  const lower = url.toLowerCase();
  if (/\.(gif)(?:$|\?)/.test(lower)) return 'gif';
  if (/\.(png|jpe?g|webp|avif)(?:$|\?)/.test(lower) || lower.includes('/image/')) return 'image';
  if (/\.(mp4|mov|webm|m4v)(?:$|\?)/.test(lower) || lower.includes('/video/')) return 'video';
  return current;
}

function computeStats(posts: EventPost[], youtube: any) {
  const total = posts.length;
  const byPlatform = countByPlatform(posts);
  const relevantPosts = posts.filter((post) => !post.tags.includes('irrelevant:event'));
  const relevantByPlatform = countByPlatform(relevantPosts);
  const metricTotalsByPlatform = metricTotals(posts);
  const metricTotalsRelevantByPlatform = metricTotals(relevantPosts);
  const mediaByPlatform = mediaStats(posts);
  const mediaRelevantByPlatform = mediaStats(relevantPosts);
  const xRelevant = metricTotalsRelevantByPlatform.x ?? {};
  const linkedInRelevant = metricTotalsRelevantByPlatform.linkedin ?? {};
  const youtubeViews = youtube?.relevantViews ?? 0;
  const youtubeLikes = youtube?.relevantLikes ?? 0;

  return {
    total,
    byPlatform,
    intent: countTagPrefix(relevantPosts, 'intent:'),
    sentiment: countTagPrefix(relevantPosts, 'sentiment:'),
    relevantByPlatform,
    crossSurfaceObserved: {
      xViews: xRelevant.views ?? xRelevant.impressions ?? 0,
      youtubeViews,
      knownViews: (xRelevant.views ?? xRelevant.impressions ?? 0) + youtubeViews,
      xLikes: xRelevant.likes ?? 0,
      youtubeLikes,
      knownLikes: (xRelevant.likes ?? 0) + youtubeLikes,
      linkedinViews: null,
      linkedinImpressionsAvailable: false,
      linkedinReactions: linkedInRelevant.reactions ?? 0,
      linkedinComments: linkedInRelevant.comments ?? 0,
      linkedinReposts: linkedInRelevant.reposts ?? 0,
      linkedinEngagementSource:
        'Relevant LinkedIn public post engagement from Apify post search plus prior logged-in/TinyFish card captures; LinkedIn impressions remain unavailable unless rendered on source posts.',
      knownLikesAndLinkedInReactions: (xRelevant.likes ?? 0) + youtubeLikes + (linkedInRelevant.reactions ?? 0),
    },
    mediaByPlatform,
    metricTotalsByPlatform,
    relevantTotal: relevantPosts.length,
    metricTotalsRelevantByPlatform,
    mediaRelevantByPlatform,
  };
}

function countByPlatform(posts: EventPost[]) {
  return posts.reduce<Record<EventPlatform, number>>(
    (acc, post) => {
      acc[post.platform] += 1;
      return acc;
    },
    { x: 0, linkedin: 0, youtube: 0 }
  );
}

function countTagPrefix(posts: EventPost[], prefix: string) {
  const counts: Record<string, number> = {};
  for (const post of posts) {
    for (const tag of post.tags) {
      if (tag.startsWith(prefix)) counts[tag.slice(prefix.length)] = (counts[tag.slice(prefix.length)] ?? 0) + 1;
    }
  }
  return counts;
}

function metricTotals(posts: EventPost[]) {
  const out: Record<string, Record<string, number>> = {};
  for (const post of posts) {
    const bucket = (out[post.platform] ??= {});
    for (const [key, value] of Object.entries(post.metrics ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value)) bucket[key] = (bucket[key] ?? 0) + value;
    }
  }
  return out;
}

function mediaStats(posts: EventPost[]) {
  const out: Record<string, { posts: number; items: number; localItems: number }> = {};
  for (const platform of ['x', 'linkedin', 'youtube'] as EventPlatform[]) {
    const platformPosts = posts.filter((post) => post.platform === platform);
    out[platform] = {
      posts: platformPosts.filter((post) => post.media?.length).length,
      items: platformPosts.reduce((sum, post) => sum + (post.media?.length ?? 0), 0),
      localItems: platformPosts.reduce(
        (sum, post) => sum + (post.media ?? []).filter((media) => (media as any).localPath).length,
        0
      ),
    };
  }
  return out;
}

function postSummary(posts: EventPost[]) {
  return {
    total: posts.length,
    relevant: posts.filter((post) => !post.tags.includes('irrelevant:event')).length,
    irrelevant: posts.filter((post) => post.tags.includes('irrelevant:event')).length,
    withMetrics: posts.filter((post) => post.metrics && Object.values(post.metrics).some((value) => value != null)).length,
    withImpressions: posts.filter((post) => post.metrics?.impressions || post.metrics?.views).length,
    withAuthorMeta: posts.filter((post) => post.authorMeta && Object.values(post.authorMeta).some((value) => value != null)).length,
    withMedia: posts.filter((post) => post.media?.length).length,
    mediaItems: posts.reduce((sum, post) => sum + (post.media?.length ?? 0), 0),
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

async function main() {
  loadEnvLocal();
  const xMax = Number(process.env.EVENT_RECAP_X_DISCOVERY_MAX ?? 500);
  const linkedInMax = Number(process.env.EVENT_RECAP_LINKEDIN_DISCOVERY_MAX ?? 500);
  const xMaxQueries = Number(process.env.EVENT_RECAP_X_MAX_QUERIES ?? 24);
  const linkedInMaxQueries = Number(process.env.EVENT_RECAP_LINKEDIN_MAX_QUERIES ?? 56);
  const archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
  const existingPosts = archive.posts ?? [];
  const windowStart = archive.windowStart ?? '2026-05-11T00:00:00.000Z';
  const windowEnd = archive.windowEnd ?? '2026-05-18T00:00:00.000Z';
  const seenX = existingPosts.filter((post: EventPost) => post.platform === 'x').map((post: EventPost) => post.url);
  const seenLinkedIn = existingPosts
    .filter((post: EventPost) => post.platform === 'linkedin')
    .map((post: EventPost) => post.url);
  const xOnlyQueries = envList('EVENT_RECAP_X_ONLY_QUERIES');
  const xQueries = (xOnlyQueries.length
    ? xOnlyQueries
    : [
        ...(archive.querySet?.x ?? []),
        ...(archive.expansion?.querySet ?? []),
        ...envList('EVENT_RECAP_EXTRA_QUERIES', 'EVENT_RECAP_EXTRA_X_QUERIES'),
      ]
  ).filter((query: string) => !/^".*"$/.test(query) || query.toLowerCase().includes('ai engineer'));
  const linkedInOnlyQueries = envList('EVENT_RECAP_LINKEDIN_ONLY_QUERIES');
  const linkedInQueries = linkedInOnlyQueries.length
    ? linkedInOnlyQueries
    : [
        ...((archive.querySet?.linkedin ?? archive.expansion?.querySet ?? ['AI Engineer Singapore']) as string[]),
        ...envList('EVENT_RECAP_EXTRA_QUERIES', 'EVENT_RECAP_EXTRA_LINKEDIN_QUERIES'),
      ];

  const xResult =
    xMax > 0
      ? await searchXViaOfficialApi({
          querySet: xQueries,
          windowStart,
          windowEnd,
          maxItems: xMax,
          maxQueries: Math.min(xMaxQueries, xQueries.length),
          maxScannedPerQuery: 400,
          seenPostUrls: seenX,
        })
      : { posts: [], warnings: ['X discovery skipped by EVENT_RECAP_X_DISCOVERY_MAX=0'], raw: {} };

  const linkedInResult =
    linkedInMax > 0
      ? await searchLinkedInViaApify({
          querySet: linkedInQueries,
          windowStart,
          windowEnd,
          maxItems: linkedInMax,
          maxQueries: Math.min(linkedInMaxQueries, linkedInQueries.length),
          sortBy: 'date',
          contentType: 'all',
          candidateMultiplier: 2,
          seenPostUrls: seenLinkedIn,
          scrapeComments: false,
          scrapeReactions: false,
        })
      : { posts: [], warnings: ['LinkedIn discovery skipped by EVENT_RECAP_LINKEDIN_DISCOVERY_MAX=0'], raw: {} };

  const xIncoming = materialize(archive.eventId, 'x', xResult.posts);
  const linkedInIncoming = materialize(archive.eventId, 'linkedin', linkedInResult.posts);
  const incoming = [...xIncoming, ...linkedInIncoming];
  const downloadSummary = await downloadMedia(incoming.filter((post) => !post.tags.includes('irrelevant:event')));
  const merged = mergePosts(existingPosts, incoming);
  const scored = scorePostsByPlatform(merged.posts);
  const analysis = analyzePosts(archive.eventId, scored.filter((post) => !post.tags.includes('irrelevant:event')));
  const expansion = deriveExpansionPlan(archive.eventName ?? archive.eventId, scored.filter((post) => !post.tags.includes('irrelevant:event')), {
    baseQueries: archive.expansion?.querySet ?? [],
    maxQueries: 24,
  });

  const backupPath = `${ARCHIVE_PATH}.bak-${Date.now()}`;
  fs.copyFileSync(ARCHIVE_PATH, backupPath);
  archive.posts = scored;
  archive.stats = computeStats(scored, archive.youtube);
  archive.themes = analysis.themes;
  archive.voices = analysis.voices;
  archive.expansion = expansion;
  archive.updatedAt = new Date().toISOString();
  archive.enrichment = [
    ...(archive.enrichment ?? []),
    {
      mode: 'x-official-and-linkedin-apify-expanded-discovery',
      generatedAt: archive.updatedAt,
      runId: RUN_ID,
      x: {
        requested: xMax,
        returned: xResult.posts.length,
        incoming: postSummary(xIncoming),
        warnings: xResult.warnings,
      },
      linkedin: {
        requested: linkedInMax,
        returned: linkedInResult.posts.length,
        incoming: postSummary(linkedInIncoming),
        warnings: linkedInResult.warnings,
      },
      merge: {
        added: merged.added,
        updated: merged.updated,
        total: scored.length,
      },
      media: downloadSummary,
    },
  ];
  fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2));

  const runOutput = {
    generatedAt: archive.updatedAt,
    runId: RUN_ID,
    backupPath,
    archivePath: ARCHIVE_PATH,
    x: {
      warnings: xResult.warnings,
      raw: xResult.raw,
      incoming: postSummary(xIncoming),
    },
    linkedin: {
      warnings: linkedInResult.warnings,
      raw: linkedInResult.raw,
      incoming: postSummary(linkedInIncoming),
    },
    merge: {
      added: merged.added,
      updated: merged.updated,
      total: scored.length,
    },
    media: downloadSummary,
    stats: archive.stats,
  };
  const outPath = `outputs/event-recap-ai-engineer-singapore/${RUN_ID}.json`;
  fs.writeFileSync(outPath, JSON.stringify(runOutput, null, 2));
  console.log(JSON.stringify({
    outPath,
    backupPath,
    x: runOutput.x.incoming,
    linkedin: runOutput.linkedin.incoming,
    merge: runOutput.merge,
    media: runOutput.media,
    stats: {
      total: archive.stats.total,
      relevantByPlatform: archive.stats.relevantByPlatform,
      mediaRelevantByPlatform: archive.stats.mediaRelevantByPlatform,
      crossSurfaceObserved: archive.stats.crossSurfaceObserved,
    },
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
