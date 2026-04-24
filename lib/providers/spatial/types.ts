/**
 * Spatial provider contract. Provider-agnostic by design — no default splat
 * model or runtime is hardcoded anywhere in the app. Adapters live in
 * siblings (`draft.ts`, `replicate.ts`, `modal.ts`) and are wired into the
 * registry in `./registry.ts`.
 *
 * Two artifact families share this contract:
 *
 *   - `particle-field` / `gaussian-splat` previews — a 2D preview image the
 *     canvas can render as a thumbnail before a 3D viewer is wired up.
 *   - Real splat assets (`ply` / `splat` / `ksplat`) — optional `sceneUrl`
 *     for production providers that return the underlying 3D asset.
 */

export const KNOWN_SPATIAL_PROVIDER_IDS = [
  'draft',
  'replicate-splat',
  'modal-splat',
] as const;

export type SpatialProviderId = (typeof KNOWN_SPATIAL_PROVIDER_IDS)[number];
export type SpatialFormat = 'particle-field' | 'gaussian-splat';
export type SpatialSceneFormat = 'ply' | 'splat' | 'ksplat';
export type SpatialQuality = 'draft' | 'standard' | 'high';

export interface SpatialBuildRequest {
  sourceUrl: string;
  width: number;
  height: number;
  prompt?: string;
  format: SpatialFormat;
  quality?: SpatialQuality;
  seed?: number;
}

export interface SpatialSceneSpec {
  kind: SpatialFormat;
  pointCount: number;
  sourceUrl: string;
  prompt?: string;
}

export interface SpatialBuildResult {
  provider: SpatialProviderId;
  model: string;
  format: SpatialFormat;
  previewImageUrl: string;
  sceneSpec: SpatialSceneSpec;
  latencyMs: number;
  /** URL to the raw splat asset when a production provider returns one. */
  sceneUrl?: string;
  /** Container format of `sceneUrl` when present. */
  sceneFormat?: SpatialSceneFormat;
  /** Optional count of gaussians in the produced asset, when reported. */
  gaussianCount?: number;
  raw?: unknown;
}

export interface SpatialProviderStatus {
  id: SpatialProviderId;
  displayName: string;
  models: string[];
  available: boolean;
  unavailableReason?: string;
  supportsImageToSplat?: boolean;
  supportsTextPrompt?: boolean;
}

export interface SpatialProvider {
  id: SpatialProviderId;
  displayName: string;
  supportsImageToSplat?: boolean;
  supportsTextPrompt?: boolean;
  isAvailable(): boolean;
  getAvailabilityIssue(): string | undefined;
  listModels(): string[];
  build(req: SpatialBuildRequest, opts: { model: string }): Promise<SpatialBuildResult>;
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

export class SpatialBuildError extends Error {
  constructor(
    message: string,
    readonly providerId: string
  ) {
    super(message);
    this.name = 'SpatialBuildError';
  }
}
