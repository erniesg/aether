import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { analyzePosts } from '../lib/research/event-recap/analyze';
import { enrichPostConversationTags } from '../lib/research/event-recap/conversation';
import { deriveExpansionPlan } from '../lib/research/event-recap/expand';
import type { EventPlatform, EventPost, EventPostMedia } from '../lib/research/event-recap/types';
import { scorePostsByPlatform } from '../lib/research/event-recap/utils';
import { lookupXPostsByIds } from '../lib/research/event-recap/x-api';

const ARCHIVE_PATH = 'outputs/event-recap-ai-engineer-singapore/archive.json';
const MEDIA_ROOT = 'outputs/event-recap-ai-engineer-singapore/media';
const RUN_ID = `event_recap_rich_media_${Date.now()}`;

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

function numberEnv(name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const raw = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.round(raw)));
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

function tweetIdFromUrl(url: string): string | undefined {
  return url.match(/\/status\/(\d+)/)?.[1];
}

function isRelevant(post: EventPost): boolean {
  return !(post.tags ?? []).includes('irrelevant:event');
}

function isXReply(post: EventPost): boolean {
  return (post.tags ?? []).includes('x-reply');
}

function isNativeXMedia(media: EventPostMedia): boolean {
  return ['x-api', 'x-lookup', 'apify-x'].includes(media.source ?? '');
}

function hasNativeXMedia(post: EventPost): boolean {
  return (post.media ?? []).some(isNativeXMedia);
}

function hasTcoUrl(post: EventPost): boolean {
  return /https?:\/\/t\.co\/[A-Za-z0-9_%-]+/i.test(post.text ?? '');
}

function isVideoThumbnailOnly(media: EventPostMedia): boolean {
  if (media.type !== 'video' && media.type !== 'gif') return false;
  return !/video\.twimg\.com|\.mp4(?:$|\?)/i.test(media.url);
}

function xLookupTargets(posts: EventPost[], limit: number): string[] {
  if (limit <= 0) return [];
  const candidates = posts
    .filter((post) => post.platform === 'x' && isRelevant(post))
    .map((post) => {
      const id = tweetIdFromUrl(post.url);
      const videoThumb = (post.media ?? []).some(isVideoThumbnailOnly);
      const noMediaTco = !hasNativeXMedia(post) && hasTcoUrl(post);
      const noMediaRoot = noMediaTco && !isXReply(post);
      const score =
        (videoThumb ? 1000 : 0) +
        (noMediaRoot ? 500 : 0) +
        (noMediaTco ? 250 : 0) +
        (!isXReply(post) ? 50 : 0) +
        Math.min(50, Math.log10((post.metrics?.views ?? post.metrics?.impressions ?? 0) + 1) * 10);
      return { id, post, score };
    })
    .filter((item): item is { id: string; post: EventPost; score: number } => Boolean(item.id && item.score > 0))
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    out.push(candidate.id);
    if (out.length >= limit) break;
  }
  return out;
}

