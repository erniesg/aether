import type { EventAuthorMeta, EventPostMedia, PlatformScrapeResult } from './types';
import { makePostId, normalizeQuerySet } from './utils';

type YouTubeEnv = Partial<Record<string, string | undefined>>;
type Fetcher = typeof fetch;

const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';
const CHANNELS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/channels';

interface YouTubeSearchInput {
  querySet: string[];
  windowStart?: string;
  windowEnd?: string;
  maxItems: number;
  maxQueries?: number;
  seenPostUrls?: string[];
  includeMedia?: boolean;
}

interface YouTubeCountInput {
  querySet: string[];
  windowStart?: string;
  windowEnd?: string;
  maxQueries?: number;
}

interface YouTubeSearchResponse {
  pageInfo?: {
    totalResults?: number;
    resultsPerPage?: number;
  };
  items?: YouTubeSearchItem[];
}

interface YouTubeSearchItem {
  id?: {
    videoId?: string;
  };
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
  };
}

interface YouTubeVideosResponse {
  items?: YouTubeVideo[];
}

interface YouTubeVideo {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: unknown;
    tags?: string[];
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: {
    duration?: string;
  };
}

interface YouTubeChannelsResponse {
  items?: YouTubeChannel[];
}

interface YouTubeChannel {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    thumbnails?: unknown;
  };
  statistics?: {
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
    videoCount?: string;
    viewCount?: string;
  };
}

export function isYouTubeConfigured(env: YouTubeEnv = process.env): boolean {
  return Boolean(youtubeApiKey(env));
}

export async function searchYouTubeVideos(
  input: YouTubeSearchInput,
  env: YouTubeEnv = process.env,
  fetcher: Fetcher = fetch
): Promise<PlatformScrapeResult> {
  const apiKey = youtubeApiKey(env);
  if (!apiKey) {
    return {
      platform: 'youtube',
      posts: [],
      warnings: ['YouTube API key is not configured; set YOUTUBE_API_KEY or YOUTUBE_DATA_API_KEY.'],
      raw: { configured: false },
    };
  }

  const queries = normalizeQuerySet(input.querySet, input.maxQueries ?? 12);
  const maxItems = Math.max(1, Math.min(1000, Math.round(input.maxItems)));
  const seen = new Set((input.seenPostUrls ?? []).map(youtubePostUrlKey));
  const videoQueries = new Map<string, string>();
  const searchRaw: Array<{ query: string; totalResults?: number; ids: string[] }> = [];
  let skippedSeen = 0;

  for (const query of queries) {
    if (videoQueries.size >= maxItems) break;
    const directId = youtubeVideoId(query);
    if (directId) {
      const key = youtubeVideoKey(directId);
      if (seen.has(key)) {
        skippedSeen += 1;
      } else {
        videoQueries.set(directId, query);
      }
      searchRaw.push({ query, ids: [directId] });
      continue;
    }

    const json = await fetchYouTubeJson<YouTubeSearchResponse>(
      SEARCH_ENDPOINT,
      {
        part: 'snippet',
        type: 'video',
        q: query,
        maxResults: String(Math.min(50, Math.max(1, maxItems - videoQueries.size))),
        order: 'relevance',
        ...(isoForYouTube(input.windowStart) ? { publishedAfter: isoForYouTube(input.windowStart) } : {}),
        ...(isoForYouTube(input.windowEnd) ? { publishedBefore: isoForYouTube(input.windowEnd) } : {}),
        key: apiKey,
      },
      fetcher
    );
    const ids: string[] = [];
    for (const item of json.items ?? []) {
      const id = item.id?.videoId?.trim();
      if (!id) continue;
      ids.push(id);
      if (seen.has(youtubeVideoKey(id))) {
        skippedSeen += 1;
        continue;
      }
      if (!videoQueries.has(id)) videoQueries.set(id, query);
      if (videoQueries.size >= maxItems) break;
    }
    searchRaw.push({
      query,
      totalResults: json.pageInfo?.totalResults,
      ids,
    });
  }

  const orderedIds = Array.from(videoQueries.keys()).slice(0, maxItems);
  const videos = await fetchYouTubeVideos(orderedIds, apiKey, fetcher);
  const channels = await fetchYouTubeChannels(
    normalizeQuerySet(
      videos.map((video) => video.snippet?.channelId ?? '').filter(Boolean),
      50
    ),
    apiKey,
    fetcher
  );
  const byChannel = new Map(channels.map((channel) => [channel.id, channel]));
  const byVideo = new Map(videos.map((video) => [video.id, video]));
  const posts = orderedIds
    .map((id) => {
      const video = byVideo.get(id);
      if (!video) return null;
      return normalizeYouTubeVideo(video, byChannel.get(video.snippet?.channelId), {
        query: videoQueries.get(id),
        includeMedia: input.includeMedia !== false,
      });
    })
    .filter((post): post is PlatformScrapeResult['posts'][number] => Boolean(post));

  return {
    platform: 'youtube',
    posts,
    warnings: [
      `YouTube Data API searched ${queries.length} queries and returned ${posts.length} videos after seen-URL dedupe.`,
      'YouTube search counts are approximate and are not deduped across queries.',
    ],
    raw: {
      mode: 'youtube-data-api',
      queries: searchRaw,
      requestedVideos: orderedIds.length,
      returnedVideos: videos.length,
      returnedChannels: channels.length,
      skippedSeen,
    },
  };
}

