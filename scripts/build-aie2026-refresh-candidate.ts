import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildStoryAssignedThemes } from '../lib/research/event-recap/story-assignment';
import { bestDisplayAuthorName } from '../lib/research/event-recap/utils';

type AnyRecord = Record<string, any>;

const EVENT_DIR = path.resolve(process.cwd(), 'outputs/event-recap-ai-engineer-singapore');
const PUBLIC_MEDIA_PREFIX = 'event-recap-ai-engineer-singapore/media/';
const ARCHIVE_PATH = path.join(EVENT_DIR, 'archive.json');
const PUBLIC_PATH = path.join(EVENT_DIR, 'public.json');
const SIDECAR_PATH = path.join(
  EVENT_DIR,
  'delta-refresh-tests/metrics-refresh-current-corpus-2026-05-27T05-38-59-329Z/posts.metrics-refreshed.json'
);
const SIDECAR_SUMMARY_PATH = path.join(
  EVENT_DIR,
  'delta-refresh-tests/metrics-refresh-current-corpus-2026-05-27T05-38-59-329Z/full-metrics-refresh-final-summary.json'
);
const REVIEW_DIR = path.join(
  EVENT_DIR,
  'delta-refresh-tests/relevance-review-current-sidecar-2026-05-27T06-20-00Z'
);
const HUMAN_DECISIONS_PATH = path.join(REVIEW_DIR, 'human-relevance-decisions-2026-05-27.json');
const ORPHAN_RESOLUTION_PATH = path.join(REVIEW_DIR, 'orphan-linkedin-parent-resolution.json');

const REFRESH_ID = process.env.REFRESH_ID ?? '2026-05-27T07-05-28Z-human-reviewed-delta';
const REFRESH_DIR = path.join(EVENT_DIR, 'refreshes', REFRESH_ID);
const GENERATED_AT = new Date().toISOString();

type NativeIds = {
  xTweetId?: string;
  linkedinActivityId?: string;
  linkedinCommentId?: string;
  youtubeVideoId?: string;
  youtubeCommentId?: string;
  parentNativeKey?: string;
};