function materializeLookupPosts(
  eventId: string,
  posts: Array<Omit<EventPost, 'eventId' | 'runId' | 'capturedAt' | 'updatedAt' | 'reachScore'>>
): EventPost[] {
  const now = Date.now();
  return posts.map((post) =>
    enrichPostConversationTags({
      ...post,
      eventId,
      runId: RUN_ID,
      capturedAt: now,
      updatedAt: now,
      reachScore: 0,
      tags: Array.from(new Set([...(post.tags ?? []), 'x-rich-media-lookup'])),
    })
  );
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

async function enrichCardPreviews(posts: EventPost[], limit: number, linksPerPost: number) {
  const summary = {
    targetedPosts: 0,
    attemptedUrls: 0,
    addedMedia: 0,
    skipped: 0,
    failures: [] as Array<{ postUrl: string; url: string; error: string }>,
    samples: [] as Array<{ postUrl: string; pageUrl?: string; mediaUrl: string; type: EventPostMedia['type'] }>,
  };
  const targets = posts
    .filter((post) => post.platform === 'x' && isRelevant(post) && !hasNativeXMedia(post) && extractUrlCandidates(post).length)
    .sort((a, b) => Number(isXReply(a)) - Number(isXReply(b)))
    .slice(0, limit);

  for (const post of targets) {
    summary.targetedPosts += 1;
    const existing = new Set((post.media ?? []).map((media) => media.url));
    const mediaToAdd: EventPostMedia[] = [];
    for (const url of extractUrlCandidates(post).slice(0, linksPerPost)) {
      summary.attemptedUrls += 1;
      try {
        const media = await cardPreviewFromUrl(url);
        if (!media || existing.has(media.url)) {
          summary.skipped += 1;
          continue;
        }
        existing.add(media.url);
        mediaToAdd.push(media);
        summary.addedMedia += 1;
        if (summary.samples.length < 8) {
          summary.samples.push({
            postUrl: post.url,
            pageUrl: media.pageUrl,
            mediaUrl: media.url,
            type: media.type,
          });
        }
      } catch (err) {
        summary.failures.push({
          postUrl: post.url,
          url,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (mediaToAdd.length) {
      post.media = [...(post.media ?? []), ...mediaToAdd];
      post.tags = Array.from(new Set([...(post.tags ?? []), 'x-card-preview-media']));
      post.updatedAt = Date.now();
    }
  }
  return summary;
}

function extractUrlCandidates(post: EventPost): string[] {
  const urls = new Set<string>();
  const rawUrls = collectEntityUrls(post.raw);
  for (const url of rawUrls) urls.add(url);
  for (const match of (post.text ?? '').matchAll(/https?:\/\/[^\s)]+/gi)) {
    urls.add(match[0].replace(/[.,;!?]+$/, ''));
  }
  return Array.from(urls).filter((url) => {
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) return false;
      if (/(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(parsed.hostname)) return false;
      return true;
    } catch {
      return false;
    }
  });
}

function collectEntityUrls(value: unknown, depth = 0): string[] {
  if (!value || depth > 8) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectEntityUrls(item, depth + 1));
  if (typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const urls: string[] = [];
  for (const key of ['expanded_url', 'unwound_url', 'url']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) urls.push(candidate);
  }
  for (const child of Object.values(record)) urls.push(...collectEntityUrls(child, depth + 1));
  return urls;
}

async function cardPreviewFromUrl(inputUrl: string): Promise<EventPostMedia | undefined> {
  const resolvedUrl = await resolveUrl(inputUrl);
  const mediaDirectType = mediaTypeFromUrl(resolvedUrl);
  if (mediaDirectType !== 'unknown') {
    return {
      url: resolvedUrl,
      type: mediaDirectType,
      source: 'x-card-preview',
      pageUrl: resolvedUrl,
      previewUrl: mediaDirectType === 'image' || mediaDirectType === 'gif' ? resolvedUrl : undefined,
    };
  }

  const res = await fetchWithTimeout(resolvedUrl, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    },
  });
  const contentType = res.headers.get('content-type') ?? '';
  const finalUrl = res.url || resolvedUrl;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (/^image\//i.test(contentType) || /^video\//i.test(contentType)) {
    return {
      url: finalUrl,
      type: mediaTypeFromContent('unknown', contentType, finalUrl),
      source: 'x-card-preview',
      pageUrl: finalUrl,
      contentType,
    };
  }
  if (!/html/i.test(contentType)) return undefined;

  const html = await res.text();
  const meta = parseMeta(html);
  const mediaUrl =
    meta['og:video:secure_url'] ??
    meta['og:video:url'] ??
    meta['og:video'] ??
    meta['twitter:player:stream'] ??
    meta['og:image:secure_url'] ??
    meta['og:image:url'] ??
    meta['og:image'] ??
    meta['twitter:image:src'] ??
    meta['twitter:image'];
  if (!mediaUrl) return undefined;
  const absoluteMediaUrl = absoluteUrl(mediaUrl, finalUrl);
  if (!absoluteMediaUrl) return undefined;
  const contentHint = meta['og:video:type'] ?? meta['twitter:player:stream:content_type'] ?? '';
  const type = mediaTypeFromContent(mediaTypeFromUrl(absoluteMediaUrl), contentHint, absoluteMediaUrl);
  const title = meta['og:title'] ?? meta['twitter:title'] ?? meta.title;
  return {
    url: absoluteMediaUrl,
    type,
    source: 'x-card-preview',
    pageUrl: finalUrl,
    previewUrl: type === 'image' || type === 'gif' ? absoluteMediaUrl : undefined,
    altText: title ? `Link preview: ${title}` : undefined,
    width: numberFromString(meta['og:image:width'] ?? meta['twitter:image:width']),
    height: numberFromString(meta['og:image:height'] ?? meta['twitter:image:height']),
    contentType: contentHint || undefined,
  };
}