export async function countYouTubeQueries(
  input: YouTubeCountInput,
  env: YouTubeEnv = process.env,
  fetcher: Fetcher = fetch
) {
  const apiKey = youtubeApiKey(env);
  if (!apiKey) {
    return {
      platform: 'youtube' as const,
      mode: 'official' as const,
      status: 'not_configured' as const,
      estimates: [],
      totalLowerBound: 0,
      totalApproximate: 0,
      warnings: ['YouTube API key is not configured; set YOUTUBE_API_KEY or YOUTUBE_DATA_API_KEY.'],
    };
  }

  const queries = normalizeQuerySet(input.querySet, input.maxQueries ?? 12);
  const estimates = [];
  const sampleUrls = new Set<string>();
  for (const query of queries) {
    const directId = youtubeVideoId(query);
    if (directId) {
      const url = youtubeWatchUrl(directId);
      sampleUrls.add(url);
      estimates.push({
        source: query,
        query,
        count: 1,
        urls: [url],
        approximate: false,
      });
      continue;
    }
    const json = await fetchYouTubeJson<YouTubeSearchResponse>(
      SEARCH_ENDPOINT,
      {
        part: 'snippet',
        type: 'video',
        q: query,
        maxResults: '5',
        order: 'relevance',
        ...(isoForYouTube(input.windowStart) ? { publishedAfter: isoForYouTube(input.windowStart) } : {}),
        ...(isoForYouTube(input.windowEnd) ? { publishedBefore: isoForYouTube(input.windowEnd) } : {}),
        key: apiKey,
      },
      fetcher
    );
    const urls = (json.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id))
      .map((id) => youtubeWatchUrl(id));
    for (const url of urls) sampleUrls.add(url);
    estimates.push({
      source: query,
      query,
      count: json.pageInfo?.totalResults ?? urls.length,
      urls,
      approximate: true,
    });
  }

  return {
    platform: 'youtube' as const,
    mode: 'official' as const,
    status: 'completed' as const,
    estimates,
    totalLowerBound: sampleUrls.size,
    totalApproximate: estimates.reduce((sum, estimate) => sum + estimate.count, 0),
    urls: Array.from(sampleUrls),
    warnings: [
      'YouTube Data API pageInfo.totalResults is an approximate per-query count and is not deduped.',
      'Use totalLowerBound as the known sample floor; use totalApproximate only for budget planning.',
    ],
  };
}

export function normalizeYouTubeVideo(
  video: YouTubeVideo,
  channel?: YouTubeChannel,
  options: { query?: string; includeMedia?: boolean } = {}
): PlatformScrapeResult['posts'][number] | null {
  const id = video.id?.trim();
  const title = video.snippet?.title?.trim() ?? '';
  const description = video.snippet?.description?.trim() ?? '';
  if (!id || !title) return null;
  const url = youtubeWatchUrl(id);
  const channelId = video.snippet?.channelId?.trim() || channel?.id?.trim() || undefined;
  const handle = youtubeChannelHandle(channel);
  const text = [title, description].filter(Boolean).join('\n\n');
  return {
    postId: makePostId('youtube', url, text),
    platform: 'youtube',
    url,
    authorName:
      video.snippet?.channelTitle?.trim() ||
      channel?.snippet?.title?.trim() ||
      handle ||
      channelId ||
      'unknown',
    authorHandle: handle ?? channelId,
    authorUrl: channelId ? `https://www.youtube.com/channel/${channelId}` : undefined,
    authorMeta: authorMetaFromYouTubeChannel(channel),
    text,
    postedAt: video.snippet?.publishedAt,
    metrics: {
      views: numberFromYouTube(video.statistics?.viewCount),
      impressions: numberFromYouTube(video.statistics?.viewCount),
      likes: numberFromYouTube(video.statistics?.likeCount),
      comments: numberFromYouTube(video.statistics?.commentCount),
    },
    media: options.includeMedia === false ? undefined : mediaFromYouTubeVideo(video),
    tags: normalizeQuerySet(
      [
        'youtube-video',
        'youtube-search',
        options.query ? `query:${options.query}` : '',
        ...(video.snippet?.tags ?? []).slice(0, 8).map((tag) => `yt-tag:${tag}`),
      ],
      12
    ),
    raw: {
      video,
      channel,
      searchQuery: options.query,
    },
  };
}

