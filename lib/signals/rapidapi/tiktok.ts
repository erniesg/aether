import type { RapidApiClient } from './client';
import {
  asArray,
  asObject,
  dig,
  firstUrl,
  pickNumber,
  pickString,
} from './parse';
import type { SignalHit, SignalQuery } from './types';

export const TIKTOK_DEFAULT_HOST =
  process.env.RAPIDAPI_TIKTOK_HOST?.trim() ||
  'tiktok-scraper7.p.rapidapi.com';

export const TIKTOK_KEYWORD_PATH =
  process.env.RAPIDAPI_TIKTOK_KEYWORD_PATH?.trim() || '/feed/search';

export const TIKTOK_HASHTAG_PATH =
  process.env.RAPIDAPI_TIKTOK_HASHTAG_PATH?.trim() || '/challenge/posts';

export const TIKTOK_USER_PATH =
  process.env.RAPIDAPI_TIKTOK_USER_PATH?.trim() || '/user/posts';

export interface TikTokScrapeOptions extends SignalQuery {
  host?: string;
  path?: string;
}

export function parseTikTokResponse(
  raw: unknown,
  query: SignalQuery
): SignalHit[] {
  const items =
    asArray(dig(raw, 'data', 'videos')) ||
    asArray(dig(raw, 'data', 'aweme_list')) ||
    asArray(dig(raw, 'data')) ||
    asArray(dig(raw, 'videos')) ||
    asArray(dig(raw, 'aweme_list')) ||
    [];

  const out: SignalHit[] = [];
  for (const item of items) {
    const obj = asObject(item);
    if (!obj) continue;

    const id =
      pickString(obj['aweme_id'], obj['video_id'], obj['id']) ||
      `tiktok-${out.length + 1}`;
    const author = pickString(
      dig(obj, 'author', 'unique_id'),
      dig(obj, 'author', 'uniqueId'),
      dig(obj, 'author', 'username')
    );
    const url =
      pickString(obj['share_url'], obj['play']) ||
      (author
        ? `https://www.tiktok.com/@${encodeURIComponent(author)}/video/${encodeURIComponent(id)}`
        : `https://www.tiktok.com/video/${encodeURIComponent(id)}`);

    const title =
      pickString(obj['desc'], obj['title'], dig(obj, 'video', 'title')) ||
      query.query;

    const thumbnailUrl = firstUrl(
      dig(obj, 'video', 'cover'),
      dig(obj, 'video', 'origin_cover'),
      dig(obj, 'video', 'cover', 'url_list'),
      dig(obj, 'cover'),
      obj['cover'],
      obj['origin_cover']
    );

    const stats = asObject(obj['statistics']) ?? asObject(obj['stats']) ?? {};
    const metrics = {
      likes: pickNumber(stats['digg_count'], stats['diggCount'], stats['like_count']),
      comments: pickNumber(stats['comment_count'], stats['commentCount']),
      shares: pickNumber(stats['share_count'], stats['shareCount']),
      views: pickNumber(stats['play_count'], stats['playCount']),
    };

    const authorUrl = author
      ? `https://www.tiktok.com/@${encodeURIComponent(author)}`
      : undefined;

    out.push({
      id: `tiktok:${id}`,
      platform: 'tiktok',
      title,
      url,
      thumbnailUrl,
      author,
      authorUrl,
      capturedAt: new Date().toISOString(),
      tags: ['tiktok', query.kind ?? 'keyword'],
      metrics,
      rawSource: TIKTOK_DEFAULT_HOST,
    });
  }
  return out;
}

function pickTikTokPath(kind?: SignalQuery['kind']): string {
  if (kind === 'hashtag') return TIKTOK_HASHTAG_PATH;
  if (kind === 'account') return TIKTOK_USER_PATH;
  return TIKTOK_KEYWORD_PATH;
}

export async function scrapeTikTok(
  client: RapidApiClient,
  opts: TikTokScrapeOptions
): Promise<SignalHit[]> {
  const host = opts.host ?? TIKTOK_DEFAULT_HOST;
  const path = opts.path ?? pickTikTokPath(opts.kind);
  const clean = opts.query.replace(/^[#@]+/, '').trim();
  const params: Record<string, string | number> = {
    keywords: clean,
    keyword: clean,
    challenge_name: clean,
    unique_id: clean,
    count: opts.limit ?? 12,
    limit: opts.limit ?? 12,
  };
  const raw = await client.request({ host, path, params });
  return parseTikTokResponse(raw, opts);
}