function readJson<T = AnyRecord>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(fileName: string, data: unknown): void {
  fs.writeFileSync(path.join(REFRESH_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function hashValue(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function addTag(tags: string[], tag: string): string[] {
  return tags.some((existing) => existing.toLowerCase() === tag.toLowerCase()) ? tags : [...tags, tag];
}

function removeTags(tags: string[], prefixes: string[]): string[] {
  return tags.filter((tag) => !prefixes.some((prefix) => tag.startsWith(prefix)));
}

function isRelevant(row: AnyRecord): boolean {
  return (row.tags ?? []).some((tag: string) => tag.toLowerCase() === 'relevant:event');
}

function metricEngagement(metrics: AnyRecord = {}): number {
  return Number(metrics.likes ?? 0) + Number(metrics.reactions ?? 0) + Number(metrics.reposts ?? 0) + Number(metrics.comments ?? 0) + Number(metrics.replies ?? 0);
}

function countByPlatform(rows: AnyRecord[]): Record<string, number> {
  return rows.reduce<Record<string, number>>(
    (acc, row) => {
      const platform = String(row.platform ?? 'unknown');
      acc[platform] = (acc[platform] ?? 0) + 1;
      return acc;
    },
    { x: 0, linkedin: 0, youtube: 0 }
  );
}

function countTagPrefix(rows: AnyRecord[], prefix: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const tag of row.tags ?? []) {
      if (String(tag).startsWith(prefix)) {
        const key = String(tag).slice(prefix.length);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
  }
  return counts;
}

function metricTotals(rows: AnyRecord[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    const platform = String(row.platform ?? 'unknown');
    const bucket = (out[platform] ??= {});
    for (const [key, value] of Object.entries(row.metrics ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value)) bucket[key] = (bucket[key] ?? 0) + value;
    }
  }
  return out;
}

function mediaStats(rows: AnyRecord[]): Record<string, { posts: number; items: number; localItems: number }> {
  const out: Record<string, { posts: number; items: number; localItems: number }> = {};
  for (const platform of ['x', 'linkedin', 'youtube']) {
    const platformRows = rows.filter((row) => row.platform === platform);
    out[platform] = {
      posts: platformRows.filter((row) => row.media?.length).length,
      items: platformRows.reduce((sum, row) => sum + (row.media?.length ?? 0), 0),
      localItems: platformRows.reduce(
        (sum, row) => sum + (row.media ?? []).filter((media: AnyRecord) => media.path || media.localPath).length,
        0
      ),
    };
  }
  return out;
}

function sourceDateRange(rows: AnyRecord[]): { start: string; end: string } | undefined {
  const times = rows
    .map((row) => {
      const value = row.postedAt ?? row.capturedAt ?? row.updatedAt;
      const time = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
      return Number.isFinite(time) && time > 0 ? time : undefined;
    })
    .filter((value): value is number => typeof value === 'number');
  return times.length ? { start: new Date(Math.min(...times)).toISOString(), end: new Date(Math.max(...times)).toISOString() } : undefined;
}

function computeStats(rows: AnyRecord[]): AnyRecord {
  const relevantRows = rows.filter(isRelevant);
  const metricTotalsByPlatform = metricTotals(rows);
  const metricTotalsRelevantByPlatform = metricTotals(relevantRows);
  const xRelevant = metricTotalsRelevantByPlatform.x ?? {};
  const linkedInRelevant = metricTotalsRelevantByPlatform.linkedin ?? {};
  const youtubeRelevant = metricTotalsRelevantByPlatform.youtube ?? {};
  const xViews = xRelevant.views ?? xRelevant.impressions ?? 0;
  const youtubeViews = youtubeRelevant.views ?? youtubeRelevant.impressions ?? 0;
  const xLikes = xRelevant.likes ?? 0;
  const youtubeLikes = youtubeRelevant.likes ?? 0;
  return {
    total: rows.length,
    byPlatform: countByPlatform(rows),
    intent: countTagPrefix(relevantRows, 'intent:'),
    sentiment: countTagPrefix(relevantRows, 'sentiment:'),
    relevantByPlatform: countByPlatform(relevantRows),
    sourceDateRange: sourceDateRange(relevantRows),
    crossSurfaceObserved: {
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
      linkedinEngagementSource:
        'Relevant LinkedIn public post engagement from Apify post search plus prior logged-in/TinyFish card captures; LinkedIn impressions remain unavailable unless rendered on source posts.',
      knownLikesAndLinkedInReactions: xLikes + youtubeLikes + (linkedInRelevant.reactions ?? 0),
    },
    mediaByPlatform: mediaStats(rows),
    metricTotalsByPlatform,
    relevantTotal: relevantRows.length,
    relevanceTiers: {
      core: relevantRows.filter((row) => (row.tags ?? []).includes('relevance:core')).length,
      context: relevantRows.filter((row) => (row.tags ?? []).includes('context:event') || row.isClusterRoot === false).length,
      irrelevant: rows.length - relevantRows.length,
    },
    metricTotalsRelevantByPlatform,
    mediaRelevantByPlatform: mediaStats(relevantRows),
  };
}

function rowDate(row: AnyRecord): string {
  const value = row.postedAt ?? row.capturedAt ?? row.updatedAt;
  const time = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : 'date-unknown';
}

function normalizedText(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textTokens(text: unknown): Set<string> {
  return new Set(normalizedText(text).split(' ').filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function canonicalUrl(url: unknown): string | undefined {
  if (typeof url !== 'string' || !url.trim()) return undefined;
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if (/^(www\.)?twitter\.com$/i.test(parsed.hostname)) parsed.hostname = 'x.com';
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    const keep = new URLSearchParams();
    for (const [key, value] of parsed.searchParams.entries()) {
      if (['commentUrn', 'replyUrn', 'lc', 'v'].includes(key)) keep.append(key, value);
    }
    parsed.search = keep.toString();
    return parsed.toString();
  } catch {
    return url.trim().replace(/\/+$/, '');
  }
}

function extractFromUrl(url: unknown, pattern: RegExp): string | undefined {
  if (typeof url !== 'string') return undefined;
  return url.match(pattern)?.[1];
}

function extractLinkedInCommentIds(url: unknown): { parentActivityId?: string; commentId?: string } {
  if (typeof url !== 'string') return {};
  const decoded = decodeURIComponent(url);
  const parentActivityId =
    decoded.match(/activity[:%3A](\d+)/i)?.[1] ??
    decoded.match(/ugcPost[:%3A](\d+)/i)?.[1] ??
    decoded.match(/activity-(\d+)/i)?.[1];
  const commentId =
    decoded.match(/comment[:%3A]\((?:activity|ugcPost)[:%3A]\d+,\s*(\d+)\)/i)?.[1] ??
    decoded.match(/fsd_comment[:%3A]\((\d+),/i)?.[1];
  return { parentActivityId, commentId };
}

function explicitXParentTag(tags: string[]): string | undefined {
  return tags.find((tag: string) => tag.startsWith('parent:'))?.slice('parent:'.length);
}

function explicitXConversationTag(tags: string[]): string | undefined {
  return tags.find((tag: string) => tag.startsWith('conversation:'))?.slice('conversation:'.length);
}

function xConversationId(row: AnyRecord): string | undefined {
  return row.raw?.tweet?.conversationId ?? row.raw?.conversation_id ?? row.raw?.enrichment?.conversation_id ?? row.raw?.previous?.conversation_id;
}

function xReplyToId(row: AnyRecord): string | undefined {
  return (
    row.raw?.tweet?.inReplyToId ??
    row.raw?.referenced_tweets?.find?.((tweet: AnyRecord) => tweet.type === 'replied_to')?.id ??
    row.raw?.tweet?.referenced_tweets?.find?.((tweet: AnyRecord) => tweet.type === 'replied_to')?.id ??
    row.raw?.enrichment?.referenced_tweets?.find?.((tweet: AnyRecord) => tweet.type === 'replied_to')?.id ??
    row.raw?.previous?.referenced_tweets?.find?.((tweet: AnyRecord) => tweet.type === 'replied_to')?.id ??
    row.raw?.previous?.lookup?.referenced_tweets?.find?.((tweet: AnyRecord) => tweet.type === 'replied_to')?.id
  );
}

const DIRECT_EVENT_ANCHOR_RE =
  /\b(ai\s*engineer|aidotengineer|ai\s*dot\s*engineer|aie\s*(?:sg|singapore|2026)?|#aie2026|singapore|vivian|balakrishnan|nanoclaw|clawcon|65labs|kempinski|pullman|daytona|ai builders? meetup|builder community in singapore|atpinsights|codex workshop|student tickets?)\b/i;

function isDetachedXConversationExpansion(row: AnyRecord): boolean {
  if (row.platform !== 'x' || inferRowType(row) === 'parent') return false;
  const tags: string[] = (row.tags ?? []).map((tag: unknown) => String(tag));
  const ids = nativeIds(row, inferRowType(row));
  const conversationId = xConversationId(row);
  return Boolean(ids.xTweetId && conversationId && String(ids.xTweetId) === String(conversationId) && !xReplyToId(row) && explicitXParentTag(tags));
}

function sidecarConversationRejectReason(row: AnyRecord): string | undefined {
  if (isDetachedXConversationExpansion(row) && !DIRECT_EVENT_ANCHOR_RE.test(String(row.text ?? ''))) {
    return 'detached_x_conversation_expansion_without_direct_event_anchor';
  }
  return undefined;
}

function nativeIds(row: AnyRecord, rowType: string): NativeIds {
  const tags: string[] = (row.tags ?? []).map((tag: unknown) => String(tag));
  const xTweetId =
    row.platform === 'x'
      ? row.raw?.tweet?.id ??
        row.raw?.id ??
        row.raw?.enrichment?.id ??
        row.raw?.previous?.id ??
        row.raw?.previous?.lookup?.id ??
        extractFromUrl(row.url, /\/status\/(\d+)/) ??
        String(row.postId ?? '').match(/^x:(\d+)$/)?.[1]
      : undefined;

  const parentX =
    row.platform === 'x' && rowType !== 'parent'
      ? xReplyToId(row) ??
        explicitXParentTag(tags) ??
        explicitXConversationTag(tags) ??
        (xConversationId(row) && String(xConversationId(row)) !== String(xTweetId) ? xConversationId(row) : undefined)
      : undefined;

  const linkedInUrlIds = row.platform === 'linkedin' ? extractLinkedInCommentIds(row.url) : {};
  const linkedinCommentId =
    row.platform === 'linkedin' && row.raw?.type === 'comment'
      ? String(row.raw?.id ?? linkedInUrlIds.commentId ?? '')
      : row.platform === 'linkedin'
        ? linkedInUrlIds.commentId
        : undefined;
  const linkedinActivityId =
    row.platform === 'linkedin'
      ? row.raw?.type === 'comment'
        ? String(row.raw?.postId ?? linkedInUrlIds.parentActivityId ?? '').replace(/^urn:li:activity:/, '')
        : String(
            row.raw?.id ??
              row.raw?.entityId ??
              extractFromUrl(row.url, /activity[:/-](\d+)/i) ??
              extractFromUrl(row.raw?.linkedinUrl, /activity-(\d+)/i) ??
              linkedInUrlIds.parentActivityId ??
              ''
          )
      : undefined;

  const youtubeVideoId =
    row.platform === 'youtube'
      ? row.raw?.video?.id ??
        row.raw?.comment?.snippet?.videoId ??
        row.raw?.parentVideo?.postId?.replace(/^youtube:/, '') ??
        extractFromUrl(row.url, /[?&]v=([^&]+)/) ??
        String(row.postId ?? '').match(/^youtube:([^:]+)$/)?.[1] ??
        tags.find((tag: string) => tag.startsWith('parent-video:'))?.slice('parent-video:'.length)
      : undefined;
  const youtubeCommentId =
    row.platform === 'youtube'
      ? row.raw?.comment?.id ??
        extractFromUrl(row.url, /[?&]lc=([^&]+)/) ??
        String(row.postId ?? '').match(/^youtube-comment(?:-reply)?:([^:]+)$/)?.[1]
      : undefined;

  const parentLinkedIn = row.platform === 'linkedin' && rowType !== 'parent' && linkedinActivityId ? linkedinActivityId : undefined;
  const parentYouTube = row.platform === 'youtube' && rowType !== 'parent' && youtubeVideoId ? youtubeVideoId : undefined;

  return {
    xTweetId: xTweetId ? String(xTweetId) : undefined,
    linkedinActivityId: linkedinActivityId ? String(linkedinActivityId) : undefined,
    linkedinCommentId: linkedinCommentId ? String(linkedinCommentId) : undefined,
    youtubeVideoId: youtubeVideoId ? String(youtubeVideoId) : undefined,
    youtubeCommentId: youtubeCommentId ? String(youtubeCommentId) : undefined,
    parentNativeKey: parentX
      ? `x:tweet:${parentX}`
      : parentLinkedIn
        ? `linkedin:activity:${parentLinkedIn}`
        : parentYouTube
          ? `youtube:video:${parentYouTube}`
          : undefined,
  };
}

function inferRowType(row: AnyRecord): 'parent' | 'comment' | 'reply' {
  const tags = (row.tags ?? []).map((tag: string) => tag.toLowerCase());
  if (tags.includes('x-reply')) return 'reply';
  if (tags.includes('youtube-comment-reply')) return 'reply';
  if (tags.includes('linkedin-comment') || tags.includes('youtube-comment') || tags.includes('comment')) return 'comment';
  if (row.raw?.type === 'comment') return 'comment';
  if (row.platform === 'youtube' && String(row.url ?? '').includes('&lc=')) return 'comment';
  return 'parent';
}

function nativeKey(row: AnyRecord, ids: NativeIds, rowType: string): string | undefined {
  if (row.platform === 'x' && ids.xTweetId) return `x:tweet:${ids.xTweetId}`;
  if (row.platform === 'linkedin') {
    if (rowType !== 'parent' && ids.linkedinCommentId) return `linkedin:comment:${ids.linkedinCommentId}`;
    if (ids.linkedinActivityId) return `linkedin:activity:${ids.linkedinActivityId}`;
  }
  if (row.platform === 'youtube') {
    if (rowType !== 'parent' && ids.youtubeCommentId) return `youtube:comment:${ids.youtubeCommentId}`;
    if (ids.youtubeVideoId) return `youtube:video:${ids.youtubeVideoId}`;
  }
  return undefined;
}

function rawCommentsCount(row: AnyRecord): number {
  return Array.isArray(row.raw?.comments) ? row.raw.comments.length : 0;
}

function stripOrMarkRawComments(row: AnyRecord): AnyRecord {
  const next = clone(row);
  if (Array.isArray(next.raw?.comments)) {
    next.raw.commentsRawProvenance = next.raw.comments;
    next.raw.commentsRawProvenanceOnly = true;
    next.raw.commentsRawProvenanceCount = next.raw.comments.length;
    delete next.raw.comments;
    next.rawCommentsProvenanceOnly = true;
    next.nestedRawCommentCount = next.raw.commentsRawProvenanceCount;
  }
  return next;
}

function normalizeRow(row: AnyRecord, sourceKind: string, decision?: AnyRecord): AnyRecord {
  const rowType = inferRowType(row);
  const ids = nativeIds(row, rowType);
  const key = nativeKey(row, ids, rowType);
  let tags = [...(row.tags ?? [])].map((tag) => String(tag));
  tags = removeTags(tags, ['story:', 'story-type:']);

  if (sourceKind !== 'archive') {
    tags = addTag(tags, 'relevant:event');
    tags = addTag(tags, 'delta-refresh:2026-05-27');
  }
  if (sourceKind === 'recovered-parent') {
    tags = addTag(tags, 'recovered-parent');
    tags = addTag(tags, 'relevance:core');
  }
  if (decision?.humanDecision === 'include') {
    tags = addTag(tags, `human-review:${decision.relevanceClass}`);
    if (decision.rootRecommendation === 'secondary_ref_not_primary_root') {
      tags = addTag(tags, 'context:event');
      tags = addTag(tags, 'relevance:context');
    } else if (!tags.some((tag) => tag.startsWith('relevance:'))) {
      tags = addTag(tags, 'relevance:core');
    }
  }
  if (rowType !== 'parent') {
    tags = addTag(addTag(tags, 'conversation'), rowType === 'reply' ? 'reply' : 'comment');
  }

  const normalized = stripOrMarkRawComments({
    ...row,
    tags,
    rowType,
    canonicalKey: key ?? canonicalUrl(row.url) ?? `${row.platform}:${row.postId}`,
    canonicalUrl: canonicalUrl(row.url),
    xTweetId: ids.xTweetId,
    linkedinActivityId: ids.linkedinActivityId,
    linkedinCommentId: ids.linkedinCommentId,
    youtubeVideoId: ids.youtubeVideoId,
    youtubeCommentId: ids.youtubeCommentId,
    parentNativeKey: ids.parentNativeKey,
    rootPostId: rowType === 'parent' ? row.postId : undefined,
    isClusterRoot: rowType === 'parent' && !tags.some((tag) => tag.toLowerCase() === 'context:event'),
    mergeSource: sourceKind,
  });

  if (sourceKind === 'recovered-parent') {
    normalized.metricsRefresh = normalized.metricsRefresh ?? {
      provider: 'parent-recovery-source-file',
      status: 'stale_recovered_parent_not_refreshed',
      previousMetrics: normalized.metrics ?? {},
      updatedMetrics: normalized.metrics ?? {},
      delta: {},
      note: 'Parent was recovered only to attach orphan comments; metrics were preserved from the source row and not marked as freshly updated.',
    };
  }

  return normalized;
}

function findRecoveredParent(parent: AnyRecord): AnyRecord {
  const sourceFile = path.resolve(process.cwd(), parent.sourceFile);
  const rows = readJson<AnyRecord[]>(sourceFile);
  const activityId = String(parent.url ?? '').match(/activity:(\d+)/)?.[1] ?? String(parent.url ?? '').match(/activity-(\d+)/)?.[1];
  const found = rows.find((row) => {
    const ids = nativeIds(row, inferRowType(row));
    return ids.linkedinActivityId === activityId || row.postId === parent.postId || canonicalUrl(row.url) === canonicalUrl(parent.url);
  });
  if (!found) throw new Error(`Recovered parent not found in ${parent.sourceFile}: ${parent.url}`);
  return found;
}

function mediaPath(localPath: unknown): string | undefined {
  if (typeof localPath !== 'string') return undefined;
  if (localPath.startsWith('outputs/')) return localPath.slice('outputs/'.length);
  const marker = `${path.sep}outputs${path.sep}`;
  const index = localPath.indexOf(marker);
  if (index === -1) return undefined;
  return localPath.slice(index + marker.length).split(path.sep).join('/');
}

function mediaAbsolutePath(localPath: unknown): string | undefined {
  if (typeof localPath !== 'string') return undefined;
  const absolute = path.isAbsolute(localPath) ? localPath : path.resolve(process.cwd(), localPath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return undefined;
  return absolute;
}

function fileHashMaybe(localPath: unknown): string | undefined {
  const absolute = mediaAbsolutePath(localPath);
  if (!absolute) return undefined;
  return crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
}

function extensionForMedia(item: AnyRecord, absolutePath: string): string {
  const existing = path.extname(absolutePath).toLowerCase();
  if (existing) return existing;
  const contentType = String(item.contentType ?? '').toLowerCase();
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('mp4')) return '.mp4';
  if (contentType.includes('quicktime')) return '.mov';
  if (contentType.includes('webm')) return '.webm';
  return '.jpg';
}

function safeMediaSegment(value: unknown): string {
  return String(value ?? 'unknown').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function publicMediaPath(item: AnyRecord, post: AnyRecord): { path?: string; hash?: string; copied: boolean } {
  const original = mediaPath(item.localPath);
  const absolute = mediaAbsolutePath(item.localPath);
  if (!absolute) return { path: original, copied: false };

  const hash = fileHashMaybe(absolute);
  if (original?.startsWith(PUBLIC_MEDIA_PREFIX)) return { path: original, hash, copied: false };
  if (!hash) return { path: original, copied: false };

  const platform = safeMediaSegment(post.platform ?? item.source);
  const extension = extensionForMedia(item, absolute);
  const relative = path.posix.join(PUBLIC_MEDIA_PREFIX, 'refreshes', REFRESH_ID, platform, `${hash.slice(0, 24)}${extension}`);
  const destination = path.resolve(process.cwd(), 'outputs', ...relative.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (!fs.existsSync(destination)) fs.copyFileSync(absolute, destination);
  return { path: relative, hash, copied: true };
}

async function trimPost(post: AnyRecord): Promise<AnyRecord> {
  const includeMedia = post.rowType === 'parent' && post.isClusterRoot !== false;
  const media = includeMedia
    ? (post.media ?? []).map((item: AnyRecord) => {
        const local = publicMediaPath(item, post);
        return {
          url: item.url,
          type: item.type,
          source: item.source,
          previewUrl: item.previewUrl,
          altText: item.altText,
          width: item.width,
          height: item.height,
          contentType: item.contentType,
          bytes: item.bytes,
          downloadedAt: item.downloadedAt,
          path: local.path,
          hash: local.hash,
        };
      })
    : [];

  return {
    postId: post.postId,
    platform: post.platform,
    url: post.url,
    authorName: bestDisplayAuthorName(post),
    authorHandle: post.authorHandle,
    authorUrl: post.authorUrl,
    text: post.text,
    postedAt: post.postedAt,
    capturedAt: post.capturedAt,
    updatedAt: post.updatedAt,
    reachScore: post.reachScore,
    metrics: post.metrics ?? {},
    metricsUpdatedAt: post.metricsUpdatedAt,
    metricsRefresh: post.metricsRefresh,
    tags: post.tags ?? [],
    rowType: post.rowType,
    canonicalKey: post.canonicalKey,
    canonicalUrl: post.canonicalUrl,
    xTweetId: post.xTweetId,
    linkedinActivityId: post.linkedinActivityId,
    linkedinCommentId: post.linkedinCommentId,
    youtubeVideoId: post.youtubeVideoId,
    youtubeCommentId: post.youtubeCommentId,
    parentPostId: post.parentPostId,
    rootPostId: post.rootPostId,
    isClusterRoot: Boolean(post.isClusterRoot),
    contentDuplicateOf: post.contentDuplicateOf,
    isReply: post.rowType !== 'parent',
    storyType: post.storyType,
    primaryStoryId: post.primaryStoryId,
    storyMentions: post.storyMentions ?? [],
    media,
  };
}

function clusterCoverage(posts: AnyRecord[], themes: AnyRecord[]): AnyRecord {
  const postIds = new Set(posts.map((post) => post.postId).filter(Boolean));
  const clusteredIds = new Set<string>();
  const rootIds = new Set<string>();
  const attachedIds = new Set<string>();
  for (const theme of themes) {
    for (const postId of theme.postIds ?? []) if (postIds.has(postId)) clusteredIds.add(postId);
    for (const postId of theme.rootPostIds ?? []) if (postIds.has(postId)) rootIds.add(postId);
    for (const postId of theme.attachedPostIds ?? []) if (postIds.has(postId)) attachedIds.add(postId);
  }
  const unclusteredByPlatform: Record<string, number> = {};
  for (const post of posts) {
    if (clusteredIds.has(post.postId)) continue;
    unclusteredByPlatform[post.platform] = (unclusteredByPlatform[post.platform] ?? 0) + 1;
  }
  return {
    totalRefs: posts.length,
    clusteredRefs: clusteredIds.size,
    rootRefs: rootIds.size || clusteredIds.size,
    attachedRefs: attachedIds.size,
    unclusteredRefs: Math.max(0, posts.length - clusteredIds.size),
    unclusteredByPlatform,
  };
}

function sourceLinks(archive: AnyRecord): AnyRecord[] {
  const byUrl = new Map<string, AnyRecord>();
  for (const entry of archive.enrichment ?? []) {
    for (const source of entry.sourceSurfaces ?? []) {
      if (!source?.url || byUrl.has(source.url)) continue;
      byUrl.set(source.url, {
        platform: source.platform,
        url: source.url,
        label: source.label,
        note: source.note,
      });
    }
  }
  return Array.from(byUrl.values());
}

function groupBy<T>(items: T[], keyFn: (item: T) => string | undefined): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function platformCounts(rows: AnyRecord[]): Record<string, number> {
  return rows.reduce((acc, row) => {
    acc[row.platform] = (acc[row.platform] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function rowTypeCounts(rows: AnyRecord[]): Record<string, number> {
  return rows.reduce((acc, row) => {
    acc[row.rowType] = (acc[row.rowType] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function buildSoftDuplicateGroups(rows: AnyRecord[]): AnyRecord[] {
  const threshold = 0.95;
  const candidates = rows
    .filter(isRelevant)
    .map((row) => ({
      row,
      text: normalizedText(row.text),
      tokens: textTokens(row.text),
    }))
    .filter((item) => item.text.length >= 24);

  const buckets = groupBy(candidates, (item) =>
    [
      item.row.platform,
      String(item.row.authorHandle ?? item.row.authorName ?? '').toLowerCase(),
      rowDate(item.row),
    ].join('|')
  );

  const groups: AnyRecord[] = [];
  for (const [bucketKey, bucket] of buckets.entries()) {
    if (bucket.length < 2) continue;

    const parents = Array.from({ length: bucket.length }, (_, index) => index);
    const find = (index: number): number => {
      if (parents[index] === index) return index;
      parents[index] = find(parents[index]);
      return parents[index];
    };
    const union = (left: number, right: number): void => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
    };

    for (let left = 0; left < bucket.length; left += 1) {
      for (let right = left + 1; right < bucket.length; right += 1) {
        if (jaccardSimilarity(bucket[left].tokens, bucket[right].tokens) >= threshold) union(left, right);
      }
    }

    const components = new Map<number, typeof bucket>();
    for (let index = 0; index < bucket.length; index += 1) {
      const root = find(index);
      const component = components.get(root) ?? [];
      component.push(bucket[index]);
      components.set(root, component);
    }

    for (const component of components.values()) {
      if (component.length < 2) continue;
      const sorted = component.map((item) => item.row).sort((a, b) => {
        const scoreDelta = Number(b.reachScore ?? 0) - Number(a.reachScore ?? 0);
        if (scoreDelta) return scoreDelta;
        const engagementDelta = metricEngagement(b.metrics) - metricEngagement(a.metrics);
        if (engagementDelta) return engagementDelta;
        return String(a.postId).localeCompare(String(b.postId));
      });
      groups.push({
        key: `${bucketKey}|near:${hashValue(component.map((item) => item.text)).slice(0, 12)}`,
        bucketKey,
        match: 'same platform + author + date + >=0.95 token Jaccard normalized text',
        similarityThreshold: threshold,
        canonicalPostId: sorted[0].postId,
        rows: sorted.map((row) => row.postId),
      });
    }
  }

  return groups;
}

function writeRollbackNotes(manifest: AnyRecord): void {
  const publicBackup = `public.backup.${REFRESH_ID}.json`;
  const publicVersioned = `public.${REFRESH_ID}.json`;
  const markdown = `# Rollback notes for ${REFRESH_ID}

This refresh is isolated. It does not overwrite \`archive.json\` or \`public.json\` during candidate generation.

Candidate folder:

\`${REFRESH_DIR}\`

Before promotion, the current public artifact was copied locally to:

\`${path.join(REFRESH_DIR, publicBackup)}\`

Candidate immutable public artifact:

\`${path.join(REFRESH_DIR, publicVersioned)}\`

## Promote data after validation

\`\`\`bash
export REFRESH_ID=${REFRESH_ID}
export REFRESH_DIR="${path.relative(process.cwd(), REFRESH_DIR)}"
export R2_PUBLIC_KEY="event-recap-ai-engineer-singapore/public.json"
export R2_VERSIONED_KEY="event-recap-ai-engineer-singapore/public.$REFRESH_ID.json"
export REFRESH_MEDIA_DIR="outputs/event-recap-ai-engineer-singapore/media/refreshes/$REFRESH_ID"

if [ -d "$REFRESH_MEDIA_DIR" ]; then
  find "$REFRESH_MEDIA_DIR" -type f | while IFS= read -r file; do
    key="\${file#outputs/}"
    npx wrangler r2 object put "aether-assets/$key" --file "$file"
  done
fi

npx wrangler r2 object put "aether-assets/$R2_VERSIONED_KEY" \\
  --file "$REFRESH_DIR/public.$REFRESH_ID.json" \\
  --content-type "application/json; charset=utf-8"

npx wrangler r2 object put "aether-assets/$R2_PUBLIC_KEY" \\
  --file "$REFRESH_DIR/public.$REFRESH_ID.json" \\
  --content-type "application/json; charset=utf-8"
\`\`\`

## Roll back data

\`\`\`bash
export REFRESH_ID=${REFRESH_ID}
export REFRESH_DIR="${path.relative(process.cwd(), REFRESH_DIR)}"
export R2_PUBLIC_KEY="event-recap-ai-engineer-singapore/public.json"

npx wrangler r2 object put "aether-assets/$R2_PUBLIC_KEY" \\
  --file "$REFRESH_DIR/public.backup.$REFRESH_ID.json" \\
  --content-type "application/json; charset=utf-8"
\`\`\`

No schema migration is required. The worker keeps reading the same R2 key.
Uploaded refresh media can remain in R2 after rollback; the restored public JSON no longer references it.

## Candidate counts

- Baseline archive rows: ${manifest.input.baselineArchiveRows}
- Sidecar rows: ${manifest.input.sidecarRows}
- Explicitly excluded sidecar rows: ${manifest.merge.explicitlyExcludedSidecarRows}
- Conversation guard excluded sidecar rows: ${manifest.merge.conversationGuardExcludedSidecarRows}
- Recovered parent rows added: ${manifest.merge.recoveredParentsAdded}
- Candidate archive rows: ${manifest.output.candidateArchiveRows}
`;
  fs.writeFileSync(path.join(REFRESH_DIR, 'rollback-notes.md'), markdown);
}

async function main(): Promise<void> {
  fs.mkdirSync(REFRESH_DIR, { recursive: true });

  const archive = readJson<AnyRecord>(ARCHIVE_PATH);
  const publicCurrent = readJson<AnyRecord>(PUBLIC_PATH);
  const sidecar = readJson<AnyRecord[]>(SIDECAR_PATH);
  const sidecarSummary = readJson<AnyRecord>(SIDECAR_SUMMARY_PATH);
  const human = readJson<AnyRecord>(HUMAN_DECISIONS_PATH);
  const orphanResolution = readJson<AnyRecord>(ORPHAN_RESOLUTION_PATH);

  const decisionByPostId = new Map<string, AnyRecord>(human.decisions.map((decision: AnyRecord) => [decision.postId, decision]));
  const excludedPostIds = new Set<string>(
    human.decisions.filter((decision: AnyRecord) => decision.humanDecision === 'exclude').map((decision: AnyRecord) => decision.postId)
  );
  const sidecarPostIds = new Set(sidecar.map((row) => row.postId));
  const sidecarExcludedPostIds = new Set(Array.from(excludedPostIds).filter((postId) => sidecarPostIds.has(postId)));
  const nonSidecarExcludedReviewRows = Array.from(excludedPostIds).filter((postId) => !sidecarPostIds.has(postId));
  const conversationGuardRejects = sidecar
    .filter((row) => !sidecarExcludedPostIds.has(row.postId))
    .map((row) => ({ row, reason: sidecarConversationRejectReason(row) }))
    .filter((item): item is { row: AnyRecord; reason: string } => Boolean(item.reason));
  const conversationGuardExcludedPostIds = new Set(conversationGuardRejects.map((item) => item.row.postId));
  const totalExcludedSidecarRows = sidecarExcludedPostIds.size + conversationGuardExcludedPostIds.size;
  const includedDecisionByPostId = new Map<string, AnyRecord>(
    human.decisions.filter((decision: AnyRecord) => decision.humanDecision === 'include').map((decision: AnyRecord) => [decision.postId, decision])
  );

  const recoveredParentRows: AnyRecord[] = orphanResolution.parentResolution
    .filter((item: AnyRecord) => item.recommendedAction === 'add_parent_attach_comments')
    .map((item: AnyRecord) => normalizeRow(findRecoveredParent(item.parent), 'recovered-parent'));

  const normalizedArchive: AnyRecord[] = (archive.posts ?? []).map((row: AnyRecord) => normalizeRow(row, 'archive'));
  const includedSidecarRows: AnyRecord[] = sidecar
    .filter((row) => !sidecarExcludedPostIds.has(row.postId) && !conversationGuardExcludedPostIds.has(row.postId))
    .map((row) => normalizeRow(row, 'sidecar', includedDecisionByPostId.get(row.postId) ?? decisionByPostId.get(row.postId)));

  let candidateRows: AnyRecord[] = [...normalizedArchive, ...includedSidecarRows, ...recoveredParentRows];

  const nativeDuplicateGroups = Array.from(groupBy(candidateRows, (row) => row.canonicalKey).entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, rows: group.map((row) => ({ postId: row.postId, mergeSource: row.mergeSource, url: row.url })) }));

  const softGroups = buildSoftDuplicateGroups(candidateRows);

  const softCanonicalByPostId = new Map<string, string>();
  for (const group of softGroups) {
    for (const postId of group.rows) {
      if (postId !== group.canonicalPostId) softCanonicalByPostId.set(postId, group.canonicalPostId);
    }
  }

  candidateRows = candidateRows.map((row) => {
    const duplicateOf = softCanonicalByPostId.get(row.postId);
    if (!duplicateOf) return row;
    return {
      ...row,
      contentDuplicateOf: duplicateOf,
      isRollupCanonical: false,
      isClusterRoot: false,
      tags: addTag(addTag(row.tags ?? [], 'content-duplicate'), 'context:event'),
    };
  });

  const parentByNativeKey = new Map<string, AnyRecord>();
  for (const row of candidateRows) {
    if (row.rowType === 'parent' && row.canonicalKey) parentByNativeKey.set(row.canonicalKey, row);
  }
  candidateRows = candidateRows.map((row) => {
    if (row.rowType === 'parent') {
      return {
        ...row,
        rootPostId: row.postId,
        isClusterRoot: Boolean(row.isClusterRoot && !row.contentDuplicateOf),
      };
    }
    const parent = row.parentNativeKey ? parentByNativeKey.get(row.parentNativeKey) : undefined;
    return {
      ...row,
      parentPostId: parent?.postId,
      rootPostId: parent?.rootPostId ?? parent?.postId ?? row.parentNativeKey,
      isClusterRoot: false,
    };
  });

  const relevantRows = candidateRows.filter(isRelevant);
  const storyAssigned = buildStoryAssignedThemes(archive.eventId, relevantRows as any[]);
  const storyAssignedById = new Map<string, AnyRecord>(storyAssigned.posts.map((row: AnyRecord) => [row.postId, row]));
  candidateRows = candidateRows.map((row) => storyAssignedById.get(row.postId) ?? row);

  const themeRootIds = new Set<string>();
  const themeAttachedIds = new Set<string>();
  const adjustedThemes = storyAssigned.themes.map((theme: AnyRecord) => {
    const roots = (theme.rootPostIds ?? []).filter((postId: string) => {
      const row = storyAssignedById.get(postId);
      return row?.rowType === 'parent' && row.isClusterRoot !== false && !row.contentDuplicateOf;
    });
    const attached = Array.from(new Set([
      ...(theme.attachedPostIds ?? []),
      ...(theme.rootPostIds ?? []).filter((postId: string) => !roots.includes(postId)),
    ]));
    for (const postId of roots) themeRootIds.add(postId);
    for (const postId of attached) themeAttachedIds.add(postId);
    return {
      ...theme,
      rootPostIds: roots,
      attachedPostIds: attached,
      postIds: [...roots, ...attached],
      updatedAt: Date.now(),
    };
  });
  candidateRows = candidateRows.map((row) => ({
    ...row,
    isClusterRoot: row.rowType === 'parent' && themeRootIds.has(row.postId),
  }));

  const candidateStats = computeStats(candidateRows);
  const candidateArchive: AnyRecord = {
    ...archive,
    runId: `${archive.runId ?? 'aie2026'}+${REFRESH_ID}`,
    generatedAt: archive.generatedAt,
    updatedAt: GENERATED_AT,
    refreshId: REFRESH_ID,
    refreshGeneratedAt: GENERATED_AT,
    refreshSource: {
      mode: 'incremental-human-reviewed-delta',
      baselineArchivePath: path.relative(process.cwd(), ARCHIVE_PATH),
      sidecarPath: path.relative(process.cwd(), SIDECAR_PATH),
      humanDecisionsPath: path.relative(process.cwd(), HUMAN_DECISIONS_PATH),
      orphanResolutionPath: path.relative(process.cwd(), ORPHAN_RESOLUTION_PATH),
    },
    posts: candidateRows,
    themes: adjustedThemes,
    stats: candidateStats,
    clustering: {
      ...(archive.clustering ?? {}),
      refreshMode: 'incremental-story-assignment-only',
      fullReclusterRun: false,
      storyAssignment: storyAssigned.stats,
      driftReport: {
        note: 'No global recluster was run. New/recovered relevant rows were assigned into the existing story config; comments/replies and soft duplicates are attached context.',
        previousThemeCount: archive.themes?.length ?? 0,
        candidateThemeCount: adjustedThemes.length,
      },
    },
  };

  const publicPosts = await Promise.all(candidateRows.filter(isRelevant).map(trimPost));
  const publicStats = computeStats(publicPosts);
  const publicCandidate = {
    eventId: candidateArchive.eventId,
    eventName: candidateArchive.eventName,
    windowStart: candidateArchive.windowStart,
    windowEnd: candidateArchive.windowEnd,
    generatedAt: candidateArchive.generatedAt,
    updatedAt: candidateArchive.updatedAt,
    refreshId: REFRESH_ID,
    refreshGeneratedAt: GENERATED_AT,
    querySet: candidateArchive.querySet,
    methodology: {
      label: 'seeded digital snowball sampling plus human-reviewed delta refresh',
      sourceDateRange: (() => {
        const times = publicPosts
          .map((post: AnyRecord) => new Date(post.postedAt ?? post.capturedAt ?? 0).getTime())
          .filter((value: number) => Number.isFinite(value) && value > 0);
        return times.length ? { start: new Date(Math.min(...times)).toISOString(), end: new Date(Math.max(...times)).toISOString() } : undefined;
      })(),
      collectionWindow: { start: archive.windowStart, end: archive.windowEnd },
      querySet: archive.querySet,
      expansionQueries: archive.expansion?.querySet ?? [],
      sourceLinks: sourceLinks(archive),
      youtubeQueries: archive.youtube?.queries ?? [],
      youtubeSources: (archive.youtube?.topVideos ?? []).map((video: AnyRecord) => ({
        title: video.title,
        url: video.url,
        channel: video.channel,
        views: video.viewCount,
        comments: video.commentCount,
      })),
      limitations: [
        'The corpus is a public evidence sample, not a representative survey or full social-listening panel.',
        'This refresh is incremental: no full global recluster was run.',
        'Net-new parent posts are assigned into the existing AIE Singapore story space; comments, replies, side-event texture, multiplier effects, and soft duplicates are attached as context unless promoted by review.',
        'LinkedIn nested raw comments are not exposed in the public bundle and are not counted as additional top-level comments.',
        'X and YouTube expose public views; LinkedIn public collection here does not expose impressions.',
      ],
    },
    stats: publicStats,
    clustering: candidateArchive.clustering,
    clusterCoverage: clusterCoverage(publicPosts, adjustedThemes),
    posts: publicPosts,
    themes: adjustedThemes,
    voices: candidateArchive.voices ?? [],
  };

  const sidecarLinkedInComments = sidecar.filter((row) => row.tags?.includes('linkedin-comment'));
  const sidecarNestedComments = sidecar.filter((row) => rawCommentsCount(row) > 0);
  const sidecarNestedCommentIds = sidecarNestedComments.flatMap((row) =>
    (row.raw.comments ?? []).map((comment: AnyRecord) => String(comment.id)).filter(Boolean)
  );
  const sidecarTopLevelCommentIds = new Set(sidecarLinkedInComments.map((row) => String(row.raw?.id ?? row.linkedinCommentId ?? '')).filter(Boolean));
  const nestedOverlapIds = sidecarNestedCommentIds.filter((id) => sidecarTopLevelCommentIds.has(id));
  const candidateLinkedInComments = candidateRows.filter((row) => row.tags?.includes('linkedin-comment'));
  const unresolvedConversationRows = candidateRows.filter((row) => row.rowType !== 'parent' && !row.parentPostId && !row.rootPostId);

  const urlDuplicateGroups = Array.from(groupBy(candidateRows, (row) => row.canonicalUrl).entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      rows: group.map((row) => ({
        postId: row.postId,
        canonicalKey: row.canonicalKey,
        contentDuplicateOf: row.contentDuplicateOf,
        mergeSource: row.mergeSource,
      })),
      allowedAsSoftDuplicate: group.every((row) => row.contentDuplicateOf || group.some((candidate) => candidate.postId === row.contentDuplicateOf)),
    }));

  const metricsRows = candidateRows.filter((row) => row.mergeSource === 'sidecar');
  const metricsAudit = {
    sidecarRows: sidecar.length,
    sidecarRowsIncluded: includedSidecarRows.length,
    sidecarRowsExcluded: sidecar.length - includedSidecarRows.length,
    rowsWithMetricsUpdatedAt: metricsRows.filter((row) => Boolean(row.metricsUpdatedAt)).length,
    byPlatform: platformCounts(metricsRows),
    byStatus: metricsRows.reduce((acc, row) => {
      const key = `${row.platform}:${row.metricsRefresh?.status ?? 'missing_status'}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    unresolvedLinkedInRows: metricsRows
      .filter((row) => row.platform === 'linkedin' && row.metricsRefresh?.status !== 'updated')
      .map((row) => ({
        postId: row.postId,
        url: row.url,
        authorName: row.authorName,
        status: row.metricsRefresh?.status,
        metricsUpdatedAt: row.metricsUpdatedAt,
        metrics: row.metrics,
      })),
    recoveredParentMetrics: recoveredParentRows.map((row) => ({
      postId: row.postId,
      url: row.url,
      status: row.metricsRefresh?.status,
      metricsUpdatedAt: row.metricsUpdatedAt,
      metrics: row.metrics,
    })),
    sourceSummary: sidecarSummary.linkedinCoverage,
  };

  const parentReview = candidateRows
    .filter((row) => row.rowType === 'parent' && isRelevant(row))
    .map((parent) => {
      const attached = candidateRows.filter((row) => row.parentPostId === parent.postId || (row.rootPostId === parent.postId && row.rowType !== 'parent'));
      return {
        postId: parent.postId,
        platform: parent.platform,
        url: parent.url,
        authorName: parent.authorName,
        postedAt: parent.postedAt,
        primaryStoryId: parent.primaryStoryId,
        isClusterRoot: parent.isClusterRoot,
        metrics: parent.metrics,
        metricsUpdatedAt: parent.metricsUpdatedAt,
        metricsRefreshStatus: parent.metricsRefresh?.status,
        reportedCommentsCount: parent.metrics?.comments,
        fetchedCommentsCount: attached.length,
        attachedCommentRows: attached.map((row) => ({
          postId: row.postId,
          rowType: row.rowType,
          authorName: row.authorName,
          url: row.url,
          metrics: row.metrics,
          highSignal: metricEngagement(row.metrics) >= 10,
          text: String(row.text ?? '').slice(0, 300),
        })),
      };
    });

  const manifest = {
    refreshId: REFRESH_ID,
    generatedAt: GENERATED_AT,
    folder: path.relative(process.cwd(), REFRESH_DIR),
    input: {
      baselineArchivePath: path.relative(process.cwd(), ARCHIVE_PATH),
      baselineArchiveRows: archive.posts?.length ?? 0,
      baselinePublicPath: path.relative(process.cwd(), PUBLIC_PATH),
      baselinePublicRows: publicCurrent.posts?.length ?? 0,
      sidecarPath: path.relative(process.cwd(), SIDECAR_PATH),
      sidecarRows: sidecar.length,
      humanDecisionsPath: path.relative(process.cwd(), HUMAN_DECISIONS_PATH),
    },
    merge: {
      humanExcludedReviewRows: excludedPostIds.size,
      explicitlyExcludedSidecarRows: sidecarExcludedPostIds.size,
      conversationGuardExcludedSidecarRows: conversationGuardExcludedPostIds.size,
      totalExcludedSidecarRows,
      nonSidecarExcludedReviewRows,
      includedSidecarRows: includedSidecarRows.length,
      recoveredParentsAdded: recoveredParentRows.length,
      arithmetic: `${archive.posts?.length ?? 0} + ${sidecar.length} - ${totalExcludedSidecarRows} + ${recoveredParentRows.length} = ${candidateRows.length}`,
    },
    output: {
      candidateArchiveRows: candidateRows.length,
      candidatePublicRows: publicPosts.length,
      candidatePublicMediaAssets: publicPosts.reduce((count: number, post: AnyRecord) => count + (Array.isArray(post.media) ? post.media.length : 0), 0),
      candidatePublicMediaAssetsInPublicPrefix: publicPosts.reduce(
        (count: number, post: AnyRecord) =>
          count + (Array.isArray(post.media) ? post.media.filter((item: AnyRecord) => String(item.path ?? '').startsWith(PUBLIC_MEDIA_PREFIX)).length : 0),
        0
      ),
      candidateThemeCount: adjustedThemes.length,
      platformCounts: platformCounts(candidateRows),
      rowTypeCounts: rowTypeCounts(candidateRows),
      relevantRowTypeCounts: rowTypeCounts(candidateRows.filter(isRelevant)),
    },
    checksums: {},
  };

  writeJson('archive.candidate.json', candidateArchive);
  writeJson('public.candidate.json', publicCandidate);
  fs.copyFileSync(path.join(REFRESH_DIR, 'public.candidate.json'), path.join(REFRESH_DIR, `public.${REFRESH_ID}.json`));
  fs.copyFileSync(PUBLIC_PATH, path.join(REFRESH_DIR, `public.backup.${REFRESH_ID}.json`));

  const checksums = {
    baselineArchive: sha256(ARCHIVE_PATH),
    baselinePublic: sha256(PUBLIC_PATH),
    sidecar: sha256(SIDECAR_PATH),
    archiveCandidate: sha256(path.join(REFRESH_DIR, 'archive.candidate.json')),
    publicCandidate: sha256(path.join(REFRESH_DIR, 'public.candidate.json')),
    publicVersioned: sha256(path.join(REFRESH_DIR, `public.${REFRESH_ID}.json`)),
    publicBackup: sha256(path.join(REFRESH_DIR, `public.backup.${REFRESH_ID}.json`)),
  };
  manifest.checksums = checksums;

  const mergeAudit = {
    generatedAt: GENERATED_AT,
    refreshId: REFRESH_ID,
    baselineArchiveRows: archive.posts?.length ?? 0,
    sidecarRows: sidecar.length,
    includedSidecarRows: includedSidecarRows.length,
    excludedSidecarRows: Array.from(sidecarExcludedPostIds),
    conversationGuardExcludedSidecarRows: conversationGuardRejects.map(({ row, reason }) => ({
      postId: row.postId,
      url: row.url,
      authorHandle: row.authorHandle,
      reason,
      parentTag: (row.tags ?? []).find((tag: string) => String(tag).startsWith('parent:')),
      conversationId: xConversationId(row),
      text: String(row.text ?? '').slice(0, 300),
      metrics: row.metrics,
    })),
    humanExcludedReviewRows: Array.from(excludedPostIds),
    nonSidecarExcludedReviewRows,
    recoveredParentsAdded: recoveredParentRows.map((row) => ({
      postId: row.postId,
      canonicalKey: row.canonicalKey,
      url: row.url,
      sourceFile: orphanResolution.parentResolution.find((item: AnyRecord) => item.parent.postId === row.postId)?.parent.sourceFile,
    })),
    candidateRows: candidateRows.length,
    arithmetic: manifest.merge.arithmetic,
    sidecarAccounting: {
      included: includedSidecarRows.length,
      excludedByHumanReview: sidecarExcludedPostIds.size,
      excludedByConversationGuard: conversationGuardExcludedPostIds.size,
      total: includedSidecarRows.length + sidecarExcludedPostIds.size + conversationGuardExcludedPostIds.size,
      expected: sidecar.length,
      allAccountedFor: includedSidecarRows.length + sidecarExcludedPostIds.size + conversationGuardExcludedPostIds.size === sidecar.length,
    },
    recoveredParentHash: hashValue(recoveredParentRows.map((row) => row.canonicalKey)),
  };

  const dedupeAudit = {
    generatedAt: GENERATED_AT,
    refreshId: REFRESH_ID,
    nativeDuplicateCount: nativeDuplicateGroups.length,
    nativeDuplicateGroups,
    canonicalUrlDuplicateCount: urlDuplicateGroups.length,
    canonicalUrlDuplicateGroups: urlDuplicateGroups,
    softDuplicateGroupCount: softGroups.length,
    softDuplicateGroups: softGroups.map((group) => ({
      ...group,
      rows: group.rows.map((postId: string) => {
        const row = candidateRows.find((candidate) => candidate.postId === postId);
        return {
          postId,
          url: row?.url,
          authorName: row?.authorName,
          postedAt: row?.postedAt,
          contentDuplicateOf: row?.contentDuplicateOf,
        };
      }),
    })),
    treatment: 'Soft duplicates are retained, marked with contentDuplicateOf, tagged content-duplicate/context:event, and prevented from root rollups.',
  };

  const conversationAudit = {
    generatedAt: GENERATED_AT,
    refreshId: REFRESH_ID,
    sidecarConversationRows: sidecar.filter((row) => inferRowType(row) !== 'parent').length,
    candidateConversationRows: candidateRows.filter((row) => row.rowType !== 'parent').length,
    conversationGuardExcludedRows: conversationGuardRejects.map(({ row, reason }) => ({
      postId: row.postId,
      platform: row.platform,
      rowType: inferRowType(row),
      url: row.url,
      authorHandle: row.authorHandle,
      parentTag: (row.tags ?? []).find((tag: string) => String(tag).startsWith('parent:')),
      reason,
      text: String(row.text ?? '').slice(0, 300),
    })),
    unresolvedConversationRows: unresolvedConversationRows.map((row) => ({
      postId: row.postId,
      platform: row.platform,
      rowType: row.rowType,
      url: row.url,
      parentNativeKey: row.parentNativeKey,
    })),
    linkedIn: {
      sidecarSeparateCanonicalCommentRows: sidecarLinkedInComments.length,
      candidateSeparateCanonicalCommentRows: candidateLinkedInComments.length,
      excludedLinkedInCommentRows: Array.from(excludedPostIds).filter((postId) => sidecarLinkedInComments.some((row) => row.postId === postId)).length,
      parentRowsWithNestedRawCommentsInSidecar: sidecarNestedComments.length,
      nestedRawCommentTotalInSidecar: sidecarNestedCommentIds.length,
      nestedOverlapWithSeparateRows: new Set(nestedOverlapIds).size,
      candidateRowsWithRawCommentsArray: candidateRows.filter((row) => Array.isArray(row.raw?.comments)).length,
      candidateRowsWithRawCommentsProvenanceOnly: candidateRows.filter((row) => row.rawCommentsProvenanceOnly).length,
    },
    orphanResolution: orphanResolution.summary,
    parentReview,
    highSignalComments: parentReview.flatMap((parent) =>
      parent.attachedCommentRows
        .filter((comment: AnyRecord) => comment.highSignal)
        .map((comment: AnyRecord) => ({ parentPostId: parent.postId, parentUrl: parent.url, ...comment }))
    ),
  };

  const validation = {
    generatedAt: GENERATED_AT,
    refreshId: REFRESH_ID,
    checks: {
      noDuplicateNativePlatformKeys: nativeDuplicateGroups.length === 0,
      sidecarRowsAccountedFor: mergeAudit.sidecarAccounting.allAccountedFor,
      candidateCountArithmeticMatches: candidateRows.length === (archive.posts?.length ?? 0) + sidecar.length - totalExcludedSidecarRows + recoveredParentRows.length,
      linkedInNestedOverlapDetected143: new Set(nestedOverlapIds).size === 143,
      linkedInNestedCommentsNotRawCommentsArrayInCandidate: conversationAudit.linkedIn.candidateRowsWithRawCommentsArray === 0,
      commentRowsHaveParentOrRoot: unresolvedConversationRows.length === 0,
      noCommentReplyInThemeRootPostIds: adjustedThemes.every((theme: AnyRecord) =>
        (theme.rootPostIds ?? []).every((postId: string) => candidateRows.find((row) => row.postId === postId)?.rowType === 'parent')
      ),
      sidecarRowsRetainMetricsUpdatedAt: metricsRows.every((row) => Boolean(row.metricsUpdatedAt)),
      linkedInThreeMissesRemainNotFound: metricsAudit.unresolvedLinkedInRows.length === 3,
      publicBundleOmitsRaw: !JSON.stringify(publicCandidate).includes('"raw"'),
    },
  };

  writeJson('manifest.json', manifest);
  writeJson('merge-audit.json', mergeAudit);
  writeJson('dedupe-audit.json', dedupeAudit);
  writeJson('metrics-audit.json', metricsAudit);
  writeJson('conversation-audit.json', conversationAudit);
  writeJson('validation-audit.json', validation);
  writeRollbackNotes(manifest);

  console.log(JSON.stringify({
    refreshId: REFRESH_ID,
    folder: path.relative(process.cwd(), REFRESH_DIR),
    candidateRows: candidateRows.length,
    publicRows: publicPosts.length,
    validations: validation.checks,
  }, null, 2));
}

void main();
