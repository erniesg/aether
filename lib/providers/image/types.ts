/**
 * ImageGenProvider contract. Provider-agnostic by design — no default model
 * is hardcoded anywhere in the app. The agent loop decides which adapter to
 * call based on env config, per-request headers, or URL overrides.
 *
 * Keep this file free of adapter-specific imports. Adapters live in siblings
 * (openai.ts, gemini.ts, replicate.ts, volcengine.ts) and are wired into the
 * `resolveProvider` registry in ./registry.ts.
 */

export type AspectRatio = '1:1' | '9:16' | '16:9' | '4:3' | '3:4' | '4:5' | '2:3' | '3:2' | 'custom';

export interface ImageRef {
  url: string;
  /** 0–1; adapters that don't support weighting ignore this. */
  weight?: number;
}

/**
 * Stable identifier for an image adapter. Mirrors `KNOWN_PROVIDER_IDS` in
 * registry.ts; re-declared here so `types.ts` stays free of adapter imports.
 */
export type ImageProviderId = 'openai' | 'gemini' | 'replicate' | 'volcengine';

/**
 * How typography should be handled in the generated raster.
 * - `none`  — no baked text. Adapters inject a negative-prompt dialect.
 * - `baked` — opt-in; the model may include typography in the raster.
 * - `auto`  — defer to the model's own judgment. Adapters pass composition
 *             through without added negative-prompt tokens.
 */
export type ImageCompositionTextStrategy = 'none' | 'baked' | 'auto';

/**
 * Closed union of visual-composition constraints. Add new tokens here when
 * they ship; adapter-level `mapComposition` implementations are intentionally
 * tolerant (unknown-token warning, no throw) so older adapters keep working
 * while the union grows.
 */
export type ImageConstraintToken =
  | 'no-faces'
  | 'no-watermarks'
  | 'no-signatures'
  | 'no-unknown-brand-logos'
  | 'no-typography-artifacts'
  | 'no-nsfw-overlay-text';

export interface ImageComposition {
  textStrategy?: ImageCompositionTextStrategy;
  constraints?: ImageConstraintToken[];
}

export interface ImageGenRequest {
  prompt: string;
  refs?: ImageRef[];
  aspectRatio?: AspectRatio;
  size?: { w: number; h: number };
  seed?: number;
  style?: Record<string, unknown>;
  /** Number of candidates to return; default 1. */
  n?: number;
  /** Optional negative prompt. Adapters that don't support it ignore it. */
  negativePrompt?: string;
  /**
   * Visual-composition policy. When omitted, adapters behave identically to
   * pre-composition callers. See `applyComposition` for the shared mapping.
   */
  composition?: ImageComposition;
}

export interface ImageEditRequest extends ImageGenRequest {
  sourceUrl: string;
  maskUrl?: string;
}

export interface GeneratedImage {
  url: string;
  mimeType: string;
  width: number;
  height: number;
  /** Base64 data URL when the provider returns inline bytes instead of a hosted URL. */
  dataUrl?: string;
}

export interface ImageGenResult {
  provider: string;
  model: string;
  images: GeneratedImage[];
  latencyMs: number;
  /** Provider-specific raw payload. Retained for debugging; never rendered to users. */
  raw?: unknown;
}

export interface ImageGenProvider {
  /** Stable identifier used by the registry and URL overrides. */
  id: string;
  /** Human-readable display name. */
  displayName: string;
  /** Whether this adapter is usable in the current environment (e.g. API key present). */
  isAvailable(): boolean;
  /** Optionally list known model ids this adapter can invoke. */
  listModels(): string[];
  generate(req: ImageGenRequest, opts: { model: string }): Promise<ImageGenResult>;
  edit?(req: ImageEditRequest, opts: { model: string }): Promise<ImageGenResult>;
}

export class ProviderUnavailableError extends Error {
  constructor(providerId: string, hint?: string) {
    super(
      hint
        ? `image provider '${providerId}' is unavailable: ${hint}`
        : `image provider '${providerId}' is unavailable`
    );
    this.name = 'ProviderUnavailableError';
  }
}

export class ImageGenError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly cause?: unknown
  ) {
    super(`${providerId}: ${message}`);
    this.name = 'ImageGenError';
  }
}
