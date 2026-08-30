import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { enrichPostConversationTags } from '../lib/research/event-recap/conversation';
import type { EventPlatform, EventPost, EventPostMedia } from '../lib/research/event-recap/types';
import { searchYouTubeVideos } from '../lib/research/event-recap/youtube';

const ARCHIVE_PATH = 'outputs/event-recap-ai-engineer-singapore/archive.json';
const RUN_ID = `event_recap_youtube_comments_${Date.now()}`;
const execFileAsync = promisify(execFile);

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

function materialize(
  eventId: string,
  posts: Array<Omit<EventPost, 'eventId' | 'runId' | 'capturedAt' | 'updatedAt' | 'reachScore'>>,
  sourceTag: string
): EventPost[] {
  const now = Date.now();
  return posts.map((post) => {
    const tags = new Set(post.tags ?? []);
    tags.add('relevant:event');
    tags.add(sourceTag);
    if ((post.tags ?? []).includes('youtube-video')) tags.add('recap-artifact');
    return enrichPostConversationTags({
      ...post,
      eventId,
      runId: RUN_ID,
      capturedAt: now,
      updatedAt: now,
      reachScore: 0,
      tags: Array.from(tags),
    });
  });
}

async function fetchYouTubeRefs(archive: Record<string, any>, urls: string[]) {
  if (process.env.YOUTUBE_API_KEY?.trim() || process.env.YOUTUBE_DATA_API_KEY?.trim()) {
    const result = await searchYouTubeVideos({
      querySet: urls,
      windowStart: archive.windowStart,
      windowEnd: archive.windowEnd,
      maxItems: urls.length,
      maxQueries: urls.length,
      includeComments: true,
      includeMedia: true,
      maxCommentVideos: urls.length,
      maxCommentsPerVideo: numberEnv('EVENT_RECAP_YOUTUBE_MAX_COMMENTS_PER_VIDEO', 100, 0, 100),
      maxLiveChatMessagesPerVideo: numberEnv('EVENT_RECAP_YOUTUBE_MAX_LIVE_CHAT_PER_VIDEO', 100, 0, 200),
    });
    return {
      mode: 'youtube-data-api',
      posts: result.posts as Array<Omit<EventPost, 'eventId' | 'runId' | 'capturedAt' | 'updatedAt' | 'reachScore'>>,
      warnings: result.warnings,
      raw: result.raw,
    };
  }

  const videos = (archive.youtube?.topVideos ?? []).filter((video: Record<string, unknown>) =>
    urls.includes(String(video.url ?? ''))
  );
  const comments: Array<Omit<EventPost, 'eventId' | 'runId' | 'capturedAt' | 'updatedAt' | 'reachScore'>> = [];
  const warnings: string[] = [
    'YouTube Data API key is not configured; comments were fetched with yt-dlp --write-comments instead.',
  ];
  const raw: Array<Record<string, unknown>> = [];
  for (const video of videos) {
    const url = String(video.url ?? '');
    const id = String(video.id ?? youtubeVideoId(url) ?? '');
    if (!url || !id) continue;
    try {
      const { stdout, stderr } = await execFileAsync(
        'yt-dlp',
        ['--skip-download', '--write-comments', '--dump-single-json', url],
        { maxBuffer: 80 * 1024 * 1024 }
      );
      const json = JSON.parse(stdout || '{}') as Record<string, any>;
      const videoComments = Array.isArray(json.comments) ? json.comments : [];
      raw.push({
        videoId: id,
        url,
        commentCount: json.comment_count,
        commentsFetched: videoComments.length,
        stderr: stderr?.trim() ? stderr.trim().slice(0, 500) : undefined,
      });
      for (const comment of videoComments) {
        const post = youtubeCommentFromYtDlp(comment, video, id, url);
        if (post) comments.push(post);
      }
    } catch (err) {
      warnings.push(
        `yt-dlp comments were not available for ${url}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    mode: 'yt-dlp-comments',
    posts: comments,
    warnings,
    raw,
  };
}

function youtubeCommentFromYtDlp(
  comment: Record<string, any>,
  video: Record<string, unknown>,
  videoId: string,
  videoUrl: string
): Omit<EventPost, 'eventId' | 'runId' | 'capturedAt' | 'updatedAt' | 'reachScore'> | null {
  const id = String(comment.id ?? '').trim();
  const text = String(comment.text ?? '').trim();
  if (!id || !text) return null;
  const author = String(comment.author ?? comment.author_id ?? 'unknown').trim();
  const authorUrl = String(comment.author_url ?? '').trim() || undefined;
  const postedAt =
    typeof comment.timestamp === 'number' && Number.isFinite(comment.timestamp)
      ? new Date(comment.timestamp * 1000).toISOString()
      : undefined;
  return {
    postId: `youtube:${videoId}:comment:${id}`,
    platform: 'youtube',
    url: `${videoUrl}&lc=${encodeURIComponent(id)}`,
    authorName: author,
    authorHandle: author.startsWith('@') ? author : undefined,
    authorUrl,
    authorMeta: {
      profileImageUrl: typeof comment.author_thumbnail === 'string' ? comment.author_thumbnail : undefined,
    },
    text,
    postedAt,
    metrics: {
      likes: numberValue(comment.like_count),
      replies: numberValue(comment.reply_count),
      comments: numberValue(comment.reply_count),
    },
    tags: [
      'youtube-comment',
      'comment',
      'conversation',
      'youtube-video-reaction',
      'youtube-yt-dlp-comments',
      `parent-video:${videoId}`,
    ],
    raw: {
      comment,
      parentVideo: video,
    },
  };
}

function youtubeVideoId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (/(^|\.)youtu\.be$/i.test(parsed.hostname)) return parsed.pathname.split('/').filter(Boolean)[0];
    if (/(^|\.)youtube\.com$/i.test(parsed.hostname)) return parsed.searchParams.get('v') ?? undefined;
  } catch {
    return undefined;
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
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
  const byUrl = new Map<string, EventPostMedia>();
  for (const item of previous ?? []) byUrl.set(item.url, item);
  for (const item of incoming ?? []) {
    const existing = byUrl.get(item.url);
    byUrl.set(item.url, existing ? { ...item, ...existing, localPath: existing.localPath ?? item.localPath } : item);
  }
  return Array.from(byUrl.values());
}

function numberEnv(name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const raw = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.round(raw)));
}

async function main() {
  loadEnvLocal();
  const archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8')) as Record<string, any>;
  const urls: string[] = Array.from(
    new Set<string>(
      (archive.youtube?.topVideos ?? [])
        .map((video: Record<string, unknown>) => String(video.url ?? ''))
        .filter(Boolean)
    )
  );
  if (!urls.length) throw new Error('No YouTube topVideos URLs found in archive.youtube');

  const result = await fetchYouTubeRefs(archive, urls);

  const materialized = materialize(
    String(archive.eventId),
    result.posts as any,
    result.mode === 'youtube-data-api' ? 'youtube-data-api-direct' : 'youtube-yt-dlp-direct'
  );
  const videoCount = materialized.filter((post) => (post.tags ?? []).includes('youtube-video')).length;
  const commentCount = materialized.filter((post) => (post.tags ?? []).includes('youtube-comment')).length;
  const liveChatCount = materialized.filter((post) => (post.tags ?? []).includes('youtube-live-chat')).length;
  const merged = mergePosts((archive.posts ?? []) as EventPost[], materialized);
  const generatedAt = new Date().toISOString();
  const backupPath = `${ARCHIVE_PATH}.bak-youtube-comments-${Date.now()}`;
  fs.copyFileSync(ARCHIVE_PATH, backupPath);
  archive.posts = merged.posts;
  archive.updatedAt = generatedAt;
  archive.enrichment = [
    ...(archive.enrichment ?? []),
    {
      mode: 'youtube-data-api-comments',
      generatedAt,
      runId: RUN_ID,
      videosRequested: urls.length,
      videosMaterialized: videoCount,
      commentsMaterialized: commentCount,
      liveChatMaterialized: liveChatCount,
      added: merged.added,
      updated: merged.updated,
      source: result.mode,
      warnings: result.warnings,
    },
  ];
  fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2));

  const outPath = `outputs/event-recap-ai-engineer-singapore/${RUN_ID}.json`;
  const output = {
    generatedAt,
    runId: RUN_ID,
    archivePath: ARCHIVE_PATH,
    backupPath,
    videosRequested: urls.length,
    videosMaterialized: videoCount,
    commentsMaterialized: commentCount,
    liveChatMaterialized: liveChatCount,
    added: merged.added,
    updated: merged.updated,
    source: result.mode,
    warnings: result.warnings,
    raw: result.raw,
  };
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
