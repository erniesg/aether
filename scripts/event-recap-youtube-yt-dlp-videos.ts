import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { enrichPostConversationTags } from '../lib/research/event-recap/conversation';
import type { EventPlatform, EventPost, EventPostMedia } from '../lib/research/event-recap/types';
import { makePostId } from '../lib/research/event-recap/utils';

const ARCHIVE_PATH = 'outputs/event-recap-ai-engineer-singapore/archive.json';
const MEDIA_DIR = 'outputs/event-recap-ai-engineer-singapore/media/youtube';
const RUN_ID = `event_recap_youtube_yt_dlp_videos_${Date.now()}`;
const execFileAsync = promisify(execFile);

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
    const id = youtubeVideoId(url);
    if (!id) return undefined;
    const commentId = parsed.searchParams.get('lc');
    if (commentId) return `https://www.youtube.com/watch?v=${id}&lc=${commentId}`;
    if (parsed.hash.startsWith('#live-chat-')) return `https://www.youtube.com/watch?v=${id}${parsed.hash}`;
    return `https://www.youtube.com/watch?v=${id}`;
  } catch {
    return undefined;
  }
}

function youtubeVideoId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (/(^|\.)youtu\.be$/i.test(parsed.hostname)) return parsed.pathname.split('/').filter(Boolean)[0];
    if (/(^|\.)youtube\.com$/i.test(parsed.hostname)) return parsed.searchParams.get('v') ?? undefined;
  } catch {
    if (/^[A-Za-z0-9_-]{11}$/.test(url)) return url;
  }
  return undefined;
}

async function fetchVideo(id: string) {
  const url = `https://www.youtube.com/watch?v=${id}`;
  const { stdout } = await execFileAsync('yt-dlp', ['--skip-download', '--dump-single-json', url], {
    maxBuffer: 80 * 1024 * 1024,
  });
  return JSON.parse(stdout || '{}') as Record<string, any>;
}

async function downloadThumbnail(video: Record<string, any>, id: string): Promise<EventPostMedia | undefined> {
  const thumbnail = bestThumbnail(video);
  if (!thumbnail?.url) return undefined;
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const response = await fetch(thumbnail.url);
  if (!response.ok) return undefined;
  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = crypto.createHash('sha1').update(thumbnail.url).digest('hex').slice(0, 8);
  const contentType = response.headers.get('content-type') ?? undefined;
  const ext = extensionFromContentType(contentType) ?? extensionFromUrl(thumbnail.url) ?? 'jpg';
  const localPath = path.resolve(MEDIA_DIR, `${id}-${hash}.${ext}`);
  fs.writeFileSync(localPath, bytes);
  return {
    url: thumbnail.url,
    type: 'image',
    source: 'youtube-thumbnail',
    altText: video.title ? `Video thumbnail: ${video.title}` : undefined,
    width: thumbnail.width,
    height: thumbnail.height,
    localPath,
    contentType,
    bytes: bytes.length,
    downloadedAt: Date.now(),
  };
}

function bestThumbnail(video: Record<string, any>): { url?: string; width?: number; height?: number } | undefined {
  const thumbnails = Array.isArray(video.thumbnails) ? video.thumbnails : [];
  return thumbnails
    .filter((item: Record<string, any>) => item?.url)
    .sort((a: Record<string, any>, b: Record<string, any>) => (b.width ?? 0) - (a.width ?? 0))[0];
}

function extensionFromContentType(contentType?: string): string | undefined {
  if (!contentType) return undefined;
  if (contentType.includes('jpeg')) return 'jpg';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  return undefined;
}

