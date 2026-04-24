import {
  fetchHtml,
  genReferenceId,
  parseOgTags,
  pickPreviewImage,
} from './og';
import type {
  ReferenceFetchOptions,
  ReferenceProvider,
  ReferenceRecord,
} from './types';

/**
 * Generic fallback. Accepts any absolute http(s) URL and returns whatever the
 * OG/Twitter meta yields. When no image is present, returns an `embed`-kind
 * link-only record so the caller can still pin the URL and show a toast.
 */
export function createGenericProvider(): ReferenceProvider {
  return {
    id: 'generic',
    canHandle(url: string) {
      try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    },
    async fetch(url: string, opts: ReferenceFetchOptions = {}) {
      const html = await fetchHtml(url, opts.fetcher);
      const tags = parseOgTags(html);
      const preview = pickPreviewImage(tags);
      const capturedAt = new Date().toISOString();
      if (preview) {
        const record: ReferenceRecord = {
          id: genReferenceId('ref'),
          kind: 'image',
          previewUrl: preview,
          fullUrl: tags.canonical ?? url,
          attribution: {
            source: 'generic',
            author: tags.ogSiteName ?? tags.author,
            url: tags.canonical ?? url,
          },
          capturedAt,
        };
        return record;
      }
      // No og:image — link-only reference. Callers that want a toast inspect
      // `kind === 'embed'` plus `previewUrl === fullUrl` to recognise the
      // fallback shape.
      const record: ReferenceRecord = {
        id: genReferenceId('ref'),
        kind: 'embed',
        previewUrl: url,
        fullUrl: url,
        attribution: {
          source: 'generic',
          author: tags.ogSiteName ?? tags.author,
          url,
        },
        capturedAt,
      };
      return record;
    },
  };
}