async function resolveUrl(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, {
    method: 'HEAD',
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    },
  });
  if (res.ok && res.url) return res.url;
  return url;
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseMeta(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const title of html.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)) {
    out.title ??= decodeHtml(title[1].replace(/\s+/g, ' ').trim());
  }
  for (const match of html.matchAll(/<meta\s+([^>]*?)\/?>/gi)) {
    const attrs = parseAttrs(match[1]);
    const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
    const content = attrs.content;
    if (!key || !content || out[key]) continue;
    out[key] = decodeHtml(content);
  }
  return out;
}

function parseAttrs(value: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of value.matchAll(/([A-Za-z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function absoluteUrl(value: string, base: string): string | undefined {
  try {
    return new URL(value, base).toString();
  } catch {
    return undefined;
  }
}

function numberFromString(value?: string): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

async function downloadMedia(posts: EventPost[], enabled: boolean) {
  const summary = {
    requested: 0,
    downloaded: 0,
    reused: 0,
    disabled: 0,
    failed: 0,
    failures: [] as Array<{ url: string; error: string }>,
  };
  for (const post of posts) {
    if (!isRelevant(post)) continue;
    for (const media of post.media ?? []) {
      if (!media.url) continue;
      summary.requested += 1;
      if (media.localPath && fs.existsSync(media.localPath)) {
        enrichExistingMediaFile(media);
        summary.reused += 1;
        continue;
      }
      if (!enabled) {
        summary.disabled += 1;
        continue;
      }
      try {
        const downloaded = await downloadOne(media.url, post.platform);
        Object.assign(media, downloaded);
        media.type = mediaTypeFromContent(media.type, downloaded.contentType, media.url);
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

function pruneUndownloadedCardPreviews(posts: EventPost[], failedUrls: Set<string>) {
  const summary = { posts: 0, items: 0 };
  if (!failedUrls.size) return summary;
  for (const post of posts) {
    const media = post.media ?? [];
    const kept = media.filter((item) => {
      const shouldPrune =
        item.source === 'x-card-preview' &&
        failedUrls.has(item.url) &&
        !(item.localPath && fs.existsSync(item.localPath));
      if (shouldPrune) summary.items += 1;
      return !shouldPrune;
    });
    if (kept.length !== media.length) {
      summary.posts += 1;
      post.media = kept.length ? kept : undefined;
      post.updatedAt = Date.now();
      post.tags = Array.from(new Set([...(post.tags ?? []), 'x-card-preview-pruned']));
    }
  }
  return summary;
}

function enrichExistingMediaFile(media: EventPostMedia) {
  if (!media.localPath || !fs.existsSync(media.localPath)) return;
  const stat = fs.statSync(media.localPath);
  media.bytes ??= stat.size;
  media.contentType ??= contentTypeFromPath(media.localPath);
  if (media.contentType) media.type = mediaTypeFromContent(media.type, media.contentType, media.url);
}

async function downloadOne(url: string, platform: EventPlatform) {
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      },
    },
    60_000
  );
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
}

function extensionFor(url: string, contentType: string): string {
  if (/image\/png/i.test(contentType)) return '.png';
  if (/image\/webp/i.test(contentType)) return '.webp';
  if (/image\/gif/i.test(contentType)) return '.gif';
  if (/video\/mp4/i.test(contentType)) return '.mp4';
  if (/image\/jpe?g/i.test(contentType)) return '.jpg';
  const match = new URL(url).pathname.match(/\.(jpg|jpeg|png|gif|webp|avif|mp4|mov|webm|m4v)$/i);
  return match ? `.${match[1].toLowerCase().replace('jpeg', 'jpg')}` : '.bin';
}

function contentTypeFromPath(localPath: string): string | undefined {
  const ext = path.extname(localPath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  return undefined;
}

function mediaTypeFromContent(
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
  return mediaTypeFromUrl(url) === 'unknown' ? current : mediaTypeFromUrl(url);
}

function mediaTypeFromUrl(url: string): EventPostMedia['type'] {
  const lower = url.toLowerCase();
  if (/\.(gif)(?:$|\?)/.test(lower)) return 'gif';
  if (
    /\.(png|jpe?g|webp|avif)(?:$|\?)/.test(lower) ||
    lower.includes('pbs.twimg.com/media') ||
    (lower.includes('media.licdn.com') && lower.includes('/image'))
  ) {
    return 'image';
  }
  if (
    /\.(mp4|mov|webm|m4v)(?:$|\?)/.test(lower) ||
    lower.includes('video.twimg.com') ||
    (lower.includes('media.licdn.com') && lower.includes('/video'))
  ) {
    return 'video';
  }
  return 'unknown';
}

function computeStats(posts: EventPost[], youtube: any) {
  const total = posts.length;
  const byPlatform = countByPlatform(posts);
  const relevantPosts = posts.filter(isRelevant);
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
        (sum, post) => sum + (post.media ?? []).filter((media) => media.localPath).length,
        0
      ),
    };
  }
  return out;
}

function audit(posts: EventPost[]) {
  const relevant = posts.filter(isRelevant);
  const x = relevant.filter((post) => post.platform === 'x');
  const linkedin = relevant.filter((post) => post.platform === 'linkedin');
  return {
    relevant: relevant.length,
    x: {
      relevant: x.length,
      roots: x.filter((post) => !isXReply(post)).length,
      mediaPosts: x.filter((post) => post.media?.length).length,
      mediaItems: x.reduce((sum, post) => sum + (post.media?.length ?? 0), 0),
      videoThumbnailOnly: x.filter((post) => (post.media ?? []).some(isVideoThumbnailOnly)).length,
      noMediaTco: x.filter((post) => !(post.media ?? []).length && hasTcoUrl(post)).length,
    },
    linkedin: {
      relevant: linkedin.length,
      mediaPosts: linkedin.filter((post) => post.media?.length).length,
      mediaItems: linkedin.reduce((sum, post) => sum + (post.media?.length ?? 0), 0),
      unknownMedia: linkedin.reduce(
        (sum, post) => sum + (post.media ?? []).filter((media) => media.type === 'unknown').length,
        0
      ),
    },
  };
}

async function main() {
  loadEnvLocal();
  const writeArchive = process.env.EVENT_RECAP_RICH_MEDIA_WRITE !== '0';
  const downloadEnabled = process.env.EVENT_RECAP_RICH_MEDIA_DOWNLOAD !== '0';
  const lookupLimit = numberEnv('EVENT_RECAP_RICH_MEDIA_X_LOOKUP_LIMIT', 80, 0, 1000);
  const cardLimit = numberEnv('EVENT_RECAP_RICH_MEDIA_CARD_LIMIT', 80, 0, 1000);
  const linksPerPost = numberEnv('EVENT_RECAP_RICH_MEDIA_LINKS_PER_POST', 2, 1, 5);

  const archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
  const existingPosts: EventPost[] = archive.posts ?? [];
  const before = audit(existingPosts);
  const lookupTargets = xLookupTargets(existingPosts, lookupLimit);
  const lookupResult =
    lookupTargets.length > 0
      ? await lookupXPostsByIds({ tweetIds: lookupTargets, maxItems: lookupTargets.length })
      : { posts: [], warnings: ['No X lookup targets selected'], raw: {} };
  const incomingLookup = materializeLookupPosts(archive.eventId, lookupResult.posts);
  const merged = mergePosts(existingPosts, incomingLookup);
  const cardSummary = await enrichCardPreviews(merged.posts, cardLimit, linksPerPost);
  const mediaSummary = await downloadMedia(merged.posts, downloadEnabled);
  const pruneSummary = pruneUndownloadedCardPreviews(
    merged.posts,
    new Set(mediaSummary.failures.map((failure) => failure.url))
  );
  const scored = scorePostsByPlatform(merged.posts);
  const relevant = scored.filter(isRelevant);
  const analysis = analyzePosts(archive.eventId, relevant);
  const expansion = deriveExpansionPlan(archive.eventName ?? archive.eventId, relevant, {
    baseQueries: archive.expansion?.querySet ?? [],
    maxQueries: 24,
  });
  const after = audit(scored);
  const generatedAt = new Date().toISOString();
  const backupPath = writeArchive ? `${ARCHIVE_PATH}.bak-${Date.now()}` : undefined;

  if (writeArchive && backupPath) {
    fs.copyFileSync(ARCHIVE_PATH, backupPath);
    archive.posts = scored;
    archive.stats = computeStats(scored, archive.youtube);
    archive.themes = analysis.themes;
    archive.voices = analysis.voices;
    archive.clustering = analysis.clusterQuality;
    archive.expansion = expansion;
    archive.updatedAt = generatedAt;
    archive.enrichment = [
      ...(archive.enrichment ?? []),
      {
        mode: 'rich-media-x-lookup-card-preview-download',
        generatedAt,
        runId: RUN_ID,
        input: {
          lookupLimit,
          cardLimit,
          linksPerPost,
          downloadEnabled,
        },
        before,
        lookup: {
          targets: lookupTargets.length,
          returned: lookupResult.posts.length,
          warnings: lookupResult.warnings,
        },
        merge: {
          added: merged.added,
          updated: merged.updated,
          total: scored.length,
        },
        cards: cardSummary,
        media: mediaSummary,
        pruned: pruneSummary,
        after,
      },
    ];
    fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2));
  }

  const runOutput = {
    generatedAt,
    runId: RUN_ID,
    archivePath: ARCHIVE_PATH,
    backupPath,
    wroteArchive: writeArchive,
    input: {
      lookupLimit,
      cardLimit,
      linksPerPost,
      downloadEnabled,
      lookupTargets,
    },
    before,
    lookup: {
      warnings: lookupResult.warnings,
      raw: lookupResult.raw,
      returned: lookupResult.posts.length,
      posts: lookupResult.posts,
    },
    merge: {
      added: merged.added,
      updated: merged.updated,
      total: scored.length,
    },
    cards: cardSummary,
    media: mediaSummary,
    pruned: pruneSummary,
    after,
    stats: computeStats(scored, archive.youtube),
  };
  const outPath = `outputs/event-recap-ai-engineer-singapore/${RUN_ID}.json`;
  fs.writeFileSync(outPath, JSON.stringify(runOutput, null, 2));
  console.log(
    JSON.stringify(
      {
        outPath,
        backupPath,
        wroteArchive: writeArchive,
        before,
        lookup: {
          targets: lookupTargets.length,
          returned: lookupResult.posts.length,
          warnings: lookupResult.warnings,
        },
        merge: runOutput.merge,
        cards: {
          targetedPosts: cardSummary.targetedPosts,
          attemptedUrls: cardSummary.attemptedUrls,
          addedMedia: cardSummary.addedMedia,
          failures: cardSummary.failures.length,
        },
        media: {
          requested: mediaSummary.requested,
          downloaded: mediaSummary.downloaded,
          reused: mediaSummary.reused,
          disabled: mediaSummary.disabled,
          failed: mediaSummary.failed,
        },
        pruned: pruneSummary,
        after,
        stats: {
          relevantByPlatform: runOutput.stats.relevantByPlatform,
          mediaRelevantByPlatform: runOutput.stats.mediaRelevantByPlatform,
          crossSurfaceObserved: runOutput.stats.crossSurfaceObserved,
        },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
