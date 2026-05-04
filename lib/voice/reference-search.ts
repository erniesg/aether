import { searchProductImagesOnSerp } from '@/lib/ingest/serp';
import { genReferenceId } from '@/lib/providers/reference/og';
import type { ReferenceRecord, ReferenceStatus } from '@/lib/providers/reference/types';
import {
  rankLibraryReferences,
  referencePrimaryUrl,
} from '@/lib/asset-library/search';
import { normalizeForMatch } from '@/lib/product/catalog';

export interface VoiceReferenceHit {
  url: string;
  score?: number;
  productId?: string;
  productCanonicalName?: string;
  query?: string;
  status?: ReferenceStatus;
}

export interface VoiceReferenceSearchResult {
  status: 'ok' | 'empty' | 'unavailable';
  references: VoiceReferenceHit[];
  records: ReferenceRecord[];
  warning?: string;
}

export interface LocalEmbeddingRerankRequest {
  query: string;
  imageUrls: string[];
  limit: number;
}

export type VoiceImageSearcher = (
  query: string,
  limit: number
) => Promise<string[]>;

export type VoiceReferenceReranker = (
  input: LocalEmbeddingRerankRequest
) => Promise<VoiceReferenceHit[]>;

export interface VoiceReferenceSearchInput {
  query: string;
  limit?: number;
  libraryReferences?: ReadonlyArray<ReferenceRecord>;
  searchImages?: VoiceImageSearcher;
  rerank?: VoiceReferenceReranker;
  product?: {
    id: string;
    canonicalName: string;
    confidence?: number;
  };
}

interface LocalRerankResponse {
  ranked?: Array<{ url?: string; score?: number }>;
  urls?: string[];
}

export function createLocalEmbeddingReranker(input: {
  endpoint?: string;
  token?: string;
  fetchImpl?: typeof fetch;
} = {}): VoiceReferenceReranker | null {
  const endpoint =
    input.endpoint ??
    process.env.LOCAL_EMBEDDING_RERANK_URL ??
    process.env.LOCAL_EMBEDDING_URL;
  if (!endpoint) return null;
  const token = input.token ?? process.env.LOCAL_EMBEDDING_TOKEN;
  const fetchImpl = input.fetchImpl ?? fetch;
  return async ({ query, imageUrls, limit }) => {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, imageUrls, limit }),
    });
    if (!res.ok) throw new Error(`local embedding rerank failed (${res.status})`);
    const json = (await res.json()) as LocalRerankResponse;
    if (Array.isArray(json.ranked)) {
      return json.ranked
        .flatMap((entry) =>
          typeof entry.url === 'string'
            ? [{ url: entry.url, score: entry.score }]
            : []
        )
        .slice(0, limit);
    }
    if (Array.isArray(json.urls)) {
      return json.urls
        .filter((url): url is string => typeof url === 'string')
        .slice(0, limit)
        .map((url) => ({ url }));
    }
    return [];
  };
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

function normalizeCandidateScore(score: number | undefined, index: number): number {
  if (typeof score === 'number' && Number.isFinite(score)) {
    if (score >= 0 && score <= 1) return clampScore(score);
    return clampScore(score / (score + 8));
  }
  return clampScore(0.62 - index * 0.06);
}

