/**
 * Brand auto-ingest — shared contract.
 *
 * Creators paste a website URL, a GitHub repo, or drop a file bundle into
 * the left-rail Brand section and expect the palette / typography / voice /
 * logo / product imagery to land. Every ingest path funnels through the
 * same `BrandSnapshot` shape so the rail and downstream provenance stay
 * agnostic of which source produced it.
 */

export type BrandPaletteRole = 'primary' | 'accent' | 'neutral' | 'bg';
export type BrandTypographyRole = 'display' | 'body' | 'mono';
export type BrandLogoBackground = 'light' | 'dark' | 'either';

export interface BrandPaletteEntry {
  hex: string;
  role?: BrandPaletteRole;
}

export interface BrandTypographyEntry {
  family: string;
  role?: BrandTypographyRole;
}

export interface BrandVoice {
  samples: string[];
  tone?: string[];
}

export interface BrandLogo {
  url: string;
  background?: BrandLogoBackground;
}

export interface BrandProductImage {
  url: string;
  alt?: string;
}

export interface BrandSnapshotSource {
  kind: string;
  url?: string;
}

export interface BrandSnapshot {
  palette: BrandPaletteEntry[];
  typography: BrandTypographyEntry[];
  voice: BrandVoice;
  logos: BrandLogo[];
  productImages: BrandProductImage[];
  /** 0..1 — below 0.5, the UI surfaces a review state instead of overwriting. */
  confidence: number;
  source: BrandSnapshotSource;
}

export type BrandIngestKind = 'url' | 'repo' | 'files';

export interface BrandFilesPayload {
  /** Plain-text excerpts: about page copy, mission statements, taglines. */
  texts?: string[];
  /** Already-resolved image references (data URLs or absolute URLs). */
  images?: Array<{ url: string; alt?: string }>;
}

export type BrandIngestSource = string | BrandFilesPayload;

export interface BrandIngestRequest {
  kind: BrandIngestKind;
  source: BrandIngestSource;
}

export const BRAND_REVIEW_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Raw extraction produced by the url/repo/files parsers. Left untyped at the
 * boundary so Claude can resolve messy, partially-structured data into the
 * canonical snapshot. Treated as suggestions — the shaper is free to drop
 * noisy candidates and rank what remains.
 */
export interface BrandRawExtract {
  hexes: string[];
  families: string[];
  voiceSamples: string[];
  logoCandidates: string[];
  productImageCandidates: Array<{ url: string; alt?: string }>;
  /** Free-form context for Claude: e.g. title tag, meta description. */
  contextLines: string[];
}

export function emptyBrandRawExtract(): BrandRawExtract {
  return {
    hexes: [],
    families: [],
    voiceSamples: [],
    logoCandidates: [],
    productImageCandidates: [],
    contextLines: [],
  };
}
