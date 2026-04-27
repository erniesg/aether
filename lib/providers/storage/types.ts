/**
 * Public-storage provider contract.
 *
 * Why it exists: Meta's Instagram Graph API media-puller refuses to fetch
 * Convex storage URLs (cache-control:private + suspected User-Agent
 * filtering), so the auto-mode lap needs to STAGE hero bytes to a
 * Meta-friendly public URL before calling /{ig-user-id}/media. Other
 * platforms (LinkedIn, X) fetch our URL server-side themselves and don't
 * need staging — but having a generic adapter keeps that path clean for
 * any future "needs a public URL" requirement.
 *
 * The interface is deliberately minimal: stage(bytes, key) → public URL.
 * Implementations (R2, S3, GCS, …) live alongside this file.
 */

export interface StagedAsset {
  /** Public URL the staged asset is reachable at. Meta-fetchable. */
  publicUrl: string;
  /** Bucket-relative key the asset was written to. Useful for cleanup / dedup. */
  key: string;
  /** Bytes uploaded. */
  size: number;
  /** Provider id (e.g. 'r2'). */
  provider: string;
  /** Total wall time for the upload step. */
  latencyMs: number;
}

export interface PublicStorageProvider {
  /** Stable id for logging. */
  readonly id: string;
  /** Whether the provider has the env / credentials it needs. */
  isAvailable(): boolean;
  /**
   * Upload `bytes` under `key` (or auto-generate a key) and return a
   * public, third-party-fetchable URL. Meant for "stage me a hero so IG
   * can pull it" — not a general-purpose object store.
   *
   * Implementations MUST set Content-Type from `mimeType` and configure
   * cache headers permissive enough that downstream pullers (Meta,
   * LinkedIn, X) accept the response. Reject early on missing creds.
   */
  stage(input: {
    bytes: Buffer | Uint8Array;
    /** Optional key — if omitted the implementation generates one. */
    key?: string;
    mimeType: string;
  }): Promise<StagedAsset>;
}

/**
 * Thrown when the configured storage provider isn't available (missing
 * env vars, credentials wrong, etc.). Caller decides whether to fall
 * back to the original URL or fail the post.
 */
export class StorageUnavailableError extends Error {
  constructor(provider: string, reason: string) {
    super(`storage provider '${provider}' unavailable: ${reason}`);
    this.name = 'StorageUnavailableError';
  }
}
