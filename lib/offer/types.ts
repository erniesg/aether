/**
 * Offer auto-ingest — shared contract.
 *
 * Creators paste a product URL, drop PDF / markdown / image files, or paste
 * rich text / a URL from the clipboard into the Offer section. Every path
 * funnels through the same `OfferSnapshot` shape so the rail and downstream
 * provenance stay agnostic of which source produced it.
 */

export interface OfferPriceTier {
  label: string;
  price: string;
  period?: string;
}

export interface OfferLaunchWindow {
  startAt?: string;
  endAt?: string;
}

export interface OfferHeroImage {
  url: string;
  alt?: string;
}

export interface OfferSnapshotSource {
  kind: string;
  url?: string;
}

export interface OfferSnapshot {
  name: string;
  tagline?: string;
  /** USPs as short phrases. */
  claims: string[];
  priceTiers?: OfferPriceTier[];
  launchWindow?: OfferLaunchWindow;
  /** Testimonials, stats, review counts. */
  proof?: string[];
  heroImages: OfferHeroImage[];
  /** 0..1 — below 0.5 the UI surfaces a review state instead of applying. */
  confidence: number;
  source: OfferSnapshotSource;
}

export type OfferIngestKind = 'url' | 'files' | 'clipboard';

export interface OfferFilesPayload {
  /** Plain-text excerpts: product page copy, README blurbs, brief PDFs. */
  texts?: string[];
  /** Already-resolved image references (data URLs or absolute URLs). */
  images?: Array<{ url: string; alt?: string }>;
}

export interface OfferClipboardPayload {
  /** Pasted rich text (HTML) — preferred when creators copy from a product page. */
  html?: string;
  /** Plain-text fallback. */
  text?: string;
  /** If the clipboard held a single URL, route it as a URL ingest. */
  url?: string;
}

export type OfferIngestSource = string | OfferFilesPayload | OfferClipboardPayload;

export interface OfferIngestRequest {
  kind: OfferIngestKind;
  source: OfferIngestSource;
}

export const OFFER_REVIEW_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Raw extraction produced by the url/files/clipboard parsers. Left loose at the
 * boundary so Claude can resolve messy partial data into the canonical
 * snapshot; the shaper is free to drop noisy candidates.
 */
export interface OfferRawExtract {
  name?: string;
  tagline?: string;
  claims: string[];
  priceCandidates: OfferPriceTier[];
  launchWindow?: OfferLaunchWindow;
  proofCandidates: string[];
  heroImageCandidates: Array<{ url: string; alt?: string }>;
  /** Free-form context for Claude: title tag, meta description, schema.org blobs. */
  contextLines: string[];
}

export function emptyOfferRawExtract(): OfferRawExtract {
  return {
    claims: [],
    priceCandidates: [],
    proofCandidates: [],
    heroImageCandidates: [],
    contextLines: [],
  };
}
