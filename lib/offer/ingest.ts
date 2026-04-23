import {
  clipboardUrl,
  extractFromClipboard,
  extractFromFiles,
  extractFromHtml,
} from './extract';
import { shapeOfferSnapshot } from './shape';
import type {
  OfferClipboardPayload,
  OfferFilesPayload,
  OfferIngestRequest,
  OfferRawExtract,
  OfferSnapshot,
  OfferSnapshotSource,
} from './types';

/**
 * Offer ingest orchestrator. Parse the surface (URL / files / clipboard)
 * into an `OfferRawExtract`, then ask the shaper to distil it into an
 * `OfferSnapshot`. Kept thin so each mode can be tested against its own
 * fixture without threading through the HTTP route.
 */

export interface IngestOptions {
  /** Overridable fetcher — tests inject a fixture fetch. */
  fetcher?: typeof fetch;
  /** Skip the Claude call; use the deterministic local ranker instead. */
  bypassAgent?: boolean;
}

export async function ingestOffer(
  request: OfferIngestRequest,
  opts: IngestOptions = {}
): Promise<OfferSnapshot> {
  const fetcher = opts.fetcher ?? fetch;
  if (request.kind === 'url') {
    if (typeof request.source !== 'string' || !request.source.trim()) {
      throw new Error('url ingest requires a non-empty source string');
    }
    const { extract, source } = await ingestUrl(request.source, fetcher);
    return shapeOfferSnapshot(extract, source, { bypassAgent: opts.bypassAgent });
  }
  if (request.kind === 'files') {
    const payload = coerceFilesPayload(request.source);
    const { extract, source } = ingestFiles(payload);
    return shapeOfferSnapshot(extract, source, { bypassAgent: opts.bypassAgent });
  }
  if (request.kind === 'clipboard') {
    const payload = coerceClipboardPayload(request.source);
    const routedUrl = clipboardUrl(payload);
    if (routedUrl) {
      const { extract, source } = await ingestUrl(routedUrl, fetcher);
      return shapeOfferSnapshot(
        extract,
        { kind: 'clipboard', url: routedUrl },
        { bypassAgent: opts.bypassAgent }
      );
    }
    const extract = extractFromClipboard(payload);
    return shapeOfferSnapshot(extract, { kind: 'clipboard' }, { bypassAgent: opts.bypassAgent });
  }
  throw new Error(`unsupported ingest kind: ${String((request as { kind?: unknown }).kind)}`);
}

async function ingestUrl(
  url: string,
  fetcher: typeof fetch
): Promise<{ extract: OfferRawExtract; source: OfferSnapshotSource }> {
  const res = await fetcher(url, {
    headers: {
      'User-Agent': 'aether-offer-ingest/0.1 (+https://aether.berlayar.ai)',
    },
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  const html = await res.text();
  const extract = extractFromHtml(html, url);
  return { extract, source: { kind: 'url', url } };
}

function ingestFiles(payload: OfferFilesPayload): {
  extract: OfferRawExtract;
  source: OfferSnapshotSource;
} {
  const extract = extractFromFiles(payload);
  return { extract, source: { kind: 'files' } };
}

function coerceFilesPayload(source: unknown): OfferFilesPayload {
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const s = source as Record<string, unknown>;
    const texts = Array.isArray(s.texts)
      ? s.texts.filter((t): t is string => typeof t === 'string')
      : undefined;
    const images = Array.isArray(s.images)
      ? (s.images as unknown[])
          .map((entry): { url: string; alt?: string } | null => {
            if (typeof entry !== 'object' || entry === null) return null;
            const e = entry as Record<string, unknown>;
            const url = typeof e.url === 'string' ? e.url : '';
            if (!url) return null;
            const alt = typeof e.alt === 'string' ? e.alt : undefined;
            return alt ? { url, alt } : { url };
          })
          .filter((x): x is { url: string; alt?: string } => x !== null)
      : undefined;
    return {
      ...(texts ? { texts } : {}),
      ...(images ? { images } : {}),
    };
  }
  throw new Error('files ingest requires a source object with texts[] and/or images[]');
}

function coerceClipboardPayload(source: unknown): OfferClipboardPayload {
  if (typeof source === 'string') {
    return source.trim() ? { text: source } : {};
  }
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const s = source as Record<string, unknown>;
    const html = typeof s.html === 'string' ? s.html : undefined;
    const text = typeof s.text === 'string' ? s.text : undefined;
    const url = typeof s.url === 'string' ? s.url : undefined;
    return {
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
      ...(url ? { url } : {}),
    };
  }
  throw new Error('clipboard ingest requires a string or payload object');
}
