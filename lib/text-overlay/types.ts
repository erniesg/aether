/**
 * Shared types for the multilingual text-overlay feature (umbrella #66).
 * T1 (#67) lands the surface; downstream slices (T2–T12) implement against
 * these shapes.
 *
 * `TextOverlayStyle` is a structural superset of `TextMaskTextStyle`
 * (lib/video/textMask.ts). Canvas-only fields (letterSpacing, lineHeight,
 * textAlign, color, background, stroke, shadow, language) are added here.
 *
 * The layer is the canonical data record. The tldraw shape that renders it
 * (T4) hydrates from `TextOverlayLayer`; placement (T5–T7) and aspect
 * fan-out (T8) read/write `AetherTextPlacement`.
 */
import type { TextMaskTextStyle } from '@/lib/video/textMask';

declare const __bcp47Brand: unique symbol;
/**
 * Branded string for BCP-47 language tags (e.g. `en`, `zh-Hans`, `pt-BR`).
 * T2 will add `asBCP47LocaleCode` / `isBCP47LocaleCode` validation helpers;
 * T1 just needs the type identity so the agent, the canvas shape, and the
 * Convex mutation agree on which string is a locale code.
 */
export type BCP47LocaleCode = string & { readonly [__bcp47Brand]: 'BCP47LocaleCode' };

/**
 * Unsafe constructor for tests, seed data, and pre-validation call sites.
 * Production call sites should go through the T2 validation helper once it
 * lands.
 */
export function asBCP47LocaleCode(value: string): BCP47LocaleCode {
  return value as BCP47LocaleCode;
}

/**
 * Aspect ratios T8 fans a hero scene out to. Mirrors the set already used in
 * canvas fan-out; declared here so `AetherTextPlacement.aspectOverrides`
 * stays typed.
 */
export type AspectRatio = '1:1' | '9:16' | '16:9' | '4:5' | '3:4' | '21:9';

export interface TextOverlayShadow {
  blur: number;
  offsetX: number;
  offsetY: number;
  color: string;
}

export interface TextOverlayStyle extends TextMaskTextStyle {
  /** Unit: em. Canvas-only; the video text-mask path ignores this. */
  letterSpacing: number;
  /** Unitless multiplier of `fontSize`. */
  lineHeight: number;
  textAlign: 'start' | 'center' | 'end' | 'justify';
  color: string;
  backgroundColor?: string;
  strokeWidth?: number;
  strokeColor?: string;
  shadow?: TextOverlayShadow;
  language: BCP47LocaleCode;
}

export interface AetherTextPlacementAnchor {
  normalizedX: number;
  normalizedY: number;
  relativeTo: 'artboard' | 'safeZone';
}

export interface AetherTextPlacement {
  mode: 'smart' | 'free';
  anchor: AetherTextPlacementAnchor;
  /** Degrees. 0 = upright. */
  rotation: number;
  /** Normalized width (0..1) of the text box relative to the anchor's frame, or `'auto'` to fit. */
  width: number | 'auto';
  /**
   * Per-aspect overrides. T8 writes these when the hero scene fans out to
   * other aspect ratios; the base placement stays authoritative for the
   * hero aspect.
   */
  aspectOverrides?: Partial<Record<AspectRatio, Partial<AetherTextPlacement>>>;
}

export interface TextOverlayProvenance {
  capabilityRunId: string;
}

/**
 * Canvas-native text layer. Stored in Convex (`textOverlay` table), hydrated
 * into a tldraw shape by T4. `content` holds one entry per translated
 * language; `activeLanguage` picks which one the shape renders.
 */
export interface TextOverlayLayer {
  id: string;
  wsId: string;
  artboardId: string;
  /** locale code → rendered string. T2 fills translations; T1 just stores. */
  content: Record<BCP47LocaleCode, string>;
  activeLanguage: BCP47LocaleCode;
  style: TextOverlayStyle;
  placement: AetherTextPlacement;
  /** `true` when T5's smart-placement engine positioned the layer. */
  smartPlacement: boolean;
  /**
   * Element ids the overlay should avoid occluding. T6 populates from
   * vision inventory; T11 exposes a UI to curate. Declared here so T6 / T11
   * drop in without a schema bump.
   */
  protectedElementIds: string[];
  createdAt: number;
  updatedAt: number;
  provenance: TextOverlayProvenance;
}

/**
 * The provenance record the agent emits after a `text-apply` run — one row
 * per call to `executeTextApply`. Shape aligns with `capabilityRun` so the
 * agent can replay the run against a different layer or aspect.
 */
export interface TextApplyCapabilityRun {
  entryRef: { kind: 'tool'; id: 'text-apply'; version: number };
  inputs: unknown;
  outputs: unknown;
  beforeSnapshotRef: string | null;
  afterSnapshotRef: string | null;
  status: 'running' | 'ok' | 'error' | 'draft-executor';
}