function productText(record: ReferenceRecord): string {
  return [
    record.productCanonicalName,
    record.title,
    record.usageIntent,
    record.notes,
    ...(record.tags ?? []),
    record.attribution.source,
    record.attribution.author,
    record.attribution.url,
    record.fullUrl,
    record.previewUrl,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
}

export function referenceMatchesProduct(
  record: ReferenceRecord,
  product?: { id?: string; canonicalName?: string }
): boolean {
  if (!product?.id && !product?.canonicalName) return true;
  if (record.referenceStatus === 'rejected') return false;
  if (product.id && record.productId) return record.productId === product.id;
  if (product.canonicalName && record.productCanonicalName) {
    return (
      normalizeForMatch(record.productCanonicalName) ===
      normalizeForMatch(product.canonicalName)
    );
  }
  if (!product.canonicalName) return false;
  const normalizedRecord = normalizeForMatch(productText(record));
  const productTokens = normalizeForMatch(product.canonicalName)
    .split(' ')
    .filter((token) => token.length > 2);
  if (productTokens.length === 0) return false;
  const matched = productTokens.filter((token) => normalizedRecord.includes(token));
  return matched.length / productTokens.length >= 0.75;
}

function decorateHit(
  hit: VoiceReferenceHit,
  query: string,
  product: VoiceReferenceSearchInput['product'] | undefined,
  index: number
): VoiceReferenceHit {
  return {
    ...hit,
    score: normalizeCandidateScore(hit.score, index),
    query,
    status: hit.status ?? 'candidate',
    ...(product
      ? {
          productId: product.id,
          productCanonicalName: product.canonicalName,
        }
      : {}),
  };
}

function recordFromImageUrl(
  url: string,
  query: string,
  hit?: VoiceReferenceHit
): ReferenceRecord {
  return {
    id: genReferenceId('ref_voice'),
    kind: 'image',
    previewUrl: url,
    fullUrl: url,
    attribution: {
      source: 'image-search',
      url,
    },
    capturedAt: new Date().toISOString(),
    title: query,
    usageIntent: 'voice reference',
    tags: ['voice', 'search'],
    origin: 'search',
    productId: hit?.productId,
    productCanonicalName: hit?.productCanonicalName,
    referenceQuery: hit?.query ?? query,
    relevanceScore: hit?.score,
    referenceStatus: hit?.status ?? 'candidate',
  };
}

export async function searchVoiceReferences(
  input: VoiceReferenceSearchInput
): Promise<VoiceReferenceSearchResult> {
  const query = input.query.trim();
  if (!query) return { status: 'empty', references: [], records: [] };
  const limit = input.limit ?? 4;
  const scopedLibraryReferences = (input.libraryReferences ?? []).filter((record) =>
    referenceMatchesProduct(record, input.product)
  );
  const rankedLocal = rankLibraryReferences(query, scopedLibraryReferences, {
    visualOnly: true,
    limit,
  });
  const seenLocalUrls = new Set<string>();
  const localRecords: ReferenceRecord[] = [];
  const localHits: VoiceReferenceHit[] = [];
  for (const entry of rankedLocal) {
    const url = referencePrimaryUrl(entry.record);
    if (seenLocalUrls.has(url)) continue;
    seenLocalUrls.add(url);
    localRecords.push(entry.record);
    localHits.push(
      decorateHit({ url, score: entry.score }, query, input.product, localHits.length)
    );
    if (localHits.length >= limit) break;
  }
  const searchImages =
    input.searchImages ??
    ((q, n) => searchProductImagesOnSerp(q, n));

  let urls: string[] = [];
  try {
    urls = await searchImages(query, limit);
  } catch (err) {
    if (localHits.length > 0) {
      return {
        status: 'ok',
        references: localHits,
        records: localRecords,
        warning: err instanceof Error ? err.message : String(err),
      };
    }
    return {
      status: 'unavailable',
      references: [],
      records: [],
      warning: err instanceof Error ? err.message : String(err),
    };
  }
  const localUrls = new Set(localHits.map((hit) => hit.url));
  const uniqueUrls = Array.from(new Set(urls))
    .filter((url) => !localUrls.has(url))
    .slice(0, limit);
  if (uniqueUrls.length === 0 && localHits.length === 0) {
    return { status: 'empty', references: [], records: [] };
  }

  let references = [
    ...uniqueUrls.map((url, index) =>
      decorateHit({ url }, query, input.product, index)
    ),
    ...localHits,
  ].slice(0, limit);
  const rerank = input.rerank ?? createLocalEmbeddingReranker();
  if (rerank) {
    try {
      const candidateUrls = references.map((hit) => hit.url);
      const ranked = await rerank({ query, imageUrls: candidateUrls, limit });
      const previousByUrl = new Map(references.map((hit) => [hit.url, hit]));
      const seen = new Set<string>();
      references = [
        ...ranked.flatMap((hit, index) => {
          if (!candidateUrls.includes(hit.url) || seen.has(hit.url)) return [];
          seen.add(hit.url);
          const previous = previousByUrl.get(hit.url) ?? { url: hit.url };
          return [
            decorateHit(
              { ...previous, ...hit },
              query,
              input.product,
              index
            ),
          ];
        }),
        ...candidateUrls
          .filter((url) => !seen.has(url))
          .map((url, index) =>
            decorateHit(previousByUrl.get(url) ?? { url }, query, input.product, ranked.length + index)
          ),
      ].slice(0, limit);
    } catch {
      // Reranking is optional. Keep image-search order when the local model
      // is unavailable or rejects a URL.
    }
  }

  const localByUrl = new Map(localRecords.map((record) => [referencePrimaryUrl(record), record]));
  return {
    status: 'ok',
    references,
    records: references.map((hit) => {
      const local = localByUrl.get(hit.url);
      if (local) {
        return {
          ...local,
          productId: local.productId ?? hit.productId,
          productCanonicalName:
            local.productCanonicalName ?? hit.productCanonicalName,
          referenceQuery: local.referenceQuery ?? hit.query ?? query,
          relevanceScore: hit.score ?? local.relevanceScore,
          referenceStatus: local.referenceStatus ?? hit.status ?? 'candidate',
        };
      }
      return recordFromImageUrl(hit.url, query, hit);
    }),
  };
}
