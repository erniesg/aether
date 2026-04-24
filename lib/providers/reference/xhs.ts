import {
  fetchHtml,
  genReferenceId,
  parseOgTags,
  pickPreviewImage,
} from './og';
import {
  ReferenceIngestError,
  type ReferenceFetchOptions,
  type ReferenceProvider,
  type ReferenceRecord,
} from './types';

const HOST_RE =
  /^(?:www\.)?(?:xiaohongshu\.com|xhslink\.com|xhs\.cn)$/i;

/** Xiaohongshu (小红书) notes — public share URLs and `xhslink.com` shortlinks. */
export function createXhsProvider(): ReferenceProvider {
  return {
    id: 'xhs',
    canHandle(url: string) {
      try {
        const u = new URL(url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
        return HOST_RE.test(u.hostname);
      } catch {
        return false;
      }
    },
    async fetch(url: string, opts: ReferenceFetchOptions = {}) {
      const html = await fetchHtml(url, opts.fetcher);
      const tags = parseOgTags(html);
      const preview = pickPreviewImage(tags);
      if (!preview) {
        throw new ReferenceIngestError(
          'no og:image found on xhs page',
          'xhs'
        );
      }
      const kind = tags.ogType?.toLowerCase().startsWith('video')
        ? 'video'
        : 'image';
      const record: ReferenceRecord = {
        id: genReferenceId('ref_xhs'),
        kind,
        previewUrl: preview,
        fullUrl: tags.canonical ?? url,
        attribution: {
          source: 'xhs',
          author: extractAuthor(tags.ogTitle, tags.ogDescription, tags.author),
          url: tags.canonical ?? url,
        },
        capturedAt: new Date().toISOString(),
      };
      return record;
    },
  };
}

/**
 * XHS og:title is typically `<note title> - 小红书` or the author name alone;
 * we prefer explicit author meta when present.
 */
function extractAuthor(
  ogTitle?: string,
  ogDescription?: string,
  metaAuthor?: string
): string | undefined {
  if (metaAuthor) return metaAuthor;
  const hay = `${ogTitle ?? ''} ${ogDescription ?? ''}`;
  const m = /@([\p{L}\p{N}_.\-]+)/u.exec(hay);
  if (m?.[1]) return `@${m[1]}`;
  return undefined;
}
