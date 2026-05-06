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

export const PINTEREST_DEFAULT_HOST =
  process.env.RAPIDAPI_PINTEREST_HOST?.trim() ||
  'pinterest-scraper-fast.p.rapidapi.com';

export const PINTEREST_DEFAULT_SEARCH_PATH =
  process.env.RAPIDAPI_PINTEREST_SEARCH_PATH?.trim() || '/search';

export interface PinterestScrapeOptions extends SignalQuery {
  host?: string;
  path?: string;
}

function pinterestUrlFor(target: SignalQuery): string {
  const clean = target.query.trim().replace(/^[#@]+/, '');
  const encoded = encodeURIComponent(clean);
  if (target.kind === 'account') {
    return `https://www.pinterest.com/${encoded}/`;
  }
  return `https://www.pinterest.com/search/pins/?q=${encoded}`;
}

export function parsePinterestResponse(
  raw: unknown,
  query: SignalQuery
): SignalHit[] {
  const items =
    asArray(dig(raw, 'data', 'pins')) ||
    asArray(dig(raw, 'data', 'items')) ||
    asArray(dig(raw, 'data')) ||
    asArray(dig(raw, 'results')) ||
    asArray(dig(raw, 'pins')) ||
    [];

  const out: SignalHit[] = [];
  for (const item of items) {
    const obj = asObject(item);
    if (!obj) continue;

    const id =
      pickString(obj['id'], obj['pin_id'], obj['uid']) ||
      `pinterest-${out.length + 1}`;
    const title =
      pickString(
        obj['title'],
        obj['grid_title'],
        obj['description'],
        dig(obj, 'rich_summary', 'display_name'),
        dig(obj, 'pin_join', 'visual_descriptions', 0)
      ) || query.query;

    const url =
      pickString(
        obj['link'],
        obj['url'],
        dig(obj, 'pin_join', 'pin_url')
      ) || `https://www.pinterest.com/pin/${id}/`;

    const thumbnailUrl = firstUrl(
      dig(obj, 'images', 'orig', 'url'),
      dig(obj, 'images', '736x', 'url'),
      dig(obj, 'images', '474x', 'url'),
      obj['image'],
      obj['image_url'],
      dig(obj, 'media', 'images', 'orig', 'url')
    );

    const author = pickString(
      dig(obj, 'pinner', 'username'),
      dig(obj, 'board', 'owner', 'username'),
      dig(obj, 'native_creator', 'username'),
      dig(obj, 'pinner', 'full_name')
    );
    const authorUrl = author
      ? `https://www.pinterest.com/${encodeURIComponent(author)}/`
      : undefined;

    const metrics = {
      likes: pickNumber(obj['reaction_counts'], obj['like_count']),
      comments: pickNumber(obj['comment_count']),
      saves: pickNumber(obj['repin_count'], obj['saves']),
    };

    out.push({
      id: `pinterest:${id}`,
      platform: 'pinterest',
      title,
      url,
      thumbnailUrl,
      author,
      authorUrl,
      capturedAt: new Date().toISOString(),
      tags: ['pinterest', query.kind ?? 'keyword'],
      metrics,
      rawSource: PINTEREST_DEFAULT_HOST,
    });
  }
  return out;
}

export async function scrapePinterest(
  client: RapidApiClient,
  opts: PinterestScrapeOptions
): Promise<SignalHit[]> {
  const host = opts.host ?? PINTEREST_DEFAULT_HOST;
  const path = opts.path ?? PINTEREST_DEFAULT_SEARCH_PATH;
  const cleanQuery = opts.query.replace(/^[#@]+/, '').trim();
  const params: Record<string, string | number> = {
    query: cleanQuery,
    keyword: cleanQuery,
    q: cleanQuery,
    limit: opts.limit ?? 12,
    num: opts.limit ?? 12,
  };
  const raw = await client.request({ host, path, params });
  return parsePinterestResponse(raw, opts).map((hit) => ({
    ...hit,
    url: hit.url || pinterestUrlFor(opts),
  }));
}
