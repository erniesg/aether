/**
 * Cloudflare R2 public-storage adapter.
 *
 * Why this exists: Meta's Instagram Graph API media-puller rejects Convex
 * storage URLs ("media URI doesn't meet our requirements"). The fix is
 * to stage hero bytes onto a public bucket where Meta's puller can fetch
 * cleanly — R2 is the natural choice since aether already runs on
 * Cloudflare (Workers via @opennextjs/cloudflare).
 *
 * Auth path: S3-compatible HTTP API + AWS SigV4 via aws4fetch. Works
 * identically in Node (next dev) and Workers (production deploy) — no
 * code split between runtimes.
 *
 * Required env (set in .env.local + wrangler.toml secrets):
 *   R2_ACCOUNT_ID         Cloudflare account id
 *   R2_ACCESS_KEY_ID      R2 API token: Access Key ID
 *   R2_SECRET_ACCESS_KEY  R2 API token: Secret Access Key
 *   R2_BUCKET             bucket name (e.g. "aether-public")
 *   R2_PUBLIC_BASE_URL    public URL prefix (e.g. "https://pub-<hash>.r2.dev"
 *                         OR a custom domain bound to the bucket).
 *                         The bucket MUST have public access enabled (R2
 *                         dashboard → Settings → Public access → Allow
 *                         Access via Public URL) — otherwise Meta's
 *                         puller still gets a 401.
 *
 * Wired by lib/providers/publisher/instagram.ts: when the IG publisher
 * receives a Convex storage URL, it fetches the bytes, stages them via
 * this adapter, and passes the resulting R2 public URL to /{ig-user-id}/media.
 */

import { AwsClient } from 'aws4fetch';
import type {
  PublicStorageProvider,
  StagedAsset,
} from './types';
import { StorageUnavailableError } from './types';

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
}

function readR2ConfigFromEnv(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  // Trim a trailing slash from the public URL prefix so we can join with
  // a leading-slash key without doubling.
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ''),
  };
}

/**
 * Generate a key under `aether-staged/<yyyy-mm-dd>/<random>.<ext>` —
 * date-prefixed so we can lifecycle-expire old objects without scanning
 * the whole bucket, random-suffixed so identical bytes from different
 * laps don't collide.
 */
function defaultKey(mimeType: string): string {
  const ext =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/jpeg'
        ? 'jpg'
        : mimeType === 'image/webp'
          ? 'webp'
          : 'bin';
  const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `aether-staged/${today}/${ts}-${rand}.${ext}`;
}

export interface CreateR2StorageOptions {
  /** Inject for tests. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Override env-derived config (tests). */
  config?: R2Config;
}

export function createR2Storage(
  opts: CreateR2StorageOptions = {}
): PublicStorageProvider {
  const config = opts.config ?? readR2ConfigFromEnv();

  return {
    id: 'r2',
    isAvailable(): boolean {
      return config !== null;
    },
    async stage({
      bytes,
      key: providedKey,
      mimeType,
    }): Promise<StagedAsset> {
      if (!config) {
        throw new StorageUnavailableError(
          'r2',
          'missing one of R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_PUBLIC_BASE_URL'
        );
      }

      const key = providedKey ?? defaultKey(mimeType);

      // R2's S3-compatible endpoint: <account>.r2.cloudflarestorage.com.
      // The bucket name goes in the path (S3 path-style), not the host.
      const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${encodeURIComponent(key)}`;

      const aws = new AwsClient({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        // Cloudflare's docs use 'auto' for R2's region in SigV4.
        region: 'auto',
        service: 's3',
      });

      const t0 = Date.now();
      const fetchImpl = opts.fetch ?? globalThis.fetch;
      const body =
        bytes instanceof Uint8Array && !(bytes instanceof Buffer)
          ? bytes
          : new Uint8Array(bytes);

      const signed = await aws.sign(endpoint, {
        method: 'PUT',
        body,
        headers: {
          'Content-Type': mimeType,
          // Permissive cache header so Meta / LinkedIn / X pullers don't
          // get refused with cache-control: private (the original sin
          // that broke IG with Convex URLs).
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });

      const res = await fetchImpl(signed.url, {
        method: signed.method,
        headers: signed.headers,
        body: signed.body,
      });
      const latencyMs = Date.now() - t0;

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `r2 PUT ${key} → HTTP ${res.status}: ${text.slice(0, 400)}`
        );
      }

      const publicUrl = `${config.publicBaseUrl}/${encodeURI(key)}`;
      return {
        publicUrl,
        key,
        size: body.byteLength,
        provider: 'r2',
        latencyMs,
      };
    },
  };
}

/**
 * Cached singleton — created lazily on first call, re-used for the
 * lifetime of the runtime. Reset by deleting the env vars and calling
 * `resetR2StorageForTests()` (test-only).
 */
let cached: PublicStorageProvider | null = null;

export function getR2Storage(): PublicStorageProvider {
  if (!cached) cached = createR2Storage();
  return cached;
}

export function resetR2StorageForTests(): void {
  cached = null;
}