async function fetchYouTubeVideos(
  ids: string[],
  apiKey: string,
  fetcher: Fetcher
): Promise<YouTubeVideo[]> {
  const out: YouTubeVideo[] = [];
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    if (!batch.length) continue;
    const json = await fetchYouTubeJson<YouTubeVideosResponse>(
      VIDEOS_ENDPOINT,
      {
        part: 'snippet,statistics,contentDetails',
        id: batch.join(','),
        key: apiKey,
      },
      fetcher
    );
    out.push(...(json.items ?? []));
  }
  return out;
}

async function fetchYouTubeChannels(
  ids: string[],
  apiKey: string,
  fetcher: Fetcher
): Promise<YouTubeChannel[]> {
  const out: YouTubeChannel[] = [];
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    if (!batch.length) continue;
    const json = await fetchYouTubeJson<YouTubeChannelsResponse>(
      CHANNELS_ENDPOINT,
      {
        part: 'snippet,statistics',
        id: batch.join(','),
        key: apiKey,
      },
      fetcher
    );
    out.push(...(json.items ?? []));
  }
  return out;
}

async function fetchYouTubeJson<T>(
  endpoint: string,
  params: Record<string, string>,
  fetcher: Fetcher
): Promise<T> {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const res = await fetcher(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`YouTube Data API failed: HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text || '{}') as T;
}

function authorMetaFromYouTubeChannel(channel?: YouTubeChannel): EventAuthorMeta | undefined {
  if (!channel) return undefined;
  const subscribersHidden = channel.statistics?.hiddenSubscriberCount === true;
  const thumbnail = bestThumbnail(channel.snippet?.thumbnails);
  const meta: EventAuthorMeta = {
    description: channel.snippet?.description?.trim() || undefined,
    followers: subscribersHidden ? undefined : numberFromYouTube(channel.statistics?.subscriberCount),
    posts: numberFromYouTube(channel.statistics?.videoCount),
    profileImageUrl: thumbnail?.url,
  };
  return Object.values(meta).some((value) => value !== undefined) ? meta : undefined;
}

function mediaFromYouTubeVideo(video: YouTubeVideo): EventPostMedia[] | undefined {
  const thumbnail = bestThumbnail(video.snippet?.thumbnails);
  if (!thumbnail?.url) return undefined;
  return [
    {
      url: thumbnail.url,
      type: 'image',
      source: 'youtube-thumbnail',
      altText: video.snippet?.title ? `Video thumbnail: ${video.snippet.title}` : undefined,
      width: thumbnail.width,
      height: thumbnail.height,
    },
  ];
}

function bestThumbnail(value: unknown): { url: string; width?: number; height?: number } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ['maxres', 'standard', 'high', 'medium', 'default']) {
    const item = record[key];
    if (!item || typeof item !== 'object') continue;
    const thumbnail = item as Record<string, unknown>;
    const url = typeof thumbnail.url === 'string' ? thumbnail.url.trim() : '';
    if (!url) continue;
    return {
      url,
      width: numberFromUnknown(thumbnail.width),
      height: numberFromUnknown(thumbnail.height),
    };
  }
  return undefined;
}

function youtubeApiKey(env: YouTubeEnv): string | undefined {
  return env.YOUTUBE_API_KEY?.trim() || env.YOUTUBE_DATA_API_KEY?.trim() || undefined;
}

function youtubeVideoId(value: string): string | undefined {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (/youtu\.be$/i.test(url.hostname)) return url.pathname.split('/').filter(Boolean)[0];
    if (/(^|\.)youtube\.com$/i.test(url.hostname)) {
      const watchId = url.searchParams.get('v')?.trim();
      if (watchId) return watchId;
      const shorts = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{6,})/i)?.[1];
      if (shorts) return shorts;
      const embed = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{6,})/i)?.[1];
      if (embed) return embed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function youtubePostUrlKey(value: string): string {
  const id = youtubeVideoId(value);
  return id ? youtubeVideoKey(id) : value.trim().split(/[?#]/)[0].replace(/\/$/, '').toLowerCase();
}

function youtubeVideoKey(id: string): string {
  return `youtube:${id.toLowerCase()}`;
}

function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

function youtubeChannelHandle(channel?: YouTubeChannel): string | undefined {
  const raw = channel?.snippet?.customUrl?.trim();
  if (!raw) return undefined;
  return raw.replace(/^https?:\/\/(?:www\.)?youtube\.com\//i, '').replace(/^\/+/, '') || undefined;
}

function isoForYouTube(value?: string): string | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return undefined;
  return new Date(time).toISOString();
}

function numberFromYouTube(value?: string): number | undefined {
  if (value === undefined) return undefined;
  return numberFromUnknown(Number(value));
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
