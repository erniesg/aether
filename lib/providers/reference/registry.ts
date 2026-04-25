import { createGenericProvider } from './generic';
import { createInstagramProvider } from './instagram';
import { createPinterestProvider } from './pinterest';
import { createTikTokProvider } from './tiktok';
import { createXhsProvider } from './xhs';
import { normalizeHttpUrlInput } from '@/lib/url/normalize';
import type {
  ReferenceFetchOptions,
  ReferenceProvider,
  ReferenceRecord,
} from './types';

/**
 * Provider order matters: the first adapter whose `canHandle` returns true
 * gets the request. Specific adapters come before `generic` so that a
 * Pinterest URL never silently falls through to the OG fallback.
 */
const FACTORIES: ReadonlyArray<() => ReferenceProvider> = [
  createPinterestProvider,
  createInstagramProvider,
  createXhsProvider,
  createTikTokProvider,
  createGenericProvider,
];

export function listReferenceProviders(): ReferenceProvider[] {
  return FACTORIES.map((f) => f());
}

export function resolveReferenceProvider(url: string): ReferenceProvider | null {
  for (const make of FACTORIES) {
    const provider = make();
    if (provider.canHandle(url)) return provider;
  }
  return null;
}

export interface IngestOutcome {
  record: ReferenceRecord;
  /** True when we fell back to a link-only record (no og:image). */
  fallback: boolean;
  /** The provider id that handled the URL. */
  providerId: string;
}

/**
 * Ingest a URL through the provider chain. Returns a structured outcome so
 * callers can decide whether to surface a "link-only" toast. Specific adapter
 * errors are caught and degraded into the generic fallback, which never
 * throws for a public http(s) URL — we'd rather pin the URL than lose it.
 */
export async function ingestReferenceUrl(
  url: string,
  opts: ReferenceFetchOptions = {}
): Promise<IngestOutcome> {
  const trimmed = normalizeHttpUrlInput(url);
  if (!trimmed) {
    throw new Error('url required');
  }

  let candidate: URL;
  try {
    candidate = new URL(trimmed);
  } catch {
    throw new Error(`invalid URL: ${trimmed}`);
  }
  if (candidate.protocol !== 'https:' && candidate.protocol !== 'http:') {
    throw new Error(`unsupported URL scheme: ${candidate.protocol}`);
  }

  for (const make of FACTORIES) {
    const provider = make();
    if (!provider.canHandle(trimmed)) continue;
    if (provider.id === 'generic') {
      const record = await provider.fetch(trimmed, opts);
      return {
        record,
        fallback: record.kind === 'embed',
        providerId: provider.id,
      };
    }
    try {
      const record = await provider.fetch(trimmed, opts);
      return { record, fallback: false, providerId: provider.id };
    } catch {
      // Specific adapter failed — fall through to generic so the URL is
      // still pinned as a link-only reference with a toast.
      const generic = createGenericProvider();
      const record = await generic.fetch(trimmed, opts);
      return {
        record,
        fallback: record.kind === 'embed',
        providerId: 'generic',
      };
    }
  }

  // Unreachable: generic.canHandle accepts any http(s) URL.
  throw new Error(`no provider for url: ${trimmed}`);
}
