/**
 * Spatial provider contract. Provider-agnostic by design — no default splat
 * model or runtime is hardcoded anywhere in the app. Adapters live in
 * siblings (`replicate.ts`, `modal.ts`) and are wired into the registry in
 * `./registry.ts`.
 *
 * The current execution primitive is `splat-from-image`: a single hero image
 * is lifted into a 3D Gaussian-splat asset (plus an optional rendered preview
 * for canvas display). Other spatial modes (text-to-splat, mesh-from-image)
 * slot into the same contract without churn.
 */

export type SpatialMode = 'splat-from-image';

/**
 * Container format of the generated splat asset. Canvas rendering picks a
 * viewer based on this field; providers self-report rather than the caller
 * guessing from URL suffix.
 */
export type SpatialFormat = 'ply' | 'splat' | 'ksplat';

export const KNOWN_SPATIAL_PROVIDER_IDS = [
  'replicate-splat',
  'modal-splat',
] as const;
export type SpatialProviderId = (typeof KNOWN_SPATIAL_PROVIDER_IDS)[number];

export interface SpatialRequest {
  sourceUrl: string;
  mode: SpatialMode;
  /** Optional text hint; most image-to-splat models ignore this. */
  prompt?: string;
  seed?: number;
  size?: { w: number; h: number };
}

export interface SpatialResult {
  provider: SpatialProviderId;
  model: string;
  /** URL to the raw splat asset (format described in `format`). */
  splatUrl: string;
  /**
   * Optional preview video or gif the canvas can render as a thumbnail before
   * a 3D viewer is wired up. Providers that can't produce one omit it.
   */
  previewUrl?: string;
  format: SpatialFormat;
  /** Optional count of gaussians in the produced asset, when reported. */
  gaussianCount?: number;
  /** Provider-specific raw payload. Retained for debugging; never rendered to users. */
  raw?: unknown;
}

export interface SpatialProviderStatus {
  id: SpatialProviderId;
  displayName: string;
  models: string[];
  supportsImageToSplat: boolean;
  supportsTextPrompt: boolean;
  available: boolean;
  unavailableReason?: string;
}

export interface SpatialProvider {
  id: SpatialProviderId;
  displayName: string;
  supportsImageToSplat: boolean;
  supportsTextPrompt: boolean;
  isAvailable(): boolean;
  getAvailabilityIssue(): string | undefined;
  listModels(): string[];
  generate(req: SpatialRequest, opts: { model: string }): Promise<SpatialResult>;
}

export class SpatialUnavailableError extends Error {
  constructor(providerId: string, hint?: string) {
    super(
      hint
        ? `spatial provider '${providerId}' is unavailable: ${hint}`
        : `spatial provider '${providerId}' is unavailable`
    );
    this.name = 'SpatialUnavailableError';
  }
}

export class SpatialError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly cause?: unknown
  ) {
    super(`${providerId}: ${message}`);
    this.name = 'SpatialError';
  }
}
