/**
 * ReferenceProvider contract — adapters for ingesting reference material from
 * public URLs (Pinterest pins, IG posts, XHS notes, TikTok shares, etc.) and
 * surfacing them as a uniform `ReferenceRecord` the canvas can consume.
 *
 * Each adapter lives in its own file (pinterest.ts, instagram.ts, xhs.ts,
 * tiktok.ts, generic.ts) and is wired into `./registry.ts`. Contract:
 *   - `canHandle(url)` is a pure URL shape check; cheap, no network
 *   - `fetch(url, { fetcher })` performs the actual scrape and returns a record
 *
 * Strictly public endpoints + OG metadata; no login-gated scraping.
 */

export type ReferenceKind = 'image' | 'video' | 'embed';

export interface ReferenceAttribution {
  /** Adapter id ('pinterest' / 'instagram' / 'xhs' / 'tiktok' / 'generic' / 'upload'). */
  source: string;
  /** Scraped author handle when available. */
  author?: string;
  /** Canonical URL back to the source page — always preserved for attribution. */
  url: string;
}

export interface ReferenceRecord {
  id: string;
  kind: ReferenceKind;
  /** URL renderable as <img src>. For video kind, this is the thumbnail. */
  previewUrl: string;
  /** Optional full-resolution / source-page URL. */
  fullUrl?: string;
  attribution: ReferenceAttribution;
  /** ISO timestamp when the record was captured. */
  capturedAt: string;
}

export type ReferenceFetcher = typeof fetch;

export interface ReferenceFetchOptions {
  /** Overridable fetcher — tests inject a fixture fetch. */
  fetcher?: ReferenceFetcher;
}

export interface ReferenceProvider {
  /** Stable adapter id; matches `attribution.source`. */
  id: string;
  /** Pure URL-shape predicate. No network, no surprise. */
  canHandle(url: string): boolean;
  /** Perform the scrape and normalise into a `ReferenceRecord`. */
  fetch(url: string, opts?: ReferenceFetchOptions): Promise<ReferenceRecord>;
}

export class ReferenceIngestError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly cause?: unknown
  ) {
    super(`${providerId}: ${message}`);
    this.name = 'ReferenceIngestError';
  }
}
