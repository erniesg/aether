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

const HOST_RE = /^(?:www\.)?(?:instagram\.com|instagr\.am)$/i;
const PATH_RE = /^\/(?:p|reel|reels|tv)\/[\w-]+/i;

/** Public Instagram post / reel / IGTV share URLs. */
export function createInstagramProvider(): ReferenceProvider {
  return {
    id: 'instagram',
    canHandle(url: string) {
      try {
        const u = new URL(url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
        if (!HOST_RE.test(u.hostname)) return false;
        return PATH_RE.test(u.pathname);
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
          'no og:image found on instagram page',
          'instagram'
        );
      }
      const kind = detectKind(url, tags.ogType);
      const record: ReferenceRecord = {
        id: genReferenceId('ref_ig'),
        kind,
        previewUrl: preview,
        fullUrl: tags.canonical ?? url,
        attribution: {
          source: 'instagram',
          author: extractAuthor(tags.ogTitle, tags.ogDescription, tags.author),
          url: tags.canonical ?? url,
        },
        capturedAt: new Date().toISOString(),
      };
      return record;
    },
  };
}

function detectKind(url: string, ogType?: string): 'image' | 'video' {
  if (ogType?.toLowerCase().startsWith('video')) return 'video';
  try {
    const u = new URL(url);
    if (/\/(?:reel|reels|tv)\//i.test(u.pathname)) return 'video';
  } catch {
    // Fall through to image.
  }
  return 'image';
}

/**
 * Instagram's og:title is typically:
 *   `author (@handle) · Instagram photo · …`
 * or                       `author on Instagram: "..."`.
 * We pull the handle if present, else the bare author phrase.
 */
function extractAuthor(
  ogTitle?: string,
  ogDescription?: string,
  metaAuthor?: string
): string | undefined {
  if (metaAuthor) return metaAuthor;
  const hay = `${ogTitle ?? ''} ${ogDescription ?? ''}`;
  const handle = /@([A-Za-z0-9_.]+)/.exec(hay);
  if (handle?.[1]) return `@${handle[1]}`;
  if (ogTitle) {
    const m = /^(.+?)\s+on\s+Instagram\b/i.exec(ogTitle);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}
