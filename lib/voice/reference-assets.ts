import { MAX_REF_BYTES } from '@/lib/refs/limits';
import { uploadAssetToConvex } from '@/lib/storage/convexAsset';
import type { ReferenceRecord } from '@/lib/providers/reference/types';
import type { VoiceReferenceHit } from './reference-search';

const DEFAULT_TIMEOUT_MS = 12_000;

export interface VoiceReferenceAssetCacheInput {
  query: string;
  references: ReadonlyArray<VoiceReferenceHit>;
  records: ReadonlyArray<ReferenceRecord>;
  workspaceId?: string;
  fetchImpl?: typeof fetch;
  upload?: typeof uploadAssetToConvex;
  timeoutMs?: number;
}

export interface VoiceReferenceAssetCacheResult {
  references: VoiceReferenceHit[];
  records: ReferenceRecord[];
  warnings: string[];
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function isCloudReachableHttpUrl(url: string): boolean {
  if (!isHttpUrl(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !(
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.endsWith('.local')
    );
  } catch {
    return false;
  }
}

function mimeFromUrl(url: string): string | undefined {
  const pathname = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.gif')) return 'image/gif';
  return undefined;
}

function mergeTags(record: ReferenceRecord, tag: string): string[] {
  const tags = record.tags ?? [];
  return tags.includes(tag) ? tags : [...tags, tag];
}

function mergeHitMetadata(record: ReferenceRecord, hit: VoiceReferenceHit): ReferenceRecord {
  return {
    ...record,
    productId: record.productId ?? hit.productId,
    productCanonicalName: record.productCanonicalName ?? hit.productCanonicalName,
    referenceQuery: record.referenceQuery ?? hit.query,
    relevanceScore: hit.score ?? record.relevanceScore,
    referenceStatus: record.referenceStatus ?? hit.status,
  };
}

async function fetchRemoteImage(input: {
  url: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<{ bytes: Buffer; mime: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const res = await input.fetchImpl(input.url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const headerMime = res.headers.get('content-type')?.split(';')[0]?.trim();
    const mime =
      headerMime && headerMime.startsWith('image/')
        ? headerMime
        : mimeFromUrl(input.url);
    if (!mime || !mime.startsWith('image/')) {
      throw new Error(`not an image (${headerMime ?? 'unknown content-type'})`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > MAX_REF_BYTES) {
      throw new Error(`image exceeds ${Math.round(MAX_REF_BYTES / 1024 / 1024)} MB`);
    }
    return { bytes, mime };
  } finally {
    clearTimeout(timer);
  }
}

export async function cacheVoiceReferenceAssets(
  input: VoiceReferenceAssetCacheInput
): Promise<VoiceReferenceAssetCacheResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const upload = input.upload ?? uploadAssetToConvex;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const warnings: string[] = [];
  const recordsByInputUrl = new Map(
    input.records.map((record) => [record.previewUrl, record] as const)
  );
  const records: ReferenceRecord[] = [];
  const references: VoiceReferenceHit[] = [];

  for (const hit of input.references) {
    const originalUrl = hit.url;
    const record = recordsByInputUrl.get(originalUrl);
    if (!record) {
      references.push(hit);
      continue;
    }
    const recordWithMetadata = mergeHitMetadata(record, hit);

    if (record.assetId || !isHttpUrl(originalUrl)) {
      records.push(recordWithMetadata);
      references.push(hit);
      continue;
    }

    try {
      const downloaded = await fetchRemoteImage({ url: originalUrl, fetchImpl, timeoutMs });
      const uploaded = await upload({
        source: downloaded.bytes,
        kind: 'reference',
        mime: downloaded.mime,
        workspaceId: input.workspaceId,
        sourceUrl: originalUrl,
      });
      if (!uploaded) {
        records.push(recordWithMetadata);
        references.push(hit);
        continue;
      }

      const cachedRecord: ReferenceRecord = {
        ...recordWithMetadata,
        previewUrl: uploaded.publicUrl,
        fullUrl: uploaded.publicUrl,
        assetId: uploaded.id,
        origin: recordWithMetadata.origin ?? 'search',
        tags: mergeTags(recordWithMetadata, 'downloaded'),
        notes:
          recordWithMetadata.notes ??
          `Downloaded from image search for "${input.query}". Source: ${originalUrl}`,
      };
      records.push(cachedRecord);
      references.push({
        ...hit,
        url: isCloudReachableHttpUrl(uploaded.publicUrl)
          ? uploaded.publicUrl
          : originalUrl,
      });
    } catch (err) {
      warnings.push(
        `reference download skipped for ${originalUrl}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      records.push(recordWithMetadata);
      references.push(hit);
    }
  }

  return { references, records, warnings };
}
