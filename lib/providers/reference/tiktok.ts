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

const HOST_RE = /^(?:www\.)?(?:tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)$/i;

/**
 * TikTok video share URLs — both canonical `tiktok.com/@user/video/...` and
 * the `vm.tiktok.com` / `vt.tiktok.com` shortlink form. We capture the
 * thumbnail and mark the record as `video`; the embed URL is available via
 * `attribution.url` for downstream players.
 */
export function createTikTokProvider(): ReferenceProvider {
  return {
    id: 'tiktok',
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
          'no og:image found on tiktok page',
          'tiktok'
        );
      }
      const canonical = tags.canonical ?? url;
      const record: ReferenceRecord = {
        id: genReferenceId('ref_tt'),
        kind: 'video',
        previewUrl: preview,
        fullUrl: canonical,
        attribution: {
          source: 'tiktok',
          author: extractAuthor(canonical, tags.ogTitle, tags.author),
          url: canonical,
        },
        capturedAt: new Date().toISOString(),
      };
      return record;
    },
  };
}

/** Canonical TikTok URLs put the author handle in the path: `/@handle/video/123…`. */
function extractAuthor(
  canonical: string,
  ogTitle?: string,
  metaAuthor?: string
): string | undefined {
  if (metaAuthor) return metaAuthor;
  try {
    const u = new URL(canonical);
    const m = /^\/@([A-Za-z0-9_.]+)/.exec(u.pathname);
    if (m?.[1]) return `@${m[1]}`;
  } catch {
    // Fall through.
  }
  if (ogTitle) {
    const m = /@([A-Za-z0-9_.]+)/.exec(ogTitle);
    if (m?.[1]) return `@${m[1]}`;
  }
  return undefined;
}
