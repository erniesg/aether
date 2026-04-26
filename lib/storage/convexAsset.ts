/**
 * Server-side helper that uploads bytes to Convex File Storage and returns
 * a public, fetchable CDN URL. The crux fix for the auto-mode demo blocker:
 * gpt-image-2 returns heroes as `data:image/png;base64,…`, but SAM3 (Modal,
 * external) needs a URL it can GET. Same goes for ingested logos / product
 * cutouts.
 *
 * Three-step Convex upload dance:
 *   1. mutation `assets:generateUploadUrl` → signed POST URL
 *   2. fetch POST → { storageId }
 *   3. mutation `assets:recordUploadedAsset` → { id, publicUrl }
 *
 * Fail-soft: when Convex isn't configured (NEXT_PUBLIC_CONVEX_URL absent)
 * the helper returns `null` so the caller can fall back to the data URL.
 * Net effect: SAM3 still skips, but the lap doesn't crash.
 */

import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

export type AssetKind =
  | 'hero'
  | 'logo'
  | 'product'
  | 'reference'
  | 'mask'
  | 'cutout'
  | 'other';

export interface UploadAssetInput {
  /** A `data:<mime>;base64,…` URL or a Buffer of raw bytes. */
  source: string | Buffer | Uint8Array;
  kind: AssetKind;
  /** Optional explicit MIME (sniffed from data URL if not given). */
  mime?: string;
  /** Optional workspace doc id (NOT a free string — must be Convex _id). */
  wsId?: string;
  /** Optional campaign doc id for cross-link. */
  campaignId?: string;
  /** Free-form lineage hint — what this asset was derived from
   *  (e.g. "https://eightsleep.com/", "auto-mode hero render"). */
  sourceUrl?: string;
  /** Source dimensions when known (skipped: auto-mode hero is 1024² by default). */
  width?: number;
  height?: number;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
  /** Override for tests. */
  client?: ConvexHttpClient;
}

export interface UploadedAsset {
  id: string;
  publicUrl: string;
  storageId: string;
  bytes: number;
  mime: string;
}

const assetsApi = (anyApi as unknown as {
  assets: {
    generateUploadUrl: unknown;
    recordUploadedAsset: unknown;
  };
}).assets;

/**
 * Upload bytes (or decode a data URL) to Convex File Storage and persist
 * the asset row. Returns null when Convex is not provisioned — caller
 * decides whether to fall back to the original data URL.
 */
export async function uploadAssetToConvex(
  input: UploadAssetInput
): Promise<UploadedAsset | null> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    // eslint-disable-next-line no-console
    console.warn(
      '[storage/convexAsset] NEXT_PUBLIC_CONVEX_URL not set — cannot upload; returning null'
    );
    return null;
  }
  const fetchFn = input.fetchImpl ?? fetch;
  const client = input.client ?? buildClient(url);

  // Resolve bytes + mime
  const { bytes, mime } = decodeSource(input);

  // Step 1: signed POST URL.
  let uploadUrl: string;
  try {
    uploadUrl = (await client.mutation(
      assetsApi.generateUploadUrl as never,
      {} as never
    )) as string;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[storage/convexAsset] generateUploadUrl failed', err);
    return null;
  }

  // Step 2: POST the bytes. Convex returns { storageId }.
  let storageId: string;
  try {
    // Cast to BodyInit; Node's fetch accepts Buffer/Uint8Array but the DOM
    // typings don't expose that overload by default.
    const uploadBody = new Uint8Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength
    );
    const r = await fetchFn(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': mime },
      body: uploadBody as unknown as BodyInit,
    });
    if (!r.ok) {
      // eslint-disable-next-line no-console
      console.error(
        `[storage/convexAsset] upload POST returned HTTP ${r.status}`
      );
      return null;
    }
    const body = (await r.json()) as { storageId?: string };
    if (!body.storageId) {
      // eslint-disable-next-line no-console
      console.error(
        '[storage/convexAsset] upload POST response missing storageId',
        body
      );
      return null;
    }
    storageId = body.storageId;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[storage/convexAsset] upload POST failed', err);
    return null;
  }

  // Step 3: persist + get public URL.
  try {
    const result = (await client.mutation(assetsApi.recordUploadedAsset as never, {
      storageId,
      kind: input.kind,
      mime,
      wsId: input.wsId,
      campaignId: input.campaignId,
      sourceUrl: input.sourceUrl,
      width: input.width,
      height: input.height,
      bytes: bytes.byteLength,
    } as never)) as { id: string; publicUrl: string };
    return {
      id: result.id,
      publicUrl: result.publicUrl,
      storageId,
      bytes: bytes.byteLength,
      mime,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[storage/convexAsset] recordUploadedAsset failed', err);
    return null;
  }
}

function buildClient(url: string): ConvexHttpClient {
  const c = new ConvexHttpClient(url);
  const key = process.env.CONVEX_DEPLOY_KEY;
  if (key && key.length > 0) {
    const w = c as unknown as { setAdminAuth?: (k: string) => void };
    if (typeof w.setAdminAuth === 'function') w.setAdminAuth(key);
  }
  return c;
}

function decodeSource(input: UploadAssetInput): { bytes: Buffer; mime: string } {
  if (typeof input.source === 'string') {
    if (!input.source.startsWith('data:')) {
      throw new Error(
        '[storage/convexAsset] string source must be a data: URL'
      );
    }
    const commaIdx = input.source.indexOf(',');
    if (commaIdx <= 5) {
      throw new Error('[storage/convexAsset] malformed data URL');
    }
    const header = input.source.slice(5, commaIdx);
    const sniffedMime = header.split(';', 1)[0] || 'application/octet-stream';
    const isBase64 = header.includes(';base64');
    const payload = input.source.slice(commaIdx + 1);
    const bytes = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf-8');
    return { bytes, mime: input.mime ?? sniffedMime };
  }
  const bytes = Buffer.isBuffer(input.source)
    ? input.source
    : Buffer.from(input.source);
  return { bytes, mime: input.mime ?? 'application/octet-stream' };
}

export function isDataUrl(url: string | undefined): url is string {
  return typeof url === 'string' && url.startsWith('data:');
}
