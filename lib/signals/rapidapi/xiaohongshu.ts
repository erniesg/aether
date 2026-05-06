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

export const XHS_DEFAULT_HOST =
  process.env.RAPIDAPI_XHS_HOST?.trim() ||
  'xiaohongshu-all-in-one.p.rapidapi.com';

export const XHS_SEARCH_PATH =
  process.env.RAPIDAPI_XHS_SEARCH_PATH?.trim() || '/search/notes';

export const XHS_USER_PATH =
  process.env.RAPIDAPI_XHS_USER_PATH?.trim() || '/user/notes';

export interface XiaohongshuScrapeOptions extends SignalQuery {
  host?: string;
  path?: string;
}

export function parseXiaohongshuResponse(
  raw: unknown,
  query: SignalQuery
): SignalHit[] {
  const items =
    asArray(dig(raw, 'data', 'items')) ||
    asArray(dig(raw, 'data', 'notes')) ||
    asArray(dig(raw, 'data')) ||
    asArray(dig(raw, 'notes')) ||
    asArray(dig(raw, 'items')) ||
    [];

  const out: SignalHit[] = [];
  for (const item of items) {
    const obj = asObject(item);
    if (!obj) continue;
    const note = asObject(obj['note_card']) ?? asObject(obj['note']) ?? obj;

    const id =
      pickString(note['id'], note['note_id'], obj['id'], obj['note_id']) ||
      `xhs-${out.length + 1}`;
    const title =
      pickString(note['title'], note['display_title'], note['desc']) ||
      query.query;
    const url =
      pickString(obj['share_url'], obj['url'], note['url']) ||
      `https://www.xiaohongshu.com/explore/${encodeURIComponent(id)}`;

    const thumbnailUrl = firstUrl(
      dig(note, 'cover', 'url_default'),
      dig(note, 'cover', 'url'),
      dig(note, 'image_list', 0, 'url'),
      dig(note, 'images_list', 0, 'url'),
      note['image']
    );

    const author = pickString(
      dig(note, 'user', 'nickname'),
      dig(note, 'user', 'nick_name'),
      dig(obj, 'user', 'nickname')
    );
    const userId = pickString(
      dig(note, 'user', 'user_id'),
      dig(note, 'user', 'userid')
    );
    const authorUrl = userId
      ? `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(userId)}`
      : undefined;

    const interact = asObject(note['interact_info']) ?? {};
    const metrics = {
      likes: pickNumber(interact['liked_count'], note['liked_count']),
      comments: pickNumber(interact['comment_count'], note['comment_count']),
      shares: pickNumber(interact['share_count']),
      saves: pickNumber(interact['collected_count']),
    };

    out.push({
      id: `xiaohongshu:${id}`,
      platform: 'xiaohongshu',
      title,
      url,
      thumbnailUrl,
      author,
      authorUrl,
      capturedAt: new Date().toISOString(),
      tags: ['xiaohongshu', query.kind ?? 'keyword'],
      metrics,
      rawSource: XHS_DEFAULT_HOST,
    });
  }
  return out;
}

function pickXhsPath(kind?: SignalQuery['kind']): string {
  if (kind === 'account') return XHS_USER_PATH;
  return XHS_SEARCH_PATH;
}

export async function scrapeXiaohongshu(
  client: RapidApiClient,
  opts: XiaohongshuScrapeOptions
): Promise<SignalHit[]> {
  const host = opts.host ?? XHS_DEFAULT_HOST;
  const path = opts.path ?? pickXhsPath(opts.kind);
  const clean = opts.query.replace(/^[#@]+/, '').trim();
  const params: Record<string, string | number> = {
    keyword: clean,
    keywords: clean,
    query: clean,
    user_id: clean,
    page_size: opts.limit ?? 12,
    limit: opts.limit ?? 12,
  };
  const raw = await client.request({ host, path, params });
  return parseXiaohongshuResponse(raw, opts);
}
