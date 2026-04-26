/**
 * types.snippet.ts — Relevant type definitions for the brand-ingest skill.
 *
 * This is a skill-local copy of the relevant portions of lib/brand/types.ts.
 * Keeping it here makes the skill self-contained and avoids requiring the
 * loader to resolve repo-absolute paths.
 *
 * IMPORTANT: Keep this in sync with lib/brand/types.ts when that file changes.
 * Source of truth: lib/brand/types.ts
 */

export interface BrandPaletteEntry {
  hex: string;
  /** Optional semantic role: 'primary' | 'accent' | 'neutral' | 'bg' */
  role?: string;
}

export interface BrandTypographyEntry {
  family: string;
  /** Optional semantic role: 'display' | 'body' | 'mono' */
  role?: string;
}

export interface BrandVoice {
  samples: string[];
  tone?: string[];
}

export interface BrandLogo {
  url: string;
  /** 'light' | 'dark' | 'either' */
  background?: string;
}

export interface BrandProductImage {
  url: string;
  alt?: string;
}

export interface BrandSnapshotSource {
  kind: string;
  url?: string;
}

/**
 * The canonical brand snapshot shape.
 * The skill executor must return a value conforming to this interface wrapped
 * in { ok: true, result: BrandSnapshot }.
 */
export interface BrandSnapshot {
  palette: BrandPaletteEntry[];
  typography: BrandTypographyEntry[];
  voice: BrandVoice;
  logos: BrandLogo[];
  productImages: BrandProductImage[];
  /** Confidence score 0..1. Below 0.5 the UI surfaces a review state. */
  confidence: number;
  source: BrandSnapshotSource;
}

/** Supported brand ingest source kinds. */
export type BrandIngestKind = 'url' | 'repo' | 'files';
