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

const HOST_RE = /^(?:www\.)?(?:[a-z]+\.)?pinterest\.[a-z.]+$/i;
const SHORT_RE = /^(?:www\.)?pin\.it$/i;

/** Pinterest pin URLs + `pin.it` share shortlinks. */
export function createPinterestProvider(): ReferenceProvider {
  return {
    id: 'pinterest',
    canHandle(url: string) {
      try {
        const u = new URL(url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
        return HOST_RE.test(u.hostname) || SHORT_RE.test(u.hostname);
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
          'no og:image found on pinterest page',
          'pinterest'
        );
      }
      const record: ReferenceRecord = {
        id: genReferenceId('ref_pin'),
        kind: 'image',
        previewUrl: preview,
        fullUrl: tags.canonical ?? url,
        attribution: {
          source: 'pinterest',
          author: extractAuthor(tags.ogTitle, tags.ogDescription, tags.author),
          url: tags.canonical ?? url,
        },
        capturedAt: new Date().toISOString(),
      };
      return record;
    },
  };
}

/** Pinterest's og:title is typically "Author Name on Pinterest: ..." — strip that. */
function extractAuthor(
  ogTitle?: string,
  ogDescription?: string,
  metaAuthor?: string
): string | undefined {
  if (metaAuthor) return metaAuthor;
  if (ogTitle) {
    const m = /^(.+?)\s+on\s+Pinterest\b/i.exec(ogTitle);
    if (m?.[1]) return m[1].trim();
  }
  if (ogDescription) {
    const m = /\bby\s+([^·|,(]+?)\s+on\s+Pinterest/i.exec(ogDescription);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}
