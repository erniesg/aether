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

export type ReferenceKind = 'image' | 'video' | 'embed' | 'template' | 'element';
export type ReferenceOrigin = 'ingest' | 'upload' | 'search' | 'generated' | 'manual';
export type ReferenceStatus = 'candidate' | 'selected' | 'rejected';

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
  /** Creator-editable label used in rails, clustering, and prompt context. */
  title?: string;
  /** How this material should influence generation. */
  usageIntent?: string;
  /** Creator tags for grouping and shortlisting. */
  tags?: string[];
  /** Creator notes that travel with the reference. */
  notes?: string;
  /** Optional shortlist / cluster id once references are grouped. */
  clusterId?: string;
  /** Convex asset row id when the underlying bytes were stored durably. */
  assetId?: string;
  /** How this library item entered the workspace. */
  origin?: ReferenceOrigin;
  /** Client run id that produced this asset, when generated in the canvas. */
  sourceRunId?: string;
  /** Campaign/lap id that produced this asset, when applicable. */
  sourceCampaignId?: string;
  /** Format/artboard identifier for generated multi-format outputs. */
  sourceFormatId?: string;
  /** Product scope used by voice/reference search so stale refs do not leak into a new brief. */
  productId?: string;
  /** Human-readable product name paired with productId for prompt/debug surfaces. */
  productCanonicalName?: string;
  /** Query that discovered this reference candidate. */
  referenceQuery?: string;
  /** Normalized 0..1 visual/text relevance score for product-scoped selection. */
  relevanceScore?: number;
  /** Candidate lifecycle. Only selected refs are promoted into the active creator library. */
  referenceStatus?: ReferenceStatus;
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