function extensionFromUrl(url: string): string | undefined {
  const match = url.match(/\.([a-z0-9]{3,4})(?:[?#]|$)/i);
  return match?.[1]?.toLowerCase();
}

function postedAt(video: Record<string, any>): string | undefined {
  if (typeof video.timestamp === 'number') return new Date(video.timestamp * 1000).toISOString();
  const raw = String(video.upload_date ?? '');
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return undefined;
  return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`).toISOString();
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

async function materializeVideo(eventId: string, id: string): Promise<EventPost> {
  const video = await fetchVideo(id);
  const url = String(video.webpage_url ?? `https://www.youtube.com/watch?v=${id}`);
  const title = String(video.title ?? 'YouTube video');
  const description = String(video.description ?? '').trim();
  const text = [title, description].filter(Boolean).join('\n\n');
  const media = await downloadThumbnail(video, id);
  return enrichPostConversationTags({
    postId: makePostId('youtube', url, text),
    eventId,
    runId: RUN_ID,
    platform: 'youtube',
    url,
    authorName: String(video.channel ?? video.uploader ?? 'YouTube'),
    authorHandle: video.uploader_id,
    authorUrl: video.channel_url ?? video.uploader_url,
    authorMeta: {
      followers: numberValue(video.channel_follower_count),
      profileImageUrl: video.channel?.avatar,
    },
    text,
    postedAt: postedAt(video),
    capturedAt: Date.now(),
    updatedAt: Date.now(),
    metrics: {
      views: numberValue(video.view_count),
      impressions: numberValue(video.view_count),
      likes: numberValue(video.like_count),
      comments: numberValue(video.comment_count),
    },
    media: media ? [media] : undefined,
    reachScore: 0,
    tags: [
      'youtube-video',
      'youtube-yt-dlp-search',
      'event-recap',
      'recap-artifact',
      'relevant:event',
    ],
    raw: video,
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
    byUrl.set(key, {
      ...previous,
      ...post,
      postId: previous.postId,
      capturedAt: previous.capturedAt,
      media: mergeMedia(previous.media, post.media),
      tags: Array.from(new Set([...(previous.tags ?? []), ...(post.tags ?? [])])),
      raw: { previous: previous.raw, enrichment: post.raw },
    });
    updated += 1;
  }
  return { posts: Array.from(byUrl.values()), added, updated };
}

function mergeMedia(previous: EventPost['media'], incoming: EventPost['media']): EventPostMedia[] | undefined {
  const byUrl = new Map<string, EventPostMedia>();
  for (const item of previous ?? []) byUrl.set(item.url, item);
  for (const item of incoming ?? []) {
    const existing = byUrl.get(item.url);
    byUrl.set(item.url, existing ? { ...item, ...existing, localPath: existing.localPath ?? item.localPath } : item);
  }
  const media = Array.from(byUrl.values());
  return media.length ? media : undefined;
}

function upsertTopVideos(archive: Record<string, any>, posts: EventPost[]) {
  const current = Array.isArray(archive.youtube?.topVideos) ? archive.youtube.topVideos : [];
  const byId = new Map<string, Record<string, any>>();
  for (const video of current) {
    const id = String(video.id ?? youtubeVideoId(String(video.url ?? '')) ?? '');
    if (id) byId.set(id, video);
  }
  for (const post of posts) {
    const id = youtubeVideoId(post.url);
    if (!id) continue;
    const raw = (post.raw ?? {}) as Record<string, any>;
    byId.set(id, {
      ...(byId.get(id) ?? {}),
      id,
      url: post.url,
      title: post.text.split('\n')[0],
      channel: post.authorName,
      channelId: raw.channel_id,
      uploaderId: post.authorHandle,
      uploaderUrl: post.authorUrl,
      viewCount: post.metrics?.views,
      likeCount: post.metrics?.likes,
      commentCount: post.metrics?.comments,
      duration: raw.duration,
      durationString: raw.duration_string,
      liveStatus: raw.live_status,
      wasLive: raw.was_live,
      thumbnailLocalPath: post.media?.[0]?.localPath,
      searchQueries: ['AI Engineer Singapore hackathon', 'AIE Hackathon Singapore'],
      relevance: {
        score: 8,
        relevant: true,
        reasons: ['event-name', 'event-context'],
      },
    });
  }
  archive.youtube = {
    ...(archive.youtube ?? {}),
    source: archive.youtube?.source ?? 'yt-dlp public YouTube search',
    queries: Array.from(
      new Set([
        ...(archive.youtube?.queries ?? []),
        'AI Engineer Singapore hackathon',
        'AIE Hackathon Singapore',
        'AI Engineer Hackathon Singapore',
      ])
    ),
    topVideos: Array.from(byId.values()),
  };
}

async function main() {
  const ids = (process.env.EVENT_RECAP_YOUTUBE_VIDEO_IDS ?? 'FT8VIQO801s,OLVyi1OI1VY')
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8')) as Record<string, any>;
  const posts: EventPost[] = [];
  const errors: Array<{ id: string; error: string }> = [];
  for (const id of ids) {
    try {
      posts.push(await materializeVideo(String(archive.eventId), id));
    } catch (err) {
      errors.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const merged = mergePosts((archive.posts ?? []) as EventPost[], posts);
  upsertTopVideos(archive, posts);
  const generatedAt = new Date().toISOString();
  const backupPath = `${ARCHIVE_PATH}.bak-youtube-yt-dlp-${Date.now()}`;
  fs.copyFileSync(ARCHIVE_PATH, backupPath);
  archive.posts = merged.posts;
  archive.updatedAt = generatedAt;
  archive.enrichment = [
    ...(archive.enrichment ?? []),
    {
      mode: 'youtube-yt-dlp-video-discovery',
      generatedAt,
      runId: RUN_ID,
      requested: ids.length,
      materialized: posts.length,
      added: merged.added,
      updated: merged.updated,
      errors,
    },
  ];
  fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2));
  const outPath = `outputs/event-recap-ai-engineer-singapore/${RUN_ID}.json`;
  const output = {
    generatedAt,
    runId: RUN_ID,
    archivePath: ARCHIVE_PATH,
    backupPath,
    requested: ids.length,
    materialized: posts.length,
    added: merged.added,
    updated: merged.updated,
    errors,
    posts: posts.map((post) => ({
      url: post.url,
      title: post.text.split('\n')[0],
      author: post.authorName,
      metrics: post.metrics,
      media: post.media?.length ?? 0,
    })),
  };
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
