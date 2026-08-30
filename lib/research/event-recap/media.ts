import type { EventPlatform, EventPost } from './types';

type EventPostMedia = NonNullable<EventPost['media']>[number];

export type EventMediaUrlTarget = 'poster' | 'playback';

export interface EventMediaTile {
  key: string;
  posterUrl?: string;
  playbackUrl?: string;
  embedUrl?: string;
  postUrl: string;
  sourceUrl: string;
  alt: string;
  platform: EventPlatform;
  postId: string;
  type: EventPostMedia['type'];
  reachScore: number;
  refCount: number;
}

export function buildEventMediaTiles(
  posts: EventPost[],
  options: {
    resolveMediaUrl?: (
      post: EventPost,
      media: EventPostMedia,
      target: EventMediaUrlTarget
    ) => string | undefined;
  } = {}
): EventMediaTile[] {
  const groups = new Map<string, { tile: EventMediaTile; postIds: Set<string> }>();

  for (const post of posts) {
    for (const media of post.media ?? []) {
      const tile = eventMediaTile(post, media, options.resolveMediaUrl);
      if (!tile) continue;
      const existing = groups.get(tile.key);
      if (!existing) {
        groups.set(tile.key, { tile, postIds: new Set([post.postId]) });
        continue;
      }

      existing.postIds.add(post.postId);
      if (tile.reachScore > existing.tile.reachScore) {
        existing.tile = { ...tile, refCount: existing.postIds.size };
      }
    }
  }

  return Array.from(groups.values())
    .map((group) => ({ ...group.tile, refCount: group.postIds.size }))
    .sort((a, b) => b.reachScore - a.reachScore);
}

export function canonicalMediaKey(post: EventPost, media: EventPostMedia): string {
  const youtubeId = post.platform === 'youtube' ? youtubeVideoId(post.url) : undefined;
  if (youtubeId) return `youtube:${youtubeId}`;

  const xVideoId = [
    media.url,
    media.previewUrl,
    ...(media.variants ?? []).map((variant) => variant.url),
  ]
    .map(xVideoMediaId)
    .find(Boolean);
  if (xVideoId) return `x-video:${xVideoId}`;

  if (isVideoMedia(media) && media.localPath) return normalizeMediaIdentity(media.localPath);
  return normalizeMediaIdentity(media.previewUrl ?? media.url ?? media.localPath ?? '');
}

export function youtubeEmbedUrl(value: string): string | undefined {
  const id = youtubeVideoId(value);
  return id ? `https://www.youtube.com/embed/${id}` : undefined;
}

export function isVideoMedia(media: EventPostMedia): boolean {
  if (media.type === 'video') return true;
  if (media.contentType?.startsWith('video/')) return true;
  return isVideoUrl(media.url) || isVideoUrl(media.localPath);
}

function eventMediaTile(
  post: EventPost,
  media: EventPostMedia,
  resolveMediaUrl?: (
    post: EventPost,
    media: EventPostMedia,
    target: EventMediaUrlTarget
  ) => string | undefined
): EventMediaTile | null {
  const embedUrl = post.platform === 'youtube' ? youtubeEmbedUrl(post.url) : undefined;
  const video = isVideoMedia(media);
  const posterUrl = resolveMediaUrl?.(post, media, 'poster') ?? defaultPosterUrl(media);
  const playbackUrl = video
    ? resolveMediaUrl?.(post, media, 'playback') ?? defaultPlaybackUrl(media)
    : undefined;

  if (!posterUrl && !playbackUrl && !embedUrl) return null;
  if (!video && !embedUrl && !isImageLikeMedia(media)) return null;

  const key = canonicalMediaKey(post, media);
  if (!key) return null;

  return {
    key,
    posterUrl,
    playbackUrl,
    embedUrl,
    postUrl: post.url,
    sourceUrl: media.pageUrl ?? media.url,
    alt: media.altText ?? post.authorHandle ?? post.authorName,
    platform: post.platform,
    postId: post.postId,
    type: video || embedUrl ? 'video' : media.type,
    reachScore: post.reachScore,
    refCount: 1,
  };
}

function defaultPosterUrl(media: EventPostMedia): string | undefined {
  if (media.previewUrl) return media.previewUrl;
  if (isImageLikeMedia(media)) return media.url;
  return undefined;
}

function defaultPlaybackUrl(media: EventPostMedia): string | undefined {
  return isVideoUrl(media.url) || media.contentType?.startsWith('video/') ? media.url : undefined;
}

function isImageLikeMedia(media: EventPostMedia): boolean {
  if (media.type === 'image' || media.type === 'gif') return true;
  if (media.contentType?.startsWith('image/')) return true;
  return isImageUrl(media.url) || media.url.includes('pbs.twimg.com') || media.url.includes('i.ytimg.com');
}

function isImageUrl(value?: string): boolean {
  return /\.(png|jpe?g|webp|gif|avif)(?:$|\?)/i.test(value ?? '');
}

function isVideoUrl(value?: string): boolean {
  return /\.(mp4|mov|webm|m4v)(?:$|\?)/i.test(value ?? '');
}

function xVideoMediaId(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!host.includes('video.twimg.com') && !host.includes('pbs.twimg.com')) return undefined;
    const match = url.pathname.match(
      /\/(?:amplify_video|amplify_video_thumb|ext_tw_video|ext_tw_video_thumb|tweet_video|tweet_video_thumb)\/([^/]+)\//
    );
    return match?.[1];
  } catch {
    return undefined;
  }
}

function youtubeVideoId(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return cleanYoutubeId(url.pathname.slice(1));
    if (!host.endsWith('youtube.com')) return undefined;
    if (url.pathname === '/watch') return cleanYoutubeId(url.searchParams.get('v') ?? '');
    const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);
    return cleanYoutubeId(match?.[1] ?? '');
  } catch {
    return undefined;
  }
}

function cleanYoutubeId(value: string): string | undefined {
  const id = value.trim();
  return /^[a-zA-Z0-9_-]{6,}$/.test(id) ? id : undefined;
}

function normalizeMediaIdentity(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    url.hash = '';
    url.search = '';
    if (url.hostname.includes('media.licdn.com')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const versionIndex = parts.indexOf('v2');
      const assetId = versionIndex >= 0 ? parts[versionIndex + 1] : undefined;
      if (assetId) return `${url.hostname.toLowerCase()}/${assetId}`;
    }
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return trimmed.split('#')[0].split('?')[0].toLowerCase();
  }
}
