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

export const INSTAGRAM_DEFAULT_HOST =
  process.env.RAPIDAPI_INSTAGRAM_HOST?.trim() ||
  'instagram-scraper-api2.p.rapidapi.com';

export const INSTAGRAM_HASHTAG_PATH =
  process.env.RAPIDAPI_INSTAGRAM_HASHTAG_PATH?.trim() || '/v1/hashtag';

export const INSTAGRAM_USER_PATH =
  process.env.RAPIDAPI_INSTAGRAM_USER_PATH?.trim() || '/v1/user_posts';

export const INSTAGRAM_SEARCH_PATH =
  process.env.RAPIDAPI_INSTAGRAM_SEARCH_PATH?.trim() || '/v1/search';

export interface InstagramScrapeOptions extends SignalQuery {
  host?: string;
  path?: string;
}

export function parseInstagramResponse(
  raw: unknown,
  query: SignalQuery
): SignalHit[] {
  const items =
    asArray(dig(raw, 'data', 'items')) ||
    asArray(dig(raw, 'data', 'medias')) ||
    asArray(dig(raw, 'data')) ||
    asArray(dig(raw, 'items')) ||
    [];

  const out: SignalHit[] = [];
  for (const item of items) {
    const obj = asObject(item);
    if (!obj) continue;
    const media = asObject(obj['media']) ?? obj;

    const id = pickString(media['id'], media['pk'], media['code']) || `ig-${out.length + 1}`;
    const code = pickString(media['code'], media['shortcode'], obj['code']);
    const caption =
      pickString(
        dig(media, 'caption', 'text'),
        dig(obj, 'caption', 'text'),
        media['caption_text'],
        media['title']
      ) || query.query;

    const url = code
      ? `https://www.instagram.com/p/${code}/`
      : pickString(media['permalink'], obj['url']) ||
        `https://www.instagram.com/explore/tags/${encodeURIComponent(query.query)}/`;

    const thumbnailUrl = firstUrl(
      media['thumbnail_url'],
      media['display_url'],
      dig(media, 'image_versions2', 'candidates'),
      dig(media, 'image_versions', 'items'),
      media['cover_url']
    );

    const author = pickString(
      dig(media, 'user', 'username'),
      dig(obj, 'user', 'username'),
      dig(media, 'owner', 'username')
    );
    const authorUrl = author
      ? `https://www.instagram.com/${encodeURIComponent(author)}/`
      : undefined;

    const metrics = {
      likes: pickNumber(media['like_count'], obj['like_count']),
      comments: pickNumber(media['comment_count'], obj['comment_count']),
      views: pickNumber(media['view_count'], media['play_count']),
    };

    out.push({
      id: `instagram:${id}`,
      platform: 'instagram',
      title: caption,
      url,
      thumbnailUrl,
      author,
      authorUrl,
      capturedAt: new Date().toISOString(),
      tags: ['instagram', query.kind ?? 'keyword'],
      metrics,
      rawSource: INSTAGRAM_DEFAULT_HOST,
    });
  }
  return out;
}

function pickInstagramPath(kind?: SignalQuery['kind']): string {
  if (kind === 'hashtag') return INSTAGRAM_HASHTAG_PATH;
  if (kind === 'account') return INSTAGRAM_USER_PATH;
  return INSTAGRAM_SEARCH_PATH;
}

export async function scrapeInstagram(
  client: RapidApiClient,
  opts: InstagramScrapeOptions
): Promise<SignalHit[]> {
  const host = opts.host ?? INSTAGRAM_DEFAULT_HOST;
  const path = opts.path ?? pickInstagramPath(opts.kind);
  const clean = opts.query.replace(/^[#@]+/, '').trim();
  const params: Record<string, string | number> = {
    hashtag: clean,
    username_or_id_or_url: clean,
    search_query: clean,
    query: clean,
    count: opts.limit ?? 12,
    limit: opts.limit ?? 12,
  };
  const raw = await client.request({ host, path, params });
  return parseInstagramResponse(raw, opts);
}
